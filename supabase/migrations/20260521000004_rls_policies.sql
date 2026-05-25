-- Row Level Security policies

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_partner_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_report_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_loans ENABLE ROW LEVEL SECURITY;

-- Companies: see own + partners
CREATE POLICY companies_select ON companies FOR SELECT
  USING (
    id = public.current_company_id()
    OR EXISTS (
      SELECT 1 FROM company_partnerships p
      WHERE p.status = 'active'
        AND (p.company_a_id = public.current_company_id() OR p.company_b_id = public.current_company_id())
        AND (p.company_a_id = companies.id OR p.company_b_id = companies.id)
    )
  );

CREATE POLICY companies_update ON companies FOR UPDATE
  USING (id = public.current_company_id());

-- Profiles
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    company_id = public.current_company_id()
    OR id = auth.uid()
  );

CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Partnerships
CREATE POLICY partnerships_select ON company_partnerships FOR SELECT
  USING (
    company_a_id = public.current_company_id()
    OR company_b_id = public.current_company_id()
  );

CREATE POLICY partnerships_insert ON company_partnerships FOR INSERT
  WITH CHECK (company_a_id = public.current_company_id());

CREATE POLICY partnerships_update ON company_partnerships FOR UPDATE
  USING (
    company_a_id = public.current_company_id()
    OR company_b_id = public.current_company_id()
  );

-- Customers
CREATE POLICY customers_select ON customers FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN id = public.current_customer_id()
      ELSE public.can_see_company_row(owner_company_id)
    END
  );

CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY customers_update ON customers FOR UPDATE
  USING (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

-- Equipment
CREATE POLICY equipment_select ON equipment FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN customer_id = public.current_customer_id()
      ELSE public.can_see_company_row(owner_company_id)
    END
  );

CREATE POLICY equipment_insert ON equipment FOR INSERT
  WITH CHECK (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

CREATE POLICY equipment_update ON equipment FOR UPDATE
  USING (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
  );

-- Work reports
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status IN ('completed', 'billed_partner', 'billed_customer')
      ELSE
        public.can_see_company_row(owner_company_id, created_by_company_id)
    END
  );

CREATE POLICY work_reports_insert ON work_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_create_for_company(owner_company_id, 'create_work_reports_as_partner')
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_reports_update ON work_reports FOR UPDATE
  USING (
    public.can_see_company_row(owner_company_id, created_by_company_id)
    AND NOT public.is_customer_user()
  );

-- Maintenance reports
CREATE POLICY maintenance_reports_select ON maintenance_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status = 'submitted'
      ELSE
        public.can_see_company_row(owner_company_id, created_by_company_id)
    END
  );

CREATE POLICY maintenance_reports_insert ON maintenance_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_create_for_company(owner_company_id, 'create_maintenance_reports_as_partner')
    AND NOT public.is_customer_user()
  );

CREATE POLICY maintenance_reports_update ON maintenance_reports FOR UPDATE
  USING (
    public.can_see_company_row(owner_company_id, created_by_company_id)
    AND NOT public.is_customer_user()
  );

-- Billing & lines (via work report access)
CREATE POLICY work_report_billing_select ON work_report_billing FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_report_billing_all ON work_report_billing FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND (w.owner_company_id = public.current_company_id() OR w.created_by_company_id = public.current_company_id())
    )
    AND NOT public.is_customer_user()
  );

CREATE POLICY work_report_lines_select ON work_report_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND public.can_see_company_row(w.owner_company_id, w.created_by_company_id)
    )
  );

CREATE POLICY work_report_lines_all ON work_report_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM work_reports w
      WHERE w.id = work_report_id
        AND (w.owner_company_id = public.current_company_id() OR w.created_by_company_id = public.current_company_id())
    )
    AND NOT public.is_customer_user()
  );

-- Form templates
CREATE POLICY form_templates_select ON form_templates FOR SELECT
  USING (public.can_see_company_row(owner_company_id));

CREATE POLICY form_templates_manage ON form_templates FOR ALL
  USING (owner_company_id = public.current_company_id() AND NOT public.is_customer_user());

-- Quotes, inventory, tools: company-scoped
CREATE POLICY quote_requests_select ON quote_requests FOR SELECT
  USING (public.can_see_company_row(owner_company_id, created_by_company_id));

CREATE POLICY quote_requests_insert ON quote_requests FOR INSERT
  WITH CHECK (created_by_company_id = public.current_company_id() AND NOT public.is_customer_user());

CREATE POLICY inventory_items_all ON inventory_items FOR ALL
  USING (company_id = public.current_company_id() AND NOT public.is_customer_user());

CREATE POLICY inventory_movements_select ON inventory_movements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inventory_items i
      WHERE i.id = item_id AND i.company_id = public.current_company_id()
    )
  );

CREATE POLICY tools_all ON tools FOR ALL
  USING (company_id = public.current_company_id() AND NOT public.is_customer_user());

CREATE POLICY tool_loans_all ON tool_loans FOR ALL
  USING (
    EXISTS (SELECT 1 FROM tools t WHERE t.id = tool_id AND t.company_id = public.current_company_id())
    AND NOT public.is_customer_user()
  );

CREATE POLICY documents_select ON documents FOR SELECT
  USING (
    CASE
      WHEN public.is_customer_user() THEN customer_id = public.current_customer_id()
      ELSE public.can_see_company_row(owner_company_id)
    END
  );

CREATE POLICY documents_insert ON documents FOR INSERT
  WITH CHECK (owner_company_id = public.current_company_id() AND NOT public.is_customer_user());
