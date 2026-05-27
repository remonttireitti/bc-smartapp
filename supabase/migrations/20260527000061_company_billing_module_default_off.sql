-- Laskutusmoduuli opt-in: oletus pois kun module_enabled puuttuu.

CREATE OR REPLACE FUNCTION public.company_billing_module_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (c.settings -> 'billing' ->> 'module_enabled')::boolean
      FROM companies c
      WHERE c.id = p_company_id
    ),
    false
  );
$$;
