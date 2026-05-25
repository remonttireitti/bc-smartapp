-- Company admins must see non-partner companies to invite them as partners.
-- Existing policy only exposes own company + current partners.

CREATE POLICY companies_select_partnership_invite ON companies FOR SELECT
  USING (
    public.is_company_admin()
    AND id <> public.current_company_id()
    AND NOT EXISTS (
      SELECT 1
      FROM company_partnerships cp
      WHERE (
        (cp.company_a_id = public.current_company_id() AND cp.company_b_id = companies.id)
        OR (cp.company_b_id = public.current_company_id() AND cp.company_a_id = companies.id)
      )
    )
  );
