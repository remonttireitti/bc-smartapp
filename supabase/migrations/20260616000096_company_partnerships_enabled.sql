-- Yksinyritystila oletuksena: kumppanuus- ja moniyritystoiminnot pois päältä.
-- Olemassa oleville yrityksille, joilla on aktiivisia kumppanuuksia tai toimeksiantoja, kytketään päälle.

CREATE OR REPLACE FUNCTION public.company_partnerships_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (c.settings ->> 'partnerships_enabled')::boolean
      FROM companies c
      WHERE c.id = p_company_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.company_partnerships_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_partnerships_enabled(uuid) TO authenticated;

UPDATE companies c
SET
  settings = jsonb_set(
    COALESCE(c.settings, '{}'::jsonb),
    '{partnerships_enabled}',
    'true'::jsonb,
    true
  ),
  updated_at = now()
WHERE COALESCE((c.settings ->> 'partnerships_enabled')::boolean, false) = false
  AND (
    EXISTS (
      SELECT 1
      FROM company_partnerships cp
      WHERE cp.status = 'active'
        AND (cp.company_a_id = c.id OR cp.company_b_id = c.id)
    )
    OR EXISTS (
      SELECT 1
      FROM work_reports wr
      WHERE (
        wr.owner_company_id = c.id
        OR wr.created_by_company_id = c.id
        OR wr.delegate_company_id = c.id
      )
      AND (
        wr.delegate_company_id IS NOT NULL
        OR wr.partnership_id IS NOT NULL
      )
    )
  );
