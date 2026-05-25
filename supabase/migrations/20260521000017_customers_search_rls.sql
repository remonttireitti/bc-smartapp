-- Align company_search with granular customers module access.

CREATE OR REPLACE FUNCTION public.company_search(query TEXT, result_limit INT DEFAULT 20)
RETURNS TABLE (
  entity_type TEXT,
  entity_id UUID,
  title TEXT,
  subtitle TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  tsq TSQUERY;
BEGIN
  IF cid IS NULL OR coalesce(trim(query), '') = '' THEN
    RETURN;
  END IF;

  tsq := plainto_tsquery('finnish', query);

  RETURN QUERY
  SELECT 'customer'::TEXT, c.id, c.name, coalesce(c.address, c.city)
  FROM customers c
  WHERE public.can_read_module(c.owner_company_id, 'customers')
    AND c.search_vector @@ tsq
  LIMIT result_limit;

  RETURN QUERY
  SELECT 'equipment'::TEXT, e.id, e.name, coalesce(e.tag, e.serial_number)
  FROM equipment e
  WHERE public.can_read_module(e.owner_company_id, 'customers')
    AND e.search_vector @@ tsq
  LIMIT result_limit;
END;
$$;
