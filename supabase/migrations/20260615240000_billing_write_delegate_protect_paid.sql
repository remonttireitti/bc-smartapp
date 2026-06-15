-- Toimeksisaaja voi merkita kumppanilaskun laskutetuksi (work_report_billing kirjoitus).

DROP POLICY IF EXISTS work_report_billing_all ON work_report_billing;
CREATE POLICY work_report_billing_all ON work_report_billing FOR ALL
  USING (
    NOT public.is_customer_user()
    AND EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND (
          w.created_by_company_id = public.current_company_id()
          OR w.owner_company_id = public.current_company_id()
          OR (
            w.delegate_company_id = public.current_company_id()
            AND w.created_by_company_id = w.owner_company_id
          )
        )
    )
  );

-- Synkkaa puuttuvat laskutussummat billable-riveistä (toimeksisaajan laskelmat).
UPDATE work_report_billing AS bl
SET
  partner_invoice_amount = b.partner_total,
  billed_to_company_id = COALESCE(
    bl.billed_to_company_id,
    CASE
      WHEN w.delegate_company_id IS NOT NULL AND w.created_by_company_id = w.owner_company_id
      THEN w.delegate_company_id
      ELSE w.owner_company_id
    END
  )
FROM work_report_billable AS b
JOIN work_reports AS w ON w.id = b.work_report_id
WHERE bl.work_report_id = b.work_report_id
  AND b.partner_total > 0.005
  AND (bl.partner_invoice_amount IS NULL OR bl.partner_invoice_amount <= 0.005);

INSERT INTO work_report_billing (work_report_id, partner_invoice_amount, partner_invoice_status, billed_to_company_id)
SELECT
  b.work_report_id,
  b.partner_total,
  'none',
  CASE
    WHEN w.delegate_company_id IS NOT NULL AND w.created_by_company_id = w.owner_company_id
    THEN w.delegate_company_id
    ELSE w.owner_company_id
  END
FROM work_report_billable AS b
JOIN work_reports AS w ON w.id = b.work_report_id
WHERE b.partner_total > 0.005
  AND NOT EXISTS (
    SELECT 1 FROM work_report_billing AS bl WHERE bl.work_report_id = b.work_report_id
  );

UPDATE work_report_billing
SET
  partner_invoice_status = 'paid',
  partner_billed_amount = 825.00,
  partner_billed_at = COALESCE(partner_billed_at, NOW())
WHERE work_report_id = '816f16ef-93ce-4758-8e44-d7451c0da519'
  AND partner_invoice_amount >= 825.00;
