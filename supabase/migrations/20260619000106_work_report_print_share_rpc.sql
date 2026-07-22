-- Luotetaan tulostelinkin luontiin SECURITY DEFINER -funktion kautta (RLS-ongelmien välttämiseksi)

CREATE OR REPLACE FUNCTION public.ensure_work_report_print_share(p_work_report_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := public.current_company_id();
  v_token TEXT;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Profiilista puuttuu yritys.';
  END IF;

  IF NOT public.can_manage_work_report_print_share(p_work_report_id) THEN
    RAISE EXCEPTION 'Sinulla ei ole oikeutta luoda tulostelinkkiä tähän työraporttiin.';
  END IF;

  INSERT INTO work_report_print_shares (work_report_id, company_id, enabled, created_by)
  VALUES (p_work_report_id, v_company_id, true, auth.uid())
  ON CONFLICT (work_report_id) DO UPDATE
    SET enabled = true,
        company_id = EXCLUDED.company_id,
        created_by = COALESCE(work_report_print_shares.created_by, EXCLUDED.created_by)
  RETURNING access_token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_work_report_print_share(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_work_report_print_share(UUID) TO authenticated;
