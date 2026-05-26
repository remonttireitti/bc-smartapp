-- Tilaaja näkee omat työtilaukset vain luonnoksena; valmiit työraportit kun status on valmis.

DROP POLICY IF EXISTS work_reports_select ON work_reports;
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        (
          created_by_user_id = auth.uid()
          AND status = 'draft'
        )
        OR (
          public.report_visible_to_subscriber(subscriber_id, customer_id)
          AND status IN ('completed', 'billed_partner', 'billed_customer')
        )
      WHEN public.is_customer_user() THEN
        (
          created_by_user_id = auth.uid()
          AND status = 'draft'
        )
        OR (
          customer_id = public.current_customer_id()
          AND status IN ('completed', 'billed_partner', 'billed_customer')
        )
      ELSE
        delegate_company_id = public.current_company_id()
        OR public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'work_reports'
        )
    END
  );
