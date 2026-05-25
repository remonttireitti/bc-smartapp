ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'partial';

ALTER TABLE work_report_billing
  ADD COLUMN IF NOT EXISTS partner_billed_amount NUMERIC(12, 2);

UPDATE work_report_billing
SET partner_billed_amount = partner_invoice_amount
WHERE partner_invoice_status = 'paid'
  AND partner_billed_amount IS NULL
  AND partner_invoice_amount IS NOT NULL;
