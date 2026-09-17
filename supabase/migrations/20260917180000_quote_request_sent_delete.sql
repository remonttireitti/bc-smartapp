-- Salli tarjouspyynnön poisto myös lähetetylle (ei tilatulle) tarjoukselle.

DROP POLICY IF EXISTS quote_requests_delete ON quote_requests;

CREATE POLICY quote_requests_delete ON quote_requests FOR DELETE
  USING (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND status IN ('draft', 'sent')
    AND (
      public.is_global_admin()
      OR (
        owner_company_id = public.current_company_id()
        AND public.is_company_admin_or_manager()
      )
      OR (
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'quotes')
      )
    )
  );
