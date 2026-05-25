-- RLS helper functions: multi-tenant + partnership visibility

CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Active partnership between two companies (order-independent)
CREATE OR REPLACE FUNCTION public.partnership_between(c1 UUID, c2 UUID)
RETURNS company_partnerships
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM company_partnerships
  WHERE status = 'active'
    AND (
      (company_a_id = c1 AND company_b_id = c2)
      OR (company_a_id = c2 AND company_b_id = c1)
    )
  LIMIT 1;
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
DECLARE
  p company_partnerships;
  perms JSONB;
BEGIN
  IF acting_company = owner_company THEN
    RETURN true;
  END IF;

  SELECT * INTO p FROM public.partnership_between(acting_company, owner_company);
  IF p IS NULL THEN
    RETURN false;
  END IF;

  IF p.company_a_id = acting_company AND p.company_b_id = owner_company THEN
    perms := p.permissions_a_to_b;
  ELSE
    perms := p.permissions_b_to_a;
  END IF;

  RETURN COALESCE((perms ->> perm_key)::boolean, false);
END;
$$;

-- Row visible if own company owns/created OR partnership allows view
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

  IF row_created_by_company IS NOT NULL AND public.partnership_permission(cid, row_created_by_company, 'view_partner_reports') THEN
    RETURN true;
  END IF;

  RETURN public.partnership_permission(cid, row_owner_company, 'view_partner_reports')
      OR public.partnership_permission(cid, row_owner_company, 'view_customers');
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
DECLARE
  cid UUID := public.current_company_id();
BEGIN
  IF cid IS NULL THEN
    RETURN false;
  END IF;
  IF cid = target_owner_company THEN
    RETURN true;
  END IF;
  RETURN public.partnership_permission(cid, target_owner_company, perm_key);
END;
$$;

-- Customer portal: only own customer rows
CREATE OR REPLACE FUNCTION public.is_customer_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role = 'customer' FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM profiles WHERE id = auth.uid();
$$;
