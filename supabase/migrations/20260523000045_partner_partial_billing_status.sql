UPDATE work_report_billing AS billing
SET partner_invoice_status = 'partial'
FROM work_report_billable AS billable
WHERE billing.work_report_id = billable.work_report_id
  AND billing.partner_billed_amount IS NOT NULL
  AND billing.partner_billed_amount > 0
  AND billable.partner_total > billing.partner_billed_amount + 0.005;
