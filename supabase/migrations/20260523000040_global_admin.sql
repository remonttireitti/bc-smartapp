-- Global admin flag + cross-tenant visibility and reassignment tools.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_global_admin FROM profiles WHERE id = auth.uid()),
    false
  );
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
  IF public.is_global_admin() THEN
    RETURN true;
  END IF;

  IF cid IS NULL THEN
    RETURN false;
  END IF;

  IF row_owner_company = cid OR row_created_by_company = cid THEN
    RETURN true;
  END IF;

  IF row_created_by_company IS NOT NULL AND public.partnership_permission(cid, row_created_by_company, 'view_partner_reports') THEN
    RETURN true;
  END IF;

  RETURN public.partnership_permission(cid, row_owner_company, 'view_partner_reports')
      OR public.partnership_permission(cid, row_owner_company, 'view_customers');
END;
$$;

DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE
  USING (
    (owner_company_id = public.current_company_id() OR public.is_global_admin())
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS equipment_update ON equipment;
CREATE POLICY equipment_update ON equipment FOR UPDATE
  USING (
    (owner_company_id = public.current_company_id() OR public.is_global_admin())
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS work_reports_update ON work_reports;
CREATE POLICY work_reports_update ON work_reports FOR UPDATE
  USING (
    (public.can_see_company_row(owner_company_id, created_by_company_id) OR public.is_global_admin())
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS maintenance_reports_update ON maintenance_reports;
CREATE POLICY maintenance_reports_update ON maintenance_reports FOR UPDATE
  USING (
    (public.can_see_company_row(owner_company_id, created_by_company_id) OR public.is_global_admin())
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS quote_requests_update ON quote_requests;
CREATE POLICY quote_requests_update ON quote_requests FOR UPDATE
  USING (
    (public.can_see_company_row(owner_company_id, created_by_company_id) OR public.is_global_admin())
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies FOR SELECT
  USING (
    public.is_global_admin()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.company_id = companies.id
    )
    OR EXISTS (
      SELECT 1 FROM company_partnerships cp
      WHERE cp.status = 'active'
        AND (
          (cp.company_a_id = public.current_company_id() AND cp.company_b_id = companies.id)
          OR (cp.company_b_id = public.current_company_id() AND cp.company_a_id = companies.id)
        )
    )
  );

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    public.is_global_admin()
    OR id = auth.uid()
    OR company_id = public.current_company_id()
  );

CREATE OR REPLACE FUNCTION public.global_admin_reassign_entities(
  p_entity_type TEXT,
  p_ids UUID[],
  p_owner_company_id UUID DEFAULT NULL,
  p_created_by_company_id UUID DEFAULT NULL,
  p_branding_company_id UUID DEFAULT NULL,
  p_created_by_user_id UUID DEFAULT NULL,
  p_assigned_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER := 0;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Vain globaali admin';
  END IF;

  IF p_entity_type = 'work_reports' THEN
    UPDATE work_reports wr
    SET
      owner_company_id = COALESCE(p_owner_company_id, wr.owner_company_id),
      created_by_company_id = COALESCE(p_created_by_company_id, wr.created_by_company_id),
      branding_company_id = COALESCE(p_branding_company_id, wr.branding_company_id),
      created_by_user_id = COALESCE(p_created_by_user_id, wr.created_by_user_id),
      assigned_user_id = COALESCE(p_assigned_user_id, wr.assigned_user_id),
      updated_at = now()
    WHERE wr.id = ANY(p_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSIF p_entity_type = 'maintenance_reports' THEN
    UPDATE maintenance_reports mr
    SET
      owner_company_id = COALESCE(p_owner_company_id, mr.owner_company_id),
      created_by_company_id = COALESCE(p_created_by_company_id, mr.created_by_company_id),
      branding_company_id = COALESCE(p_branding_company_id, mr.branding_company_id),
      updated_at = now()
    WHERE mr.id = ANY(p_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSIF p_entity_type = 'customers' THEN
    UPDATE customers c
    SET owner_company_id = COALESCE(p_owner_company_id, c.owner_company_id), updated_at = now()
    WHERE c.id = ANY(p_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSIF p_entity_type = 'quote_requests' THEN
    UPDATE quote_requests q
    SET
      owner_company_id = COALESCE(p_owner_company_id, q.owner_company_id),
      created_by_company_id = COALESCE(p_created_by_company_id, q.created_by_company_id),
      branding_company_id = COALESCE(p_branding_company_id, q.branding_company_id),
      updated_at = now()
    WHERE q.id = ANY(p_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Tuntematon entity_type: %', p_entity_type;
  END IF;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.global_admin_reassign_entities(TEXT, UUID[], UUID, UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_admin_reassign_entities(TEXT, UUID[], UUID, UUID, UUID, UUID, UUID) TO authenticated;

-- Seed global admins (bestcool = vanha GA, info@remonttireitti.fi = uusi GA)
UPDATE profiles SET is_global_admin = true
WHERE lower(email) IN ('bestcool@bestcool.fi', 'info@remonttireitti.fi');
