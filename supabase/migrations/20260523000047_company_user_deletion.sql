-- Snapshots for deleted users on work reports + reassignment helper for GBA user deletion.

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS created_by_user_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_user_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS assigned_user_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS author_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS author_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_company_user_deletion_impact(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  target RECORD;
BEGIN
  IF NOT public.is_global_admin() OR NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin voi tarkistaa käyttäjän poiston';
  END IF;

  SELECT id, display_name, email, role, company_id
  INTO target
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND OR target.company_id IS DISTINCT FROM cid THEN
    RAISE EXCEPTION 'Käyttäjää ei löydy yrityksestä';
  END IF;

  IF target.role = 'customer' THEN
    RAISE EXCEPTION 'Asiakaskäyttäjiä ei voi poistaa tästä';
  END IF;

  RETURN json_build_object(
    'user_id', target.id,
    'display_name', target.display_name,
    'email', target.email,
    'role', target.role,
    'as_creator', (
      SELECT COUNT(*)::INT
      FROM work_reports
      WHERE created_by_user_id = p_user_id
    ),
    'as_assignee', (
      SELECT COUNT(*)::INT
      FROM work_reports
      WHERE assigned_user_id = p_user_id
    ),
    'daily_logs', (
      SELECT COUNT(*)::INT
      FROM work_report_daily_logs
      WHERE created_by = p_user_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_company_user_deletion(
  p_user_id UUID,
  p_company_id UUID,
  p_transfer_to_user_id UUID DEFAULT NULL
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

  IF target.role = 'admin' AND public.count_company_admins(p_company_id) <= 1 THEN
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

GRANT EXECUTE ON FUNCTION public.get_company_user_deletion_impact(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_company_user_deletion(UUID, UUID, UUID) TO service_role;
