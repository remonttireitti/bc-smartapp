-- GBA: preview and hard-delete a tenant (users + cascaded business data).

CREATE OR REPLACE FUNCTION public.prepare_company_user_deletion(
  p_user_id UUID,
  p_company_id UUID,
  p_transfer_to_user_id UUID DEFAULT NULL,
  p_allow_last_admin BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target RECORD;
  transfer RECORD;
  target_name TEXT;
  creator_count INT;
  assignee_count INT;
  log_count INT;
BEGIN
  SELECT id, display_name, email, role, company_id
  INTO target
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND OR target.company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Käyttäjää ei löydy yrityksestä';
  END IF;

  IF target.role = 'customer' THEN
    RAISE EXCEPTION 'Asiakaskäyttäjiä ei voi poistaa tästä';
  END IF;

  IF NOT p_allow_last_admin
    AND target.role = 'admin'
    AND public.count_company_admins(p_company_id) <= 1
  THEN
    RAISE EXCEPTION 'Yrityksellä pitää olla vähintään yksi ylläpitäjä';
  END IF;

  target_name := COALESCE(NULLIF(trim(target.display_name), ''), target.email, 'Poistettu käyttäjä');

  SELECT COUNT(*)::INT INTO creator_count FROM work_reports WHERE created_by_user_id = p_user_id;
  SELECT COUNT(*)::INT INTO assignee_count FROM work_reports WHERE assigned_user_id = p_user_id;
  SELECT COUNT(*)::INT INTO log_count FROM work_report_daily_logs WHERE created_by = p_user_id;

  IF p_transfer_to_user_id IS NOT NULL THEN
    SELECT id, company_id, display_name, email
    INTO transfer
    FROM profiles
    WHERE id = p_transfer_to_user_id;

    IF NOT FOUND OR transfer.company_id IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION 'Korvaavaa käyttäjää ei löydy yrityksestä';
    END IF;

    IF transfer.id = p_user_id THEN
      RAISE EXCEPTION 'Valitse eri käyttäjä korvaajaksi';
    END IF;

    UPDATE work_reports
    SET
      created_by_user_id = p_transfer_to_user_id,
      created_by_user_name_snapshot = NULL,
      created_by_user_deleted = false
    WHERE created_by_user_id = p_user_id;

    UPDATE work_reports
    SET
      assigned_user_id = p_transfer_to_user_id,
      assigned_user_name_snapshot = NULL,
      assigned_user_deleted = false
    WHERE assigned_user_id = p_user_id;

    UPDATE work_report_daily_logs
    SET
      created_by = p_transfer_to_user_id,
      author_name_snapshot = NULL,
      author_deleted = false
    WHERE created_by = p_user_id;

    UPDATE maintenance_reports
    SET assigned_user_id = p_transfer_to_user_id
    WHERE assigned_user_id = p_user_id;
  ELSE
    UPDATE work_reports
    SET
      created_by_user_name_snapshot = COALESCE(created_by_user_name_snapshot, target_name),
      created_by_user_deleted = true
    WHERE created_by_user_id = p_user_id;

    UPDATE work_reports
    SET
      assigned_user_name_snapshot = COALESCE(assigned_user_name_snapshot, target_name),
      assigned_user_deleted = true
    WHERE assigned_user_id = p_user_id;

    UPDATE work_report_daily_logs
    SET
      author_name_snapshot = COALESCE(author_name_snapshot, target_name),
      author_deleted = true
    WHERE created_by = p_user_id;
  END IF;

  RETURN json_build_object(
    'display_name', target_name,
    'as_creator', creator_count,
    'as_assignee', assignee_count,
    'daily_logs', log_count,
    'transferred', p_transfer_to_user_id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_company_deletion_preview(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_row RECORD;
  user_count INT;
  data_rows INT;
  user_emails JSON;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin voi tarkistaa yrityksen poiston';
  END IF;

  SELECT id, name, slug
  INTO company_row
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yritystä ei löydy';
  END IF;

  SELECT COUNT(*)::INT, COALESCE(json_agg(p.email ORDER BY p.email) FILTER (WHERE p.email IS NOT NULL), '[]'::json)
  INTO user_count, user_emails
  FROM public.profiles p
  WHERE p.company_id = p_company_id;

  SELECT
    (SELECT COUNT(*)::INT FROM work_reports WHERE owner_company_id = p_company_id)
    + (SELECT COUNT(*)::INT FROM maintenance_reports WHERE owner_company_id = p_company_id)
    + (SELECT COUNT(*)::INT FROM customers WHERE owner_company_id = p_company_id)
    + (SELECT COUNT(*)::INT FROM quote_requests WHERE owner_company_id = p_company_id)
  INTO data_rows;

  RETURN json_build_object(
    'company_id', company_row.id,
    'name', company_row.name,
    'slug', company_row.slug,
    'user_count', user_count,
    'user_emails', user_emails,
    'data_row_count', data_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.global_admin_delete_company(
  p_company_id UUID,
  p_confirm_slug TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  company_row RECORD;
  confirm_slug TEXT;
  profile_row RECORD;
  deleted_users INT := 0;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin voi poistaa yrityksiä';
  END IF;

  SELECT id, name, slug
  INTO company_row
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yritystä ei löydy';
  END IF;

  confirm_slug := lower(trim(coalesce(p_confirm_slug, '')));
  IF confirm_slug = '' OR confirm_slug <> company_row.slug THEN
    RAISE EXCEPTION 'Vahvista poisto kirjoittamalla yrityksen tunniste (slug): %', company_row.slug;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE company_id = p_company_id AND id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Et voi poistaa yritystä, johon olet kirjautuneena. Vaihda yritystä tai käytä toista GBA-tiliä.';
  END IF;

  FOR profile_row IN
    SELECT id, role
    FROM public.profiles
    WHERE company_id = p_company_id
    ORDER BY role = 'admin' DESC, email
  LOOP
    IF profile_row.role <> 'customer' THEN
      PERFORM public.prepare_company_user_deletion(
        profile_row.id,
        p_company_id,
        NULL,
        true
      );
    END IF;
  END LOOP;

  DELETE FROM auth.users
  WHERE id IN (
    SELECT id FROM public.profiles WHERE company_id = p_company_id
  );

  GET DIAGNOSTICS deleted_users = ROW_COUNT;

  DELETE FROM public.companies
  WHERE id = p_company_id;

  RETURN json_build_object(
    'ok', true,
    'company_id', company_row.id,
    'name', company_row.name,
    'slug', company_row.slug,
    'deleted_users', deleted_users
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_company_user_deletion(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_company_user_deletion(UUID, UUID, UUID, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.global_admin_company_deletion_preview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_company_deletion_preview(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.global_admin_delete_company(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_delete_company(UUID, TEXT) TO authenticated;
