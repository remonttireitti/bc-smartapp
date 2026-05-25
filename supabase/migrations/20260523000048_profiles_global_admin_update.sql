-- Allow global admin to update any profile (name, company, etc.)

DROP POLICY IF EXISTS profiles_global_admin_update ON profiles;
CREATE POLICY profiles_global_admin_update ON profiles FOR UPDATE
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Käyttäjää ei löydy';
  END IF;

  IF NOT public.is_global_admin() AND target.company_id IS DISTINCT FROM cid THEN
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
