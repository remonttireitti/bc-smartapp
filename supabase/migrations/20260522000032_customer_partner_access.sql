-- Per-customer partner visibility within a partnership.
-- Default: all customers visible when partner has customers module access.
-- When customer_access_restricted = true, only rows in customer_partner_access with can_view apply.

ALTER TABLE company_partnerships
  ADD COLUMN IF NOT EXISTS customer_access_restricted BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.partnership_id_between(c1 UUID, c2 UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.id
  FROM company_partnerships cp
  WHERE cp.status = 'active'
    AND (
      (cp.company_a_id = c1 AND cp.company_b_id = c2)
      OR (cp.company_a_id = c2 AND cp.company_b_id = c1)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_read_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  cust RECORD;
  pid UUID;
  restricted BOOLEAN;
BEGIN
  IF cid IS NULL OR p_customer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.id, c.owner_company_id
  INTO cust
  FROM customers c
  WHERE c.id = p_customer_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF cust.owner_company_id = cid THEN
    RETURN true;
  END IF;

  IF NOT public.can_read_module(cust.owner_company_id, 'customers') THEN
    RETURN false;
  END IF;

  pid := public.partnership_id_between(cid, cust.owner_company_id);
  IF pid IS NULL THEN
    RETURN false;
  END IF;

  SELECT cp.customer_access_restricted
  INTO restricted
  FROM company_partnerships cp
  WHERE cp.id = pid;

  IF NOT COALESCE(restricted, false) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM customer_partner_access cpa
    WHERE cpa.partnership_id = pid
      AND cpa.customer_id = p_customer_id
      AND cpa.can_view = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_partner_report(
  p_owner_company_id UUID,
  p_created_by_company_id UUID,
  p_customer_id UUID,
  p_module_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
BEGIN
  IF cid IS NULL THEN
    RETURN false;
  END IF;

  IF p_owner_company_id = cid OR p_created_by_company_id = cid THEN
    RETURN true;
  END IF;

  IF NOT public.can_read_module(p_owner_company_id, p_module_key) THEN
    RETURN false;
  END IF;

  IF p_customer_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN public.can_read_customer(p_customer_id);
END;
$$;

-- customer_partner_access RLS
DROP POLICY IF EXISTS customer_partner_access_select ON customer_partner_access;
CREATE POLICY customer_partner_access_select ON customer_partner_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM company_partnerships cp
      WHERE cp.id = customer_partner_access.partnership_id
        AND cp.status = 'active'
        AND (
          cp.company_a_id = public.current_company_id()
          OR cp.company_b_id = public.current_company_id()
        )
    )
  );

DROP POLICY IF EXISTS customer_partner_access_manage ON customer_partner_access;
CREATE POLICY customer_partner_access_manage ON customer_partner_access FOR ALL
  USING (
    public.is_company_admin()
    AND EXISTS (
      SELECT 1
      FROM customers c
      JOIN company_partnerships cp ON cp.id = customer_partner_access.partnership_id
      WHERE c.id = customer_partner_access.customer_id
        AND c.owner_company_id = public.current_company_id()
        AND cp.status = 'active'
        AND (
          cp.company_a_id = public.current_company_id()
          OR cp.company_b_id = public.current_company_id()
        )
    )
  )
  WITH CHECK (
    public.is_company_admin()
    AND EXISTS (
      SELECT 1
      FROM customers c
      JOIN company_partnerships cp ON cp.id = customer_partner_access.partnership_id
      WHERE c.id = customer_partner_access.customer_id
        AND c.owner_company_id = public.current_company_id()
        AND cp.status = 'active'
        AND (
          cp.company_a_id = public.current_company_id()
          OR cp.company_b_id = public.current_company_id()
        )
    )
  );

-- Customers & equipment follow per-customer access
DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN id = public.current_customer_id()
      ELSE public.can_read_customer(id)
    END
  );

DROP POLICY IF EXISTS equipment_select ON equipment;
CREATE POLICY equipment_select ON equipment FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN customer_id = public.current_customer_id()
      ELSE public.can_read_customer(customer_id)
    END
  );

-- Report creation requires shared customer
DROP POLICY IF EXISTS work_reports_insert ON work_reports;
CREATE POLICY work_reports_insert ON work_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'work_reports')
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS maintenance_reports_insert ON maintenance_reports;
CREATE POLICY maintenance_reports_insert ON maintenance_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'maintenance_reports')
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND NOT public.is_customer_user()
  );

-- Report visibility follows customer sharing (creator always sees own)
DROP POLICY IF EXISTS work_reports_select ON work_reports;
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status IN ('completed', 'billed_partner', 'billed_customer')
      ELSE
        delegate_company_id = public.current_company_id()
        OR public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'work_reports'
        )
    END
  );

DROP POLICY IF EXISTS maintenance_reports_select ON maintenance_reports;
CREATE POLICY maintenance_reports_select ON maintenance_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status = 'submitted'
      ELSE
        public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'maintenance_reports'
        )
    END
  );

-- Documents follow customer access
DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN customer_id = public.current_customer_id()
      WHEN customer_id IS NOT NULL THEN public.can_read_customer(customer_id)
      ELSE public.can_see_company_row(owner_company_id)
    END
  );

-- Global search respects customer sharing
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
  WHERE public.can_read_customer(c.id)
    AND c.search_vector @@ tsq
  LIMIT result_limit;

  RETURN QUERY
  SELECT 'equipment'::TEXT, e.id, e.name, coalesce(e.tag, e.serial_number), e.customer_id
  FROM equipment e
  WHERE public.can_read_customer(e.customer_id)
    AND e.search_vector @@ tsq
  LIMIT result_limit;

  RETURN QUERY
  SELECT 'work_report'::TEXT, w.id, w.title, coalesce(left(w.description, 120), w.status::text), w.customer_id
  FROM work_reports w
  WHERE public.can_read_partner_report(w.owner_company_id, w.created_by_company_id, w.customer_id, 'work_reports')
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
  WHERE public.can_read_partner_report(
    mr.owner_company_id,
    mr.created_by_company_id,
    mr.customer_id,
    'maintenance_reports'
  )
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
