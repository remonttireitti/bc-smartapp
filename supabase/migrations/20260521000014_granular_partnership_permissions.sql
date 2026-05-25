-- Granular partnership permissions: none | read | write per module

CREATE OR REPLACE FUNCTION public.default_partnership_permissions()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '{
    "work_reports": "none",
    "maintenance_reports": "none",
    "customers": "none",
    "inventory": "none",
    "tools": "none",
    "quotes": "none",
    "use_branding": false
  }'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.normalize_partnership_permissions(perms JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result JSONB := public.default_partnership_permissions();
  wr TEXT := 'none';
  mr TEXT := 'none';
  cu TEXT := 'none';
  inv TEXT := 'none';
  tl TEXT := 'none';
  qt TEXT := 'none';
  branding BOOLEAN := false;
BEGIN
  IF perms IS NULL OR perms = '{}'::jsonb THEN
    RETURN result;
  END IF;

  IF jsonb_typeof(perms -> 'work_reports') = 'string' THEN
    RETURN result || perms;
  END IF;

  IF COALESCE((perms ->> 'create_work_reports_as_partner')::boolean, false) THEN
    wr := 'write';
  ELSIF COALESCE((perms ->> 'view_partner_reports')::boolean, false) THEN
    wr := 'read';
  END IF;

  IF COALESCE((perms ->> 'create_maintenance_reports_as_partner')::boolean, false) THEN
    mr := 'write';
  ELSIF COALESCE((perms ->> 'view_partner_reports')::boolean, false) THEN
    mr := 'read';
  END IF;

  IF COALESCE((perms ->> 'create_customers_as_partner')::boolean, false) THEN
    cu := 'write';
  ELSIF COALESCE((perms ->> 'view_customers')::boolean, false) THEN
    cu := 'read';
  END IF;

  branding := COALESCE((perms ->> 'use_partner_branding')::boolean, false);

  result := jsonb_set(result, '{work_reports}', to_jsonb(wr));
  result := jsonb_set(result, '{maintenance_reports}', to_jsonb(mr));
  result := jsonb_set(result, '{customers}', to_jsonb(cu));
  result := jsonb_set(result, '{inventory}', to_jsonb(inv));
  result := jsonb_set(result, '{tools}', to_jsonb(tl));
  result := jsonb_set(result, '{quotes}', to_jsonb(qt));
  result := jsonb_set(result, '{use_branding}', to_jsonb(branding));

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.partnership_perms_for(acting_company UUID, owner_company UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p company_partnerships;
  perms JSONB;
BEGIN
  IF acting_company IS NULL OR owner_company IS NULL THEN
    RETURN public.default_partnership_permissions();
  END IF;

  IF acting_company = owner_company THEN
    RETURN NULL;
  END IF;

  SELECT * INTO p FROM public.partnership_between(acting_company, owner_company);
  IF p IS NULL THEN
    RETURN public.default_partnership_permissions();
  END IF;

  IF p.company_a_id = acting_company AND p.company_b_id = owner_company THEN
    perms := p.permissions_a_to_b;
  ELSE
    perms := p.permissions_b_to_a;
  END IF;

  RETURN public.normalize_partnership_permissions(perms);
END;
$$;

CREATE OR REPLACE FUNCTION public.partnership_access_level(
  acting_company UUID,
  owner_company UUID,
  module_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  perms JSONB;
  level TEXT;
BEGIN
  IF acting_company IS NULL OR owner_company IS NULL THEN
    RETURN 'none';
  END IF;

  IF acting_company = owner_company THEN
    RETURN 'write';
  END IF;

  perms := public.partnership_perms_for(acting_company, owner_company);
  level := perms ->> module_key;

  IF level IN ('read', 'write') THEN
    RETURN level;
  END IF;

  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_module(target_owner UUID, module_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.partnership_access_level(public.current_company_id(), target_owner, module_key) IN ('read', 'write');
$$;

CREATE OR REPLACE FUNCTION public.can_write_module(target_owner UUID, module_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.partnership_access_level(public.current_company_id(), target_owner, module_key) = 'write';
$$;

CREATE OR REPLACE FUNCTION public.can_use_partner_branding(target_owner UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  perms JSONB;
BEGIN
  IF cid IS NULL OR cid = target_owner THEN
    RETURN cid = target_owner;
  END IF;

  perms := public.partnership_perms_for(cid, target_owner);
  RETURN COALESCE((perms ->> 'use_branding')::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.partnership_permission(
  acting_company UUID,
  owner_company UUID,
  perm_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE perm_key
    WHEN 'create_work_reports_as_partner' THEN
      RETURN public.partnership_access_level(acting_company, owner_company, 'work_reports') = 'write';
    WHEN 'create_maintenance_reports_as_partner' THEN
      RETURN public.partnership_access_level(acting_company, owner_company, 'maintenance_reports') = 'write';
    WHEN 'create_customers_as_partner' THEN
      RETURN public.partnership_access_level(acting_company, owner_company, 'customers') = 'write';
    WHEN 'view_customers' THEN
      RETURN public.partnership_access_level(acting_company, owner_company, 'customers') IN ('read', 'write');
    WHEN 'view_partner_reports' THEN
      RETURN public.partnership_access_level(acting_company, owner_company, 'work_reports') IN ('read', 'write')
        OR public.partnership_access_level(acting_company, owner_company, 'maintenance_reports') IN ('read', 'write');
    WHEN 'use_partner_branding' THEN
      RETURN public.can_use_partner_branding(owner_company);
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_create_for_company(
  target_owner_company UUID,
  perm_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE perm_key
    WHEN 'create_work_reports_as_partner' THEN
      RETURN public.can_write_module(target_owner_company, 'work_reports');
    WHEN 'create_maintenance_reports_as_partner' THEN
      RETURN public.can_write_module(target_owner_company, 'maintenance_reports');
    WHEN 'create_customers_as_partner' THEN
      RETURN public.can_write_module(target_owner_company, 'customers');
    ELSE
      RETURN public.partnership_permission(public.current_company_id(), target_owner_company, perm_key);
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_see_company_row(
  row_owner_company UUID,
  row_created_by_company UUID DEFAULT NULL
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

  IF row_owner_company = cid OR row_created_by_company = cid THEN
    RETURN true;
  END IF;

  IF public.can_read_module(row_owner_company, 'work_reports')
    OR public.can_read_module(row_owner_company, 'maintenance_reports')
    OR public.can_read_module(row_owner_company, 'customers')
    OR public.can_read_module(row_owner_company, 'inventory')
    OR public.can_read_module(row_owner_company, 'tools')
    OR public.can_read_module(row_owner_company, 'quotes') THEN
    RETURN true;
  END IF;

  IF row_created_by_company IS NOT NULL
    AND (
      public.can_read_module(row_created_by_company, 'work_reports')
      OR public.can_read_module(row_created_by_company, 'maintenance_reports')
    ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER TABLE company_partnerships DISABLE TRIGGER partnerships_permission_ownership;

UPDATE company_partnerships
SET
  permissions_a_to_b = public.normalize_partnership_permissions(permissions_a_to_b),
  permissions_b_to_a = public.normalize_partnership_permissions(permissions_b_to_a);

UPDATE company_partnerships
SET permissions_a_to_b = '{
  "work_reports": "write",
  "maintenance_reports": "read",
  "customers": "write",
  "inventory": "none",
  "tools": "none",
  "quotes": "none",
  "use_branding": true
}'::jsonb
WHERE company_a_id = '11111111-1111-4111-8111-111111111111'
  AND company_b_id = '22222222-2222-4222-8222-222222222222';

ALTER TABLE company_partnerships ENABLE TRIGGER partnerships_permission_ownership;

-- Work reports
DROP POLICY IF EXISTS work_reports_select ON work_reports;
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status IN ('completed', 'billed_partner', 'billed_customer')
      ELSE
        owner_company_id = public.current_company_id()
        OR created_by_company_id = public.current_company_id()
        OR public.can_read_module(owner_company_id, 'work_reports')
    END
  );

DROP POLICY IF EXISTS work_reports_insert ON work_reports;
CREATE POLICY work_reports_insert ON work_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'work_reports')
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS work_reports_update ON work_reports;
CREATE POLICY work_reports_update ON work_reports FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND (
      owner_company_id = public.current_company_id()
      OR (
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'work_reports')
      )
    )
  );

-- Maintenance reports
DROP POLICY IF EXISTS maintenance_reports_select ON maintenance_reports;
CREATE POLICY maintenance_reports_select ON maintenance_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status = 'submitted'
      ELSE
        owner_company_id = public.current_company_id()
        OR created_by_company_id = public.current_company_id()
        OR public.can_read_module(owner_company_id, 'maintenance_reports')
    END
  );

DROP POLICY IF EXISTS maintenance_reports_insert ON maintenance_reports;
CREATE POLICY maintenance_reports_insert ON maintenance_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'maintenance_reports')
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS maintenance_reports_update ON maintenance_reports;
CREATE POLICY maintenance_reports_update ON maintenance_reports FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND (
      owner_company_id = public.current_company_id()
      OR (
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'maintenance_reports')
      )
    )
  );

-- Customers
DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN id = public.current_customer_id()
      ELSE
        owner_company_id = public.current_company_id()
        OR public.can_read_module(owner_company_id, 'customers')
    END
  );

