-- Tarvikkeiden lisälaskutuslupa ja asiakaskate % päiväkirjan kuluriveillä.

ALTER TABLE work_report_daily_expense_lines
  ADD COLUMN IF NOT EXISTS extra_billing_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_margin_percent NUMERIC(5,2)
    CHECK (customer_margin_percent IS NULL OR (customer_margin_percent >= 0 AND customer_margin_percent < 100));

COMMENT ON COLUMN work_report_daily_expense_lines.extra_billing_allowed IS
  'Kun true, tarvike voidaan laskuttaa asiakkaalta tarjouksen päälle (hankinta + kate). Muuten syö katetta.';
COMMENT ON COLUMN work_report_daily_expense_lines.customer_margin_percent IS
  'Asiakashinnan kate-% hankinnasta (oletus 80). Käytetään kun extra_billing_allowed on true.';
