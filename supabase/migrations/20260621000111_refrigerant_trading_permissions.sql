-- Kylmäaineen kauppa: erillinen kumppanuusoikeus (oletus ei kukaan) + yrityksen avoin kauppa kaikille kumppaneille.

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
    "refrigerant_trading": "none",
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
  rt TEXT := 'none';
  tl TEXT := 'none';
  qt TEXT := 'none';
  branding BOOLEAN := false;
BEGIN
  IF perms IS NULL OR perms = '{}'::jsonb THEN
    RETURN result;
  END IF;

  IF jsonb_typeof(perms -> 'work_reports') = 'string' THEN
    result := result || perms;
    IF NOT (result ? 'refrigerant_trading') THEN
      result := jsonb_set(result, '{refrigerant_trading}', '"none"');
    END IF;
    RETURN result;
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
  result := jsonb_set(result, '{refrigerant_trading}', to_jsonb(rt));
  result := jsonb_set(result, '{tools}', to_jsonb(tl));
  result := jsonb_set(result, '{quotes}', to_jsonb(qt));
  result := jsonb_set(result, '{use_branding}', to_jsonb(branding));

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_refrigerant_trading_open_to_all_partners(p_owner_company UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (c.settings -> 'refrigerant' ->> 'trading_open_to_all_partners')::boolean
      FROM public.companies c
      WHERE c.id = p_owner_company
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_use_refrigerant_from_company(
  p_acting_company UUID,
  p_owner_company UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_acting_company IS NULL OR p_owner_company IS NULL THEN
    RETURN false;
  END IF;

  IF p_acting_company = p_owner_company THEN
    RETURN true;
  END IF;

  IF public.partnership_between(p_acting_company, p_owner_company) IS NULL THEN
    RETURN false;
  END IF;

  IF public.company_refrigerant_trading_open_to_all_partners(p_owner_company) THEN
    RETURN true;
  END IF;

  RETURN public.partnership_access_level(p_acting_company, p_owner_company, 'refrigerant_trading')
    IN ('read', 'write');
END;
$$;

CREATE OR REPLACE FUNCTION public.work_report_refrigerant_company_ids(p_work_report_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH report_companies AS (
    SELECT w.owner_company_id AS cid
    FROM public.work_reports w
    WHERE w.id = p_work_report_id
    UNION
    SELECT w.created_by_company_id
    FROM public.work_reports w
    WHERE w.id = p_work_report_id
    UNION
    SELECT w.delegate_company_id
    FROM public.work_reports w
    WHERE w.id = p_work_report_id
  ),
  base AS (
    SELECT DISTINCT rc.cid
    FROM report_companies rc
    WHERE rc.cid IS NOT NULL
  ),
  partner_inventory AS (
    SELECT DISTINCT partner_cid.cid
    FROM base b
    JOIN public.company_partnerships cp ON cp.status = 'active'
      AND (cp.company_a_id = b.cid OR cp.company_b_id = b.cid)
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN cp.company_a_id = b.cid THEN cp.company_b_id
          ELSE cp.company_a_id
        END AS cid
    ) partner_cid
    WHERE public.current_company_id() IS NOT NULL
      AND b.cid = public.current_company_id()
      AND public.can_use_refrigerant_from_company(b.cid, partner_cid.cid)
  )
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT all_ids.cid
      FROM (
        SELECT cid FROM base
        UNION
        SELECT cid FROM partner_inventory
      ) all_ids
      WHERE all_ids.cid IS NOT NULL
    ),
    ARRAY[]::UUID[]
  );
$$;
