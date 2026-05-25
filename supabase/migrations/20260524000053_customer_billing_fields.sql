-- Asiakaslaskutus omille työraporteille: päiväkohtainen tuntihinta ja tarvikkeiden asiakashinnat.

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS customer_hourly_rate_override NUMERIC(12,2)
  CHECK (customer_hourly_rate_override IS NULL OR customer_hourly_rate_override >= 0);

ALTER TABLE work_report_daily_expense_lines
  ADD COLUMN IF NOT EXISTS bill_to_customer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_unit_price NUMERIC(12,2)
  CHECK (customer_unit_price IS NULL OR customer_unit_price >= 0);

ALTER TABLE work_report_billing
  ADD COLUMN IF NOT EXISTS customer_rates_override JSONB,
  ADD COLUMN IF NOT EXISTS use_custom_customer_rates BOOLEAN NOT NULL DEFAULT false;
