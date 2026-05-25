-- Partner/customer billing is tracked in work_report_billing, not work_reports.status.
UPDATE work_reports
SET status = 'completed'
WHERE status IN ('billed_partner', 'billed_customer');

UPDATE work_report_billing AS billing
SET partner_billed_amount = COALESCE(
  billing.partner_invoice_amount,
  billable.partner_total,
  0
)
FROM work_report_billable AS billable
WHERE billing.work_report_id = billable.work_report_id
  AND billing.partner_invoice_status IN ('paid', 'partial')
  AND billing.partner_billed_amount IS NULL;
