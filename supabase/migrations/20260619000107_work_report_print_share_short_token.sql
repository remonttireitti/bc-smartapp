-- Lyhyempi tulostelinkki laskujen merkkirajoituksiin (esim. ~75 merkkiä)

CREATE OR REPLACE FUNCTION public.generate_work_report_print_share_short_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_token := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM work_report_print_shares WHERE short_token = v_token
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 30 THEN
      RAISE EXCEPTION 'Lyhyen jakotunnuksen luonti epäonnistui';
    END IF;
  END LOOP;
  RETURN v_token;
END;
$$;

ALTER TABLE work_report_print_shares
  ADD COLUMN IF NOT EXISTS short_token TEXT;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM work_report_print_shares WHERE short_token IS NULL LOOP
    UPDATE work_report_print_shares
    SET short_token = public.generate_work_report_print_share_short_token()
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE work_report_print_shares
  ALTER COLUMN short_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS work_report_print_shares_short_token_uidx
  ON work_report_print_shares (short_token);

CREATE INDEX IF NOT EXISTS work_report_print_shares_short_token_idx
  ON work_report_print_shares (short_token)
  WHERE enabled;

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

  INSERT INTO work_report_print_shares (work_report_id, company_id, enabled, created_by, short_token)
  VALUES (
    p_work_report_id,
    v_company_id,
    true,
    auth.uid(),
    public.generate_work_report_print_share_short_token()
  )
  ON CONFLICT (work_report_id) DO UPDATE
    SET enabled = true,
        company_id = EXCLUDED.company_id,
        created_by = COALESCE(work_report_print_shares.created_by, EXCLUDED.created_by),
        short_token = COALESCE(
          work_report_print_shares.short_token,
          public.generate_work_report_print_share_short_token()
        )
  RETURNING short_token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_work_report_print_share_short_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_work_report_print_share_short_token() TO authenticated;
