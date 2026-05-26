-- Tilaaja voi luoda uuden kohteen työtilauksessa palveluyrityksen rekisteriin.

CREATE OR REPLACE FUNCTION public.can_create_customer(p_owner_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.is_customer_user()
    AND (
      (
        public.is_subscriber_user()
        AND EXISTS (
          SELECT 1
          FROM subscribers s
          WHERE s.id = public.current_subscriber_id()
            AND s.owner_company_id = p_owner_company_id
        )
      )
      OR (
        public.current_company_id() IS NOT NULL
        AND (
          p_owner_company_id = public.current_company_id()
          OR public.can_write_module(p_owner_company_id, 'customers')
          OR (
            p_owner_company_id <> public.current_company_id()
            AND public.can_write_module(p_owner_company_id, 'work_reports')
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.create_customer_for_registry(
  p_owner_company_id UUID,
  p_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_subscriber_id UUID DEFAULT NULL
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

  IF public.is_subscriber_user() THEN
    sub_id := public.current_subscriber_id();
    IF sub_id IS NULL THEN
      RAISE EXCEPTION 'Tilaajaa ei löydy profiilista';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM subscribers s
      WHERE s.id = sub_id
        AND s.owner_company_id = p_owner_company_id
    ) THEN
      RAISE EXCEPTION 'Virheellinen palveluyritys kohteelle';
    END IF;
  END IF;

  IF NOT public.can_create_customer(p_owner_company_id) THEN
    RAISE EXCEPTION 'Ei oikeutta luoda asiakasta valittuun rekisteriin';
  END IF;

  IF sub_id IS NOT NULL AND NOT public.can_read_subscriber(sub_id) THEN
    RAISE EXCEPTION 'Ei oikeutta valittuun tilaajaan';
  END IF;

  INSERT INTO customers (owner_company_id, name, address, city, phone, subscriber_id)
  VALUES (
    p_owner_company_id,
    trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    sub_id
  )
  RETURNING * INTO created;

  PERFORM public.ensure_partner_customer_access(created.id, created.owner_company_id);

  RETURN created;
END;
$$;
