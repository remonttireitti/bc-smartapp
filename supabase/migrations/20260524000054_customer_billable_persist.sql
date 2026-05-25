-- Persist customer billing calculation for laskutus list (mirrors partner_total + calculation).

ALTER TABLE work_report_billable
  ADD COLUMN IF NOT EXISTS customer_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_calculation JSONB NOT NULL DEFAULT '{}';
