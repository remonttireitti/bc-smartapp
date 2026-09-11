-- Päivittäinen ylityölaskenta: sovitut normaalihintaiset tunnit + raporttikohtainen tuntitila.
ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS hours_agreed_regular NUMERIC(6, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN work_report_daily_logs.hours_agreed_regular IS
  'Tunteja, jotka laskennan mukaan olisivat ylityöä mutta laskutetaan normaalihintaisina (sovittu).';

ALTER TABLE work_report_billable
  ADD COLUMN IF NOT EXISTS hour_billing JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN work_report_billable.hour_billing IS
  'Tuntien laskutustapa: partner_mode / customer_mode = manual | daily_overtime | all_regular.';
