-- Tarjousperusteinen laskutus: kiinteä asiakashinta + kumppanikate.

ALTER TABLE work_report_billable
  ADD COLUMN IF NOT EXISTS billing_quote JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN work_report_billable.billing_quote IS
  'Tarjouslinkitys: quote_request_id, customer_mode (daily_log|quote_fixed), hinnat, hankinta, kate';
