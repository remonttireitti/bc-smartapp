-- Daily log clock start time (30-minute precision) for calendar placement and conflict checks.

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS log_start_time TIME;

COMMENT ON COLUMN work_report_daily_logs.log_start_time IS
  'Work start time on log_date (30 min precision). Used for calendar blocks and assignee conflict detection.';
