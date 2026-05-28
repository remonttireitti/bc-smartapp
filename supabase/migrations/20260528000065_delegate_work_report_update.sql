-- Toimeksisaaja (delegate_company) saa päivittää vastaanottamattoman toimeksiannon
-- (esim. assigned_user_id + status), vaikka owner/created_by olisivat lähettävän yrityksen.

DROP POLICY IF EXISTS work_reports_update ON work_reports;
CREATE POLICY work_reports_update ON work_reports FOR UPDATE
  USING (
    CASE
      WHEN public.is_subscriber_user() OR public.is_customer_user() THEN
        public.portal_work_order_update_ok(id)
      ELSE
        (
          public.can_see_company_row(owner_company_id, created_by_company_id)
          OR delegate_company_id = public.current_company_id()
        )
        AND NOT public.is_customer_user()
        AND NOT public.is_subscriber_user()
    END
  );
