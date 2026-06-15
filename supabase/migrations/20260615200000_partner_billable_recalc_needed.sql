-- Kumppanilaskelma merkitään vanhentuneeksi aina kun työkirjaus muuttuu (myös toimeksisaajan kirjaus).

ALTER TABLE work_report_billable
  ADD COLUMN IF NOT EXISTS partner_recalc_needed BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_billable_partner_work_report(p_work_report_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM work_reports w
    WHERE w.id = p_work_report_id
      AND (
        w.created_by_company_id <> w.owner_company_id
        OR w.delegate_company_id IS NOT NULL
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_partner_billable_recalc_needed(p_work_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_work_report_id IS NULL OR NOT public.is_billable_partner_work_report(p_work_report_id) THEN
    RETURN;
  END IF;

  INSERT INTO work_report_billable (work_report_id, partner_recalc_needed)
  VALUES (p_work_report_id, true)
  ON CONFLICT (work_report_id) DO UPDATE
  SET partner_recalc_needed = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_mark_partner_billable_recalc_from_daily_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.mark_partner_billable_recalc_needed(COALESCE(NEW.work_report_id, OLD.work_report_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_mark_partner_billable_recalc_from_daily_log_child()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work_report_id UUID;
BEGIN
  SELECT dl.work_report_id
  INTO v_work_report_id
  FROM work_report_daily_logs dl
  WHERE dl.id = COALESCE(NEW.daily_log_id, OLD.daily_log_id);

  PERFORM public.mark_partner_billable_recalc_needed(v_work_report_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS work_report_daily_logs_mark_partner_billable_recalc ON work_report_daily_logs;
CREATE TRIGGER work_report_daily_logs_mark_partner_billable_recalc
  AFTER INSERT OR UPDATE OR DELETE ON work_report_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_partner_billable_recalc_from_daily_log();

DROP TRIGGER IF EXISTS work_report_daily_trip_legs_mark_partner_billable_recalc ON work_report_daily_trip_legs;
CREATE TRIGGER work_report_daily_trip_legs_mark_partner_billable_recalc
  AFTER INSERT OR UPDATE OR DELETE ON work_report_daily_trip_legs
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_partner_billable_recalc_from_daily_log_child();

DROP TRIGGER IF EXISTS work_report_daily_expense_lines_mark_partner_billable_recalc ON work_report_daily_expense_lines;
CREATE TRIGGER work_report_daily_expense_lines_mark_partner_billable_recalc
  AFTER INSERT OR UPDATE OR DELETE ON work_report_daily_expense_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_partner_billable_recalc_from_daily_log_child();

GRANT EXECUTE ON FUNCTION public.mark_partner_billable_recalc_needed(UUID) TO authenticated;
