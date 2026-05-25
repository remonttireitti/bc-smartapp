-- BC Smartapp: core multi-tenant + partnership foundation

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles within a company
CREATE TYPE user_role AS ENUM (
  'admin',
  'manager',
  'technician',
  'customer'
);

CREATE TYPE partnership_status AS ENUM (
  'pending',
  'active',
  'suspended'
);

CREATE TYPE work_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'billed_partner',
  'billed_customer'
);

CREATE TYPE invoice_status AS ENUM (
  'none',
  'draft',
  'sent',
  'paid',
  'cancelled'
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE RESTRICT,
  role user_role NOT NULL DEFAULT 'technician',
  customer_id UUID,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE company_partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_a_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_b_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status partnership_status NOT NULL DEFAULT 'pending',
  -- Permissions for A acting on behalf of B
  permissions_a_to_b JSONB NOT NULL DEFAULT '{}',
  -- Permissions for B acting on behalf of A
  permissions_b_to_a JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_a_id, company_b_id),
  CHECK (company_a_id <> company_b_id)
);

CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_partnerships_a ON company_partnerships(company_a_id) WHERE status = 'active';
CREATE INDEX idx_partnerships_b ON company_partnerships(company_b_id) WHERE status = 'active';

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER partnerships_updated_at
  BEFORE UPDATE ON company_partnerships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
