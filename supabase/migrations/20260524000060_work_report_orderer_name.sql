-- Optional free-text orderer (tilaaja) on work reports

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS orderer_name TEXT;
