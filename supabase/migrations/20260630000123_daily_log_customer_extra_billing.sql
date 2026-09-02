-- Lisätyöt asiakkaalle (tarjouksen päälle) päiväkirjamerkinnässä.

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS customer_extra_billing JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN work_report_daily_logs.customer_extra_billing IS
  'Tarjous + lisälaskutus: erilliset laskutettavat tunnit, selitys ja kulu/tarvike (ei kalenteritunnit).';
