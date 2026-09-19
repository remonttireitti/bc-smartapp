-- Tarjouksen UPDATE: salli tallennus kaikille, joilla on quotes-write
-- omistajarekisteriin (oma yritys tai kumppani). Vanha ehto vaati
-- created_by_company_id = current_company_id(), jolloin omistajan
-- tallennus (joka ylikirjoitti created_by:n) esti kumppanin jatkotallennuksen,
-- ja read-only -kumppani sai hiljaisen 0 rivin päivityksen.

DROP POLICY IF EXISTS quote_requests_update ON quote_requests;
CREATE POLICY quote_requests_update ON quote_requests FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND public.can_write_module(owner_company_id, 'quotes')
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND public.can_write_module(owner_company_id, 'quotes')
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND (subscriber_id IS NULL OR public.can_read_subscriber(subscriber_id))
  );
