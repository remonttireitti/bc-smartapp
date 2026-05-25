-- Fix company visibility, partner customer creation, profile company join

DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies FOR SELECT
  USING (
    EXISTS (
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

DROP POLICY IF EXISTS customers_insert ON customers;
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (
    NOT public.is_customer_user()
    AND (
      owner_company_id = public.current_company_id()
      OR public.can_create_for_company(owner_company_id, 'create_work_reports_as_partner')
    )
  );

DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE
  USING (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

DROP POLICY IF EXISTS equipment_insert ON equipment;
CREATE POLICY equipment_insert ON equipment FOR INSERT
  WITH CHECK (
    NOT public.is_customer_user()
    AND (
      owner_company_id = public.current_company_id()
      OR public.can_create_for_company(owner_company_id, 'create_work_reports_as_partner')
    )
  );

-- Ensure dev partnership includes customer creation
UPDATE company_partnerships
SET permissions_a_to_b = permissions_a_to_b || '{"create_customers_as_partner": true}'::jsonb
WHERE company_a_id = '11111111-1111-4111-8111-111111111111'
  AND company_b_id = '22222222-2222-4222-8222-222222222222';
