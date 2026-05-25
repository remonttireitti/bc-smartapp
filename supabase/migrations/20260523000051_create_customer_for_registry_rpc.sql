-- Reliable partner/own customer creation: direct inserts + RETURNING can fail SELECT RLS
-- on restricted partnerships even when INSERT is allowed.

CREATE OR REPLACE FUNCTION public.can_create_customer(p_owner_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_company_id() IS NOT NULL
    AND NOT public.is_customer_user()
    AND (
      p_owner_company_id = public.current_company_id()
      OR public.can_write_module(p_owner_company_id, 'customers')
      OR (
        p_owner_company_id <> public.current_company_id()
        AND public.can_write_module(p_owner_company_id, 'work_reports')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.ensure_partner_customer_access(
  p_customer_id UUID,
  p_owner_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  pid UUID;
BEGIN
  IF cid IS NULL OR cid = p_owner_company_id OR p_customer_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.can_create_customer(p_owner_company_id) THEN
    RETURN;
  END IF;

  pid := public.partnership_id_between(cid, p_owner_company_id);
  IF pid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO customer_partner_access (partnership_id, customer_id, can_view, can_create_reports)
  VALUES (pid, p_customer_id, true, true)
  ON CONFLICT (partnership_id, customer_id) DO UPDATE
  SET can_view = EXCLUDED.can_view,
      can_create_reports = EXCLUDED.can_create_reports;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_partner_access_on_customer_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_partner_customer_access(NEW.id, NEW.owner_company_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_customer_for_registry(
  p_owner_company_id UUID,
  p_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created customers;
BEGIN
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Asiakkaan nimi on pakollinen';
  END IF;

  IF NOT public.can_create_customer(p_owner_company_id) THEN
    RAISE EXCEPTION 'Ei oikeutta luoda asiakasta valittuun rekisteriin';
  END IF;

  INSERT INTO customers (owner_company_id, name, address, city, phone)
  VALUES (
    p_owner_company_id,
    trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_phone, '')), '')
  )
  RETURNING * INTO created;

  PERFORM public.ensure_partner_customer_access(created.id, created.owner_company_id);

  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_for_registry(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
