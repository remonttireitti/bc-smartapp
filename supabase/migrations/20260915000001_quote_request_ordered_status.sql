-- Tarjouspyynnön tila "tilattu" + linkki luotuun työraporttiin

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS work_report_id UUID REFERENCES work_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quote_requests_work_report ON quote_requests(work_report_id);

COMMENT ON COLUMN quote_requests.work_report_id IS
  'Työraportti, joka luotiin tarjouksen tilauksesta (status = ordered).';

-- Pikahaku: tilauksen tila
CREATE OR REPLACE FUNCTION public.company_search(query TEXT, result_limit INT DEFAULT 20)
RETURNS TABLE (
  entity_type TEXT,
  entity_id UUID,
  title TEXT,
  subtitle TEXT,
  parent_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  tsq TSQUERY;
  needle TEXT := trim(query);
  per_type INT := GREATEST(4, COALESCE(result_limit, 20) / 5);
BEGIN
  IF cid IS NULL OR coalesce(needle, '') = '' THEN
    RETURN;
  END IF;

  BEGIN
    tsq := plainto_tsquery('finnish', needle);
  EXCEPTION WHEN OTHERS THEN
    tsq := NULL;
  END;

  RETURN QUERY
  SELECT 'customer'::TEXT, c.id, c.name, coalesce(c.address, c.city), NULL::UUID
  FROM customers c
  WHERE public.can_read_customer(c.id)
    AND (
      c.name ILIKE '%' || needle || '%'
      OR coalesce(c.address, '') ILIKE '%' || needle || '%'
      OR coalesce(c.city, '') ILIKE '%' || needle || '%'
      OR (tsq IS NOT NULL AND c.search_vector @@ tsq)
    )
  ORDER BY c.name
  LIMIT per_type;

  RETURN QUERY
  SELECT 'equipment'::TEXT, e.id, e.name, coalesce(e.tag, e.serial_number), e.customer_id
  FROM equipment e
  WHERE public.can_read_customer(e.customer_id)
    AND (
      e.name ILIKE '%' || needle || '%'
      OR coalesce(e.tag, '') ILIKE '%' || needle || '%'
      OR coalesce(e.serial_number, '') ILIKE '%' || needle || '%'
      OR (tsq IS NOT NULL AND e.search_vector @@ tsq)
    )
  ORDER BY e.name
  LIMIT per_type;

  RETURN QUERY
  SELECT
    'work_report'::TEXT,
    w.id,
    coalesce(nullif(trim(w.title), ''), 'Työraportti'),
    coalesce(
      nullif(trim(c.name), ''),
      nullif(left(w.description, 120), ''),
      CASE w.status
        WHEN 'draft' THEN 'Luonnos'
        WHEN 'delegated' THEN 'Delegoitu'
        WHEN 'scheduled' THEN 'Suunniteltu'
        WHEN 'in_progress' THEN 'Käynnissä'
        WHEN 'completed' THEN 'Valmis'
        WHEN 'billed_partner' THEN 'Laskutettu kumppani'
        WHEN 'billed_customer' THEN 'Laskutettu asiakas'
        ELSE w.status::text
      END
    ),
    w.customer_id
  FROM work_reports w
  LEFT JOIN customers c ON c.id = w.customer_id
  WHERE public.can_read_partner_report(w.owner_company_id, w.created_by_company_id, w.customer_id, 'work_reports')
    AND (
      w.title ILIKE '%' || needle || '%'
      OR coalesce(w.description, '') ILIKE '%' || needle || '%'
      OR coalesce(w.location_text, '') ILIKE '%' || needle || '%'
      OR coalesce(c.name, '') ILIKE '%' || needle || '%'
    )
  ORDER BY w.updated_at DESC NULLS LAST, w.created_at DESC
  LIMIT per_type;

  RETURN QUERY
  SELECT
    'maintenance_report'::TEXT,
    mr.id,
    coalesce(nullif(trim(mr.data->>'asiakas'), ''), nullif(trim(c.name), ''), 'Huoltoraportti'),
    coalesce(
      nullif(trim(mr.data->>'laiteTunnus'), ''),
      nullif(trim(mr.data->>'laiteMalli'), ''),
      CASE mr.status
        WHEN 'draft' THEN 'Luonnos'
        WHEN 'submitted' THEN 'Toimitettu'
        ELSE mr.status
      END
    ),
    mr.customer_id
  FROM maintenance_reports mr
  LEFT JOIN customers c ON c.id = mr.customer_id
  WHERE public.can_read_partner_report(
    mr.owner_company_id,
    mr.created_by_company_id,
    mr.customer_id,
    'maintenance_reports'
  )
    AND (
      coalesce(mr.data->>'asiakas', '') ILIKE '%' || needle || '%'
      OR coalesce(c.name, '') ILIKE '%' || needle || '%'
      OR coalesce(mr.data->>'laiteTunnus', '') ILIKE '%' || needle || '%'
      OR coalesce(mr.data->>'laiteMalli', '') ILIKE '%' || needle || '%'
      OR coalesce(mr.data->>'osoite', '') ILIKE '%' || needle || '%'
    )
  ORDER BY mr.updated_at DESC NULLS LAST, mr.created_at DESC
  LIMIT per_type;

  RETURN QUERY
  SELECT
    'quote_request'::TEXT,
    qr.id,
    coalesce(nullif(trim(qr.title), ''), 'Tarjouspyyntö'),
    coalesce(
      nullif(trim(c.name), ''),
      CASE qr.status
        WHEN 'draft' THEN 'Luonnos'
        WHEN 'sent' THEN 'Lähetetty'
        WHEN 'ordered' THEN 'Tilattu'
        ELSE qr.status
      END
    ),
    qr.customer_id
  FROM quote_requests qr
  LEFT JOIN customers c ON c.id = qr.customer_id
  WHERE public.can_read_partner_report(
    qr.owner_company_id,
    qr.created_by_company_id,
    qr.customer_id,
    'quotes'
  )
    AND (
      qr.title ILIKE '%' || needle || '%'
      OR coalesce(c.name, '') ILIKE '%' || needle || '%'
      OR coalesce(qr.data->>'notes', '') ILIKE '%' || needle || '%'
      OR coalesce(qr.data->>'introText', '') ILIKE '%' || needle || '%'
    )
  ORDER BY qr.updated_at DESC NULLS LAST, qr.created_at DESC
  LIMIT per_type;
END;
$$;

GRANT EXECUTE ON FUNCTION public.company_search TO authenticated;
