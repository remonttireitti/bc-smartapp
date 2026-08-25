-- Reliable customer updates for registry owner and partners with module write access.
-- Direct UPDATE + RLS can silently affect 0 rows; SECURITY DEFINER RPC mirrors create_customer_for_registry.

CREATE OR REPLACE FUNCTION public.can_update_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = p_customer_id
      AND public.can_read_customer(c.id)
      AND NOT public.is_customer_user()
      AND NOT public.is_subscriber_user()
      AND (
        public.can_write_module(c.owner_company_id, 'customers')
        OR (
          c.owner_company_id <> public.current_company_id()
          AND (
            public.can_write_module(c.owner_company_id, 'work_reports')
            OR public.can_write_module(c.owner_company_id, 'maintenance_reports')
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.update_customer_for_registry(
  p_customer_id UUID,
  p_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_business_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_subscriber_id UUID DEFAULT NULL,
  p_touch_subscriber_id BOOLEAN DEFAULT FALSE
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing customers;
  updated customers;
  cid UUID := public.current_company_id();
BEGIN
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Asiakkaan nimi on pakollinen';
  END IF;

  SELECT * INTO existing
  FROM customers
  WHERE id = p_customer_id;

  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Asiakasta ei löytynyt';
  END IF;

  IF NOT public.can_update_customer(p_customer_id) THEN
    RAISE EXCEPTION 'Ei oikeutta päivittää asiakasta';
  END IF;

  IF p_touch_subscriber_id AND cid IS NOT NULL AND cid = existing.owner_company_id THEN
    IF p_subscriber_id IS NOT NULL AND NOT public.can_read_subscriber(p_subscriber_id) THEN
      RAISE EXCEPTION 'Ei oikeutta valittuun tilaajaan';
    END IF;
  END IF;

  UPDATE customers
  SET
    name = trim(p_name),
    address = nullif(trim(coalesce(p_address, '')), ''),
    city = nullif(trim(coalesce(p_city, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    business_id = nullif(trim(coalesce(p_business_id, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    subscriber_id = CASE
      WHEN p_touch_subscriber_id AND cid IS NOT NULL AND cid = existing.owner_company_id
        THEN p_subscriber_id
      ELSE subscriber_id
    END
  WHERE id = p_customer_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_update_customer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_for_registry(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN
) TO authenticated;

DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND public.can_write_module(owner_company_id, 'customers')
  );
