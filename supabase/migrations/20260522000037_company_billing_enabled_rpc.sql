-- Reliable company billing flag check (bypasses RLS quirks on client-side profile scans).

CREATE OR REPLACE FUNCTION public.company_has_billable_billing(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.company_id = p_company_id
      AND p.role <> 'customer'
      AND (p.bill_hours_enabled OR p.bill_expenses_enabled)
  );
$$;

REVOKE ALL ON FUNCTION public.company_has_billable_billing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_has_billable_billing(uuid) TO authenticated;
