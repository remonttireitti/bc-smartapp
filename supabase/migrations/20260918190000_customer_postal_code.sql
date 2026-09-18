-- Customer address: postiosoite (address), postinumero (postal_code), kaupunki (city).

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Include postal_code in full-text search.
ALTER TABLE customers DROP COLUMN IF EXISTS search_vector;
ALTER TABLE customers
  ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector(
      'finnish',
      coalesce(name, '') || ' ' ||
      coalesce(address, '') || ' ' ||
      coalesce(postal_code, '') || ' ' ||
      coalesce(city, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_customers_search ON customers USING GIN(search_vector);

-- Replace create RPC (new optional postal_code arg → new signature).
DROP FUNCTION IF EXISTS public.create_customer_for_registry(UUID, TEXT, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.create_customer_for_registry(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_customer_for_registry(
  p_owner_company_id UUID,
  p_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_subscriber_id UUID DEFAULT NULL,
  p_postal_code TEXT DEFAULT NULL
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created customers;
  sub_id UUID := p_subscriber_id;
BEGIN
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Asiakkaan nimi on pakollinen';
  END IF;

  IF NOT public.can_create_customer(p_owner_company_id) THEN
    RAISE EXCEPTION 'Ei oikeutta luoda asiakasta valittuun rekisteriin';
  END IF;

  IF sub_id IS NOT NULL AND NOT public.can_read_subscriber(sub_id) THEN
    RAISE EXCEPTION 'Ei oikeutta valittuun tilaajaan';
  END IF;

  INSERT INTO customers (owner_company_id, name, address, postal_code, city, phone, subscriber_id)
  VALUES (
    p_owner_company_id,
    trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_postal_code, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    sub_id
  )
  RETURNING * INTO created;

  PERFORM public.ensure_partner_customer_access(created.id, created.owner_company_id);

  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_for_registry(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.update_customer_for_registry(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN
);

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
  p_touch_subscriber_id BOOLEAN DEFAULT FALSE,
  p_postal_code TEXT DEFAULT NULL
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
    postal_code = nullif(trim(coalesce(p_postal_code, '')), ''),
    city = nullif(trim(coalesce(p_city, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    business_id = nullif(trim(coalesce(p_business_id, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    subscriber_id = CASE
      WHEN p_touch_subscriber_id AND cid IS NOT NULL AND cid = existing.owner_company_id
        THEN p_subscriber_id
      ELSE existing.subscriber_id
    END
  WHERE id = p_customer_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_customer_for_registry(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN, TEXT
) TO authenticated;
