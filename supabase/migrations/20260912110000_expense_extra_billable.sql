-- Erottaa "lisälaskutettavissa" ja "lupa lisälaskutukseen" kuluriveillä.

ALTER TABLE work_report_daily_expense_lines
  ADD COLUMN IF NOT EXISTS extra_billable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN work_report_daily_expense_lines.extra_billable IS
  'Kun true, tarvike voi olla lisälaskutettavissa tarjouksen päälle. Lupa erikseen extra_billing_allowed-kentässä.';

UPDATE work_report_daily_expense_lines
SET extra_billable = true
WHERE extra_billing_allowed = true
  AND extra_billable = false;
