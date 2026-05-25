-- Optional per-day hourly rate override (tekijä → tilaaja). Empty = raportin/kumppanuuden oletushinta.

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS hourly_rate_override NUMERIC(12,2)
  CHECK (hourly_rate_override IS NULL OR hourly_rate_override >= 0);