DROP POLICY IF EXISTS customers_insert ON customers;
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (
    NOT public.is_customer_user()
    AND public.can_write_module(owner_company_id, 'customers')
  );

DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND public.can_write_module(owner_company_id, 'customers')
  );

-- Equipment follows customer access
DROP POLICY IF EXISTS equipment_select ON equipment;
CREATE POLICY equipment_select ON equipment FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN customer_id = public.current_customer_id()
      ELSE
        owner_company_id = public.current_company_id()
        OR public.can_read_module(owner_company_id, 'customers')
    END
  );

DROP POLICY IF EXISTS equipment_insert ON equipment;
CREATE POLICY equipment_insert ON equipment FOR INSERT
  WITH CHECK (
    NOT public.is_customer_user()
    AND public.can_write_module(owner_company_id, 'customers')
  );

DROP POLICY IF EXISTS equipment_update ON equipment;
CREATE POLICY equipment_update ON equipment FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND public.can_write_module(owner_company_id, 'customers')
  );

-- Quotes
DROP POLICY IF EXISTS quote_requests_select ON quote_requests;
CREATE POLICY quote_requests_select ON quote_requests FOR SELECT
  USING (
    owner_company_id = public.current_company_id()
    OR created_by_company_id = public.current_company_id()
    OR public.can_read_module(owner_company_id, 'quotes')
  );

