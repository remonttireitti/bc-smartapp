-- Daily work logs + report author tracking

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE TABLE work_report_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
  expenses NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (expenses >= 0),
  work_done TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_logs_report ON work_report_daily_logs(work_report_id);
CREATE INDEX idx_daily_logs_date ON work_report_daily_logs(log_date DESC);

CREATE TRIGGER work_report_daily_logs_updated_at
  BEFORE UPDATE ON work_report_daily_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE work_report_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_report_daily_logs_select ON work_report_daily_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
  );

CREATE POLICY work_report_daily_logs_insert ON work_report_daily_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_report_daily_logs_update ON work_report_daily_logs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_report_daily_logs_delete ON work_report_daily_logs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );
