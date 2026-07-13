-- Sulje pienet avoimet kumppanilaskutuksen erät, jotka syntyivät ajomatkojen
-- 35 € minimilaskutuksen päivityksestä laskutuksen jälkeen.
-- Vain raportit, joissa laskutuksen jälkeen ei ole uusia päiväkirjauksia.

UPDATE work_report_billing AS billing
SET
  partner_invoice_status = 'paid',
  partner_billed_amount = billable.partner_total,
  partner_invoice_amount = billable.partner_total
FROM work_report_billable AS billable
WHERE billing.work_report_id = billable.work_report_id
  AND billing.partner_invoice_status = 'partial'
  AND billing.partner_billed_at IS NOT NULL
  AND billing.partner_billed_amount IS NOT NULL
  AND billing.partner_billed_amount > 0.005
  AND billable.partner_total > billing.partner_billed_amount + 0.005
  AND billable.partner_total <= billing.partner_billed_amount + 35.005
  AND NOT EXISTS (
    SELECT 1
    FROM work_report_daily_logs AS dl
    WHERE dl.work_report_id = billing.work_report_id
      AND dl.created_at > billing.partner_billed_at
  );
