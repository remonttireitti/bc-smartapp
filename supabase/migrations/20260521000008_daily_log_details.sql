-- Rich daily logs: hour types, commission, expense lines

CREATE TYPE daily_hour_entry_type AS ENUM (
  'regular',
  'overtime',
  'regular_and_overtime',
  'on_call',
  'fixed_price'
);

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS entry_type daily_hour_entry_type NOT NULL DEFAULT 'regular_and_overtime',
  ADD COLUMN IF NOT EXISTS hours_regular NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (hours_regular >= 0),
  ADD COLUMN IF NOT EXISTS hours_overtime NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (hours_overtime >= 0),
  ADD COLUMN IF NOT EXISTS hours_on_call NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (hours_on_call >= 0),
  ADD COLUMN IF NOT EXISTS fixed_price_amount NUMERIC(12,2) CHECK (fixed_price_amount IS NULL OR fixed_price_amount >= 0),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  ADD COLUMN IF NOT EXISTS commission_note TEXT;

-- Migrate legacy columns if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_report_daily_logs' AND column_name = 'hours'
  ) THEN
    UPDATE work_report_daily_logs
    SET hours_regular = COALESCE(hours, 0),
        entry_type = CASE
          WHEN COALESCE(hours, 0) > 0 THEN 'regular'::daily_hour_entry_type
          ELSE 'regular_and_overtime'::daily_hour_entry_type
        END;

    ALTER TABLE work_report_daily_logs DROP COLUMN IF EXISTS hours;
    ALTER TABLE work_report_daily_logs DROP COLUMN IF EXISTS expenses;
  END IF;
END $$;

CREATE TABLE work_report_daily_expense_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES work_report_daily_logs(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (qty >= 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_expense_log ON work_report_daily_expense_lines(daily_log_id);

ALTER TABLE work_report_daily_expense_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_expense_lines_select ON work_report_daily_expense_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
  );

CREATE POLICY daily_expense_lines_insert ON work_report_daily_expense_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY daily_expense_lines_update ON work_report_daily_expense_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY daily_expense_lines_delete ON work_report_daily_expense_lines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_report_daily_logs dl
      JOIN work_reports w ON w.id = dl.work_report_id
      WHERE dl.id = daily_log_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );
