-- Kumppanivarasto työraportilla: salli raportin omistajan kumppanit + inventory-oikeus varmuudeksi.

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

  IF public.partnership_access_level(p_acting_company, p_owner_company, 'refrigerant_trading')
    IN ('read', 'write') THEN
    RETURN true;
  END IF;

  -- Taaksepäin yhteensopiva: varasto-oikeus riittää, jos kylmäaineen kauppa ei ole erikseen rajattu.
  RETURN public.partnership_access_level(p_acting_company, p_owner_company, 'inventory')
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
  WITH report AS (
    SELECT w.owner_company_id, w.created_by_company_id, w.delegate_company_id
    FROM public.work_reports w
    WHERE w.id = p_work_report_id
  ),
  report_companies AS (
    SELECT owner_company_id AS cid FROM report
    UNION
    SELECT created_by_company_id FROM report
    UNION
    SELECT delegate_company_id FROM report
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
    CROSS JOIN report r
    WHERE public.current_company_id() IS NOT NULL
      AND public.can_use_refrigerant_from_company(b.cid, partner_cid.cid)
      AND (
        b.cid = public.current_company_id()
        OR (
          b.cid = r.owner_company_id
          AND r.created_by_company_id = public.current_company_id()
          AND r.owner_company_id IS DISTINCT FROM r.created_by_company_id
        )
      )
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
