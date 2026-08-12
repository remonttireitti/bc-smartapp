-- Urakkahinta: erillinen asiakashinta ja kate-% kumppanihinnan laskentaan.

ALTER TABLE work_report_daily_logs
  ADD COLUMN IF NOT EXISTS customer_fixed_price_amount NUMERIC(12,2)
    CHECK (customer_fixed_price_amount IS NULL OR customer_fixed_price_amount >= 0),
  ADD COLUMN IF NOT EXISTS partner_urakka_margin_percent NUMERIC(5,2)
    CHECK (
      partner_urakka_margin_percent IS NULL
      OR (partner_urakka_margin_percent >= 0 AND partner_urakka_margin_percent < 100)
    );

COMMENT ON COLUMN work_report_daily_logs.customer_fixed_price_amount IS
  'Asiakkaan kanssa sovittu urakkahinta. Kumppanihinta lasketaan kate-%:llä ellei fixed_price_amount ole erikseen sovittu.';

COMMENT ON COLUMN work_report_daily_logs.partner_urakka_margin_percent IS
  'Kate-% asiakkaan urakkahinnasta ennen kumppanille laskutettavaa summaa (esim. 10 = kumppani saa 90 %).';
