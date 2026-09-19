-- Luotettava tarjouksen päivitys: suora UPDATE + RLS voi palauttaa 0 riviä hiljaa.
-- Sama malli kuin update_customer_for_registry.

DROP POLICY IF EXISTS quote_requests_update ON quote_requests;
CREATE POLICY quote_requests_update ON quote_requests FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND (
      owner_company_id = public.current_company_id()
      OR public.can_write_module(owner_company_id, 'quotes')
    )
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND (
      owner_company_id = public.current_company_id()
      OR public.can_write_module(owner_company_id, 'quotes')
    )
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND (subscriber_id IS NULL OR public.can_read_subscriber(subscriber_id))
  );

CREATE OR REPLACE FUNCTION public.can_update_quote_request(p_quote_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM quote_requests q
    WHERE q.id = p_quote_id
      AND NOT public.is_customer_user()
      AND NOT public.is_subscriber_user()
      AND (
        q.owner_company_id = public.current_company_id()
        OR public.can_write_module(q.owner_company_id, 'quotes')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.update_quote_request(
  p_id UUID,
  p_owner_company_id UUID,
  p_branding_company_id UUID,
  p_partnership_id UUID,
  p_customer_id UUID,
  p_subscriber_id UUID,
  p_subscriber_portal_visibility TEXT,
  p_equipment_id UUID,
  p_title TEXT,
  p_status TEXT,
  p_data JSONB
)
RETURNS quote_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing quote_requests;
  updated quote_requests;
  cid UUID := public.current_company_id();
  next_owner UUID;
  next_visibility TEXT;
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Kirjautuminen vaaditaan';
  END IF;

  SELECT * INTO existing FROM quote_requests WHERE id = p_id;
  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Tarjousta ei löytynyt';
  END IF;

  IF NOT public.can_update_quote_request(p_id) THEN
    RAISE EXCEPTION 'Ei kirjoitusoikeutta tähän tarjoukseen';
  END IF;

  IF existing.status = 'ordered' AND coalesce(p_status, existing.status) IS DISTINCT FROM 'ordered' THEN
    RAISE EXCEPTION 'Tilattua tarjousta ei voi muuttaa takaisin luonnokseksi tai lähetetyksi';
  END IF;

  next_owner := coalesce(p_owner_company_id, existing.owner_company_id);
  IF next_owner IS DISTINCT FROM existing.owner_company_id THEN
    IF next_owner <> cid AND NOT public.can_write_module(next_owner, 'quotes') THEN
      RAISE EXCEPTION 'Ei kirjoitusoikeutta valittuun asiakasrekisteriin';
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL AND NOT public.can_read_customer(p_customer_id) THEN
    RAISE EXCEPTION 'Ei oikeutta valittuun asiakkaaseen';
  END IF;

  IF p_subscriber_id IS NOT NULL AND NOT public.can_read_subscriber(p_subscriber_id) THEN
    RAISE EXCEPTION 'Ei oikeutta valittuun tilaajaan';
  END IF;

  next_visibility := coalesce(
    nullif(trim(p_subscriber_portal_visibility), ''),
    existing.subscriber_portal_visibility,
    'when_ready'
  );
  IF next_visibility NOT IN ('when_ready', 'as_draft', 'as_in_progress') THEN
    RAISE EXCEPTION 'Virheellinen tilaajan portaalinäkyvyys';
  END IF;

  IF coalesce(p_status, existing.status) NOT IN ('draft', 'sent', 'ordered') THEN
    RAISE EXCEPTION 'Virheellinen tarjouksen tila';
  END IF;

  UPDATE quote_requests
  SET
    owner_company_id = next_owner,
    branding_company_id = coalesce(p_branding_company_id, existing.branding_company_id),
    partnership_id = p_partnership_id,
    customer_id = p_customer_id,
    subscriber_id = p_subscriber_id,
    subscriber_portal_visibility = next_visibility,
    equipment_id = p_equipment_id,
    title = coalesce(nullif(trim(p_title), ''), existing.title),
    status = coalesce(p_status, existing.status),
    data = coalesce(p_data, existing.data)
  WHERE id = p_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.can_update_quote_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_update_quote_request(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.update_quote_request(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_quote_request(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, JSONB
) TO authenticated;
