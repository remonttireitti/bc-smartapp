-- Company-level opt-out from partnership discovery and new invites.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS partnership_discoverable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN companies.partnership_discoverable IS
  'When false, other companies cannot discover or invite this company as a partner.';

DROP POLICY IF EXISTS companies_select_partnership_invite ON companies;
CREATE POLICY companies_select_partnership_invite ON companies FOR SELECT
  USING (
    public.is_company_admin()
    AND id <> public.current_company_id()
    AND partnership_discoverable = true
    AND NOT EXISTS (
      SELECT 1
      FROM company_partnerships cp
      WHERE (
        (cp.company_a_id = public.current_company_id() AND cp.company_b_id = companies.id)
        OR (cp.company_b_id = public.current_company_id() AND cp.company_a_id = companies.id)
      )
    )
  );

DROP POLICY IF EXISTS partnerships_insert ON company_partnerships;
CREATE POLICY partnerships_insert ON company_partnerships FOR INSERT
  WITH CHECK (
    public.is_company_admin()
    AND company_a_id = public.current_company_id()
    AND EXISTS (
      SELECT 1
      FROM companies target
      WHERE target.id = company_b_id
        AND target.partnership_discoverable = true
    )
  );
