-- Kumppanin varasto: salli kylmäainepullot kumppanuusyritykseltä, jolla on varasto-oikeus.

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
    SELECT DISTINCT
      CASE
        WHEN cp.company_a_id = b.cid THEN cp.company_b_id
        ELSE cp.company_a_id
      END AS cid
    FROM base b
    JOIN public.company_partnerships cp ON cp.status = 'active'
      AND (cp.company_a_id = b.cid OR cp.company_b_id = b.cid)
    WHERE public.current_company_id() IS NOT NULL
      AND b.cid = public.current_company_id()
      AND public.partnership_access_level(
        public.current_company_id(),
        CASE WHEN cp.company_a_id = b.cid THEN cp.company_b_id ELSE cp.company_a_id END,
        'inventory'
      ) IN ('read', 'write')
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
