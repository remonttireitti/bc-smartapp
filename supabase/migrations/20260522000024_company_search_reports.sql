-- Extend company_search with report hits and parent_id (customer) for equipment links.

DROP FUNCTION IF EXISTS public.company_search(TEXT, INT);

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
BEGIN
  IF cid IS NULL OR coalesce(needle, '') = '' THEN
    RETURN;
  END IF;

  tsq := plainto_tsquery('finnish', needle);

  RETURN QUERY
  SELECT 'customer'::TEXT, c.id, c.name, coalesce(c.address, c.city), NULL::UUID
  FROM customers c
  WHERE public.can_read_module(c.owner_company_id, 'customers')
    AND c.search_vector @@ tsq
  LIMIT result_limit;

  RETURN QUERY
  SELECT 'equipment'::TEXT, e.id, e.name, coalesce(e.tag, e.serial_number), e.customer_id
  FROM equipment e
  WHERE public.can_read_module(e.owner_company_id, 'customers')
    AND e.search_vector @@ tsq
  LIMIT result_limit;

  RETURN QUERY
  SELECT 'work_report'::TEXT, w.id, w.title, coalesce(left(w.description, 120), w.status::text), w.customer_id
  FROM work_reports w
  WHERE public.can_read_module(w.owner_company_id, 'work_reports')
    AND (
      w.title ILIKE '%' || needle || '%'
      OR coalesce(w.description, '') ILIKE '%' || needle || '%'
      OR coalesce(w.location_text, '') ILIKE '%' || needle || '%'
    )
  LIMIT result_limit;

  RETURN QUERY
  SELECT
    'maintenance_report'::TEXT,
    mr.id,
    coalesce(nullif(trim(mr.data->>'asiakas'), ''), 'Huoltoraportti'),
    coalesce(
      nullif(trim(mr.data->>'laiteTunnus'), ''),
      nullif(trim(mr.data->>'laiteMalli'), ''),
      mr.status
    ),
    mr.customer_id
  FROM maintenance_reports mr
  WHERE public.can_read_module(mr.owner_company_id, 'maintenance_reports')
    AND (
      coalesce(mr.data->>'asiakas', '') ILIKE '%' || needle || '%'
      OR coalesce(mr.data->>'laiteTunnus', '') ILIKE '%' || needle || '%'
      OR coalesce(mr.data->>'laiteMalli', '') ILIKE '%' || needle || '%'
      OR coalesce(mr.data->>'osoite', '') ILIKE '%' || needle || '%'
    )
  LIMIT result_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.company_search TO authenticated;
