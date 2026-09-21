-- Merkinnät siitä, milloin laskutusteksti / tulostelinkki on viimeksi kopioitu.
-- Ei muuta laskutuksen tilaa (customer/partner_invoice_status); vain aikaleima-merkki.

ALTER TABLE work_report_billing
  ADD COLUMN IF NOT EXISTS billing_text_copied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS print_link_copied_at TIMESTAMPTZ;

COMMENT ON COLUMN work_report_billing.billing_text_copied_at IS
  'Milloin "Kopioi laskutusteksti" onnistui viimeksi (ei merkitse laskutetuksi).';
COMMENT ON COLUMN work_report_billing.print_link_copied_at IS
  'Milloin "Kopioi tulostelinkki" onnistui viimeksi (ei merkitse laskutetuksi).';
