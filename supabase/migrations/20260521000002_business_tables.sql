-- Customers, equipment, documents, forms, work & maintenance reports, inventory

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('finnish', coalesce(name, '') || ' ' || coalesce(address, '') || ' ' || coalesce(city, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_partner_access (
  partnership_id UUID NOT NULL REFERENCES company_partnerships(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create_reports BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (partnership_id, customer_id)
);

CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag TEXT,
  name TEXT NOT NULL,
  model TEXT,
  serial_number TEXT,
  location TEXT,
  notes TEXT,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('finnish', coalesce(tag, '') || ' ' || coalesce(name, '') || ' ' || coalesce(serial_number, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  schema JSONB NOT NULL DEFAULT '{"fields":[]}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_company_id, slug, version)
);

CREATE TABLE maintenance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branding_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partnership_id UUID REFERENCES company_partnerships(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  template_id UUID REFERENCES form_templates(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE work_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branding_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partnership_id UUID REFERENCES company_partnerships(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  location_text TEXT,
  status work_status NOT NULL DEFAULT 'scheduled',
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE work_report_billing (
  work_report_id UUID PRIMARY KEY REFERENCES work_reports(id) ON DELETE CASCADE,
  partner_invoice_status invoice_status NOT NULL DEFAULT 'none',
  partner_invoice_amount NUMERIC(12,2),
  partner_billed_at TIMESTAMPTZ,
  billed_to_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  customer_invoice_status invoice_status NOT NULL DEFAULT 'none',
  customer_invoice_amount NUMERIC(12,2),
  customer_billed_at TIMESTAMPTZ,
  external_invoice_ref TEXT,
  notes TEXT
);

CREATE TABLE work_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL DEFAULT 'labor',
  description TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  bill_to TEXT NOT NULL DEFAULT 'customer',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kpl',
  qty_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  work_report_id UUID REFERENCES work_reports(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tag_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  assigned_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_service_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tool_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  work_report_id UUID REFERENCES work_reports(id) ON DELETE SET NULL,
  loaned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ
);

-- FK: customer portal links profile to customer
ALTER TABLE profiles
  ADD CONSTRAINT profiles_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX idx_customers_owner ON customers(owner_company_id);
CREATE INDEX idx_customers_search ON customers USING GIN(search_vector);
CREATE INDEX idx_equipment_owner ON equipment(owner_company_id);
CREATE INDEX idx_equipment_customer ON equipment(customer_id);
CREATE INDEX idx_equipment_search ON equipment USING GIN(search_vector);
CREATE INDEX idx_work_reports_owner ON work_reports(owner_company_id);
CREATE INDEX idx_work_reports_created_by ON work_reports(created_by_company_id);
CREATE INDEX idx_work_reports_assigned ON work_reports(assigned_user_id);
CREATE INDEX idx_work_reports_scheduled ON work_reports(scheduled_start);
CREATE INDEX idx_work_reports_status ON work_reports(status);
CREATE INDEX idx_maintenance_owner ON maintenance_reports(owner_company_id);
CREATE INDEX idx_maintenance_created_by ON maintenance_reports(created_by_company_id);

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER equipment_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER work_reports_updated_at BEFORE UPDATE ON work_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER maintenance_reports_updated_at BEFORE UPDATE ON maintenance_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tools_updated_at BEFORE UPDATE ON tools FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quote_requests_updated_at BEFORE UPDATE ON quote_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