DROP POLICY IF EXISTS quote_requests_insert ON quote_requests;
CREATE POLICY quote_requests_insert ON quote_requests FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'quotes')
    AND NOT public.is_customer_user()
  );

-- Inventory
DROP POLICY IF EXISTS inventory_items_all ON inventory_items;
CREATE POLICY inventory_items_select ON inventory_items FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND (
      company_id = public.current_company_id()
      OR public.can_read_module(company_id, 'inventory')
    )
  );

CREATE POLICY inventory_items_write ON inventory_items FOR ALL
  USING (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'inventory')
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'inventory')
  );

DROP POLICY IF EXISTS inventory_movements_select ON inventory_movements;
CREATE POLICY inventory_movements_select ON inventory_movements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inventory_items i
      WHERE i.id = item_id
        AND (
          i.company_id = public.current_company_id()
          OR public.can_read_module(i.company_id, 'inventory')
        )
    )
  );

-- Tools
DROP POLICY IF EXISTS tools_all ON tools;
CREATE POLICY tools_select ON tools FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND (
      company_id = public.current_company_id()
      OR public.can_read_module(company_id, 'tools')
    )
  );

CREATE POLICY tools_write ON tools FOR ALL
  USING (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'tools')
  )
  WITH CHECK (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'tools')
  );

DROP POLICY IF EXISTS tool_loans_all ON tool_loans;
CREATE POLICY tool_loans_all ON tool_loans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tools t
      WHERE t.id = tool_id
        AND public.can_write_module(t.company_id, 'tools')
    )
    AND NOT public.is_customer_user()
  );
