-- Tilaajat (moniasiakas-tilaaja): rekisteri, asiakaskohteet, raportit ja portaali

CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_id TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscribers_owner ON subscribers(owner_company_id);
CREATE INDEX idx_subscribers_name ON subscribers(owner_company_id, name);

CREATE TRIGGER subscribers_updated_at
  BEFORE UPDATE ON subscribers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_subscriber ON customers(subscriber_id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_subscriber ON profiles(subscriber_id) WHERE subscriber_id IS NOT NULL;

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL;

ALTER TABLE work_reports
  ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL;

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_reports_subscriber ON maintenance_reports(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_subscriber ON work_reports(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_subscriber ON quote_requests(subscriber_id);

-- Täytä raporttien tilaaja asiakkaan mukaan (historia)
UPDATE maintenance_reports mr
SET subscriber_id = c.subscriber_id
FROM customers c
WHERE mr.customer_id = c.id
  AND mr.subscriber_id IS NULL
  AND c.subscriber_id IS NOT NULL;

UPDATE work_reports wr
SET subscriber_id = c.subscriber_id
FROM customers c
WHERE wr.customer_id = c.id
  AND wr.subscriber_id IS NULL
  AND c.subscriber_id IS NOT NULL;

UPDATE quote_requests qr
SET subscriber_id = c.subscriber_id
FROM customers c
WHERE qr.customer_id = c.id
  AND qr.subscriber_id IS NULL
  AND c.subscriber_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_subscriber_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role = 'subscriber'::user_role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_subscriber_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT subscriber_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_read_subscriber(p_subscriber_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  owner UUID;
BEGIN
  IF p_subscriber_id IS NULL OR cid IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.owner_company_id INTO owner
  FROM subscribers s
  WHERE s.id = p_subscriber_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF owner = cid THEN
    RETURN true;
  END IF;

  RETURN public.can_read_module(owner, 'customers');
END;
$$;

CREATE OR REPLACE FUNCTION public.report_visible_to_subscriber(
  p_report_subscriber_id UUID,
  p_customer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid UUID := public.current_subscriber_id();
BEGIN
  IF sid IS NULL THEN
    RETURN false;
  END IF;

  IF p_report_subscriber_id IS NOT NULL AND p_report_subscriber_id = sid THEN
    RETURN true;
  END IF;

  IF p_customer_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = p_customer_id
      AND c.subscriber_id = sid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_report_subscriber_from_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cust_subscriber UUID;
BEGIN
  IF NEW.customer_id IS NULL OR NEW.subscriber_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.subscriber_id INTO cust_subscriber
  FROM customers c
  WHERE c.id = NEW.customer_id;

  IF cust_subscriber IS NOT NULL THEN
    NEW.subscriber_id := cust_subscriber;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_reports_sync_subscriber ON maintenance_reports;
CREATE TRIGGER maintenance_reports_sync_subscriber
  BEFORE INSERT OR UPDATE OF customer_id, subscriber_id ON maintenance_reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_report_subscriber_from_customer();

DROP TRIGGER IF EXISTS work_reports_sync_subscriber ON work_reports;
CREATE TRIGGER work_reports_sync_subscriber
  BEFORE INSERT OR UPDATE OF customer_id, subscriber_id ON work_reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_report_subscriber_from_customer();

DROP TRIGGER IF EXISTS quote_requests_sync_subscriber ON quote_requests;
CREATE TRIGGER quote_requests_sync_subscriber
  BEFORE INSERT OR UPDATE OF customer_id, subscriber_id ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_report_subscriber_from_customer();

-- subscribers RLS
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscribers_select ON subscribers;
CREATE POLICY subscribers_select ON subscribers FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN id = public.current_subscriber_id()
      WHEN public.is_customer_user() THEN false
      ELSE public.can_read_subscriber(id)
    END
  );

DROP POLICY IF EXISTS subscribers_insert ON subscribers;
CREATE POLICY subscribers_insert ON subscribers FOR INSERT
  WITH CHECK (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

DROP POLICY IF EXISTS subscribers_update ON subscribers;
CREATE POLICY subscribers_update ON subscribers FOR UPDATE
  USING (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

DROP POLICY IF EXISTS subscribers_delete ON subscribers;
CREATE POLICY subscribers_delete ON subscribers FOR DELETE
  USING (
    owner_company_id = public.current_company_id()
    AND public.is_company_admin()
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

-- Estä tilaaja-roolin muokkaus yrityksen rekisterissä
DROP POLICY IF EXISTS customers_insert ON customers;
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE
  USING (
    owner_company_id = public.current_company_id()
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

-- customers: tilaajan näkyvyys
DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN subscriber_id = public.current_subscriber_id()
      WHEN public.is_customer_user() THEN id = public.current_customer_id()
      ELSE public.can_read_customer(id)
    END
  );

-- equipment: tilaajan kohteet
DROP POLICY IF EXISTS equipment_select ON equipment;
CREATE POLICY equipment_select ON equipment FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = equipment.customer_id
            AND c.subscriber_id = public.current_subscriber_id()
        )
      WHEN public.is_customer_user() THEN customer_id = public.current_customer_id()
      ELSE public.can_read_customer(customer_id)
    END
  );

-- work reports
DROP POLICY IF EXISTS work_reports_select ON work_reports;
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        public.report_visible_to_subscriber(subscriber_id, customer_id)
        AND status IN ('completed', 'billed_partner', 'billed_customer')
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status IN ('completed', 'billed_partner', 'billed_customer')
      ELSE
        delegate_company_id = public.current_company_id()
        OR public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'work_reports'
        )
    END
  );

DROP POLICY IF EXISTS work_reports_insert ON work_reports;
CREATE POLICY work_reports_insert ON work_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'work_reports')
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND (subscriber_id IS NULL OR public.can_read_subscriber(subscriber_id))
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

DROP POLICY IF EXISTS work_reports_update ON work_reports;
CREATE POLICY work_reports_update ON work_reports FOR UPDATE
  USING (
    public.can_see_company_row(owner_company_id, created_by_company_id)
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

-- maintenance reports
DROP POLICY IF EXISTS maintenance_reports_select ON maintenance_reports;
CREATE POLICY maintenance_reports_select ON maintenance_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        public.report_visible_to_subscriber(subscriber_id, customer_id)
        AND status = 'submitted'
      WHEN public.is_customer_user() THEN
        customer_id = public.current_customer_id()
        AND status = 'submitted'
      ELSE
        public.can_read_partner_report(
          owner_company_id,
          created_by_company_id,
          customer_id,
          'maintenance_reports'
        )
    END
  );

DROP POLICY IF EXISTS maintenance_reports_insert ON maintenance_reports;
CREATE POLICY maintenance_reports_insert ON maintenance_reports FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'maintenance_reports')
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND (subscriber_id IS NULL OR public.can_read_subscriber(subscriber_id))
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

DROP POLICY IF EXISTS maintenance_reports_update ON maintenance_reports;
CREATE POLICY maintenance_reports_update ON maintenance_reports FOR UPDATE
  USING (
    public.can_see_company_row(owner_company_id, created_by_company_id)
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

-- quote requests
DROP POLICY IF EXISTS quote_requests_select ON quote_requests;
CREATE POLICY quote_requests_select ON quote_requests FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        public.report_visible_to_subscriber(subscriber_id, customer_id)
        AND status = 'sent'
      WHEN public.is_customer_user() THEN false
      ELSE public.can_read_partner_report(
        owner_company_id,
        created_by_company_id,
        customer_id,
        'quotes'
      )
    END
  );

DROP POLICY IF EXISTS quote_requests_insert ON quote_requests;
CREATE POLICY quote_requests_insert ON quote_requests FOR INSERT
  WITH CHECK (
    created_by_company_id = public.current_company_id()
    AND public.can_write_module(owner_company_id, 'quotes')
    AND (customer_id IS NULL OR public.can_read_customer(customer_id))
    AND (subscriber_id IS NULL OR public.can_read_subscriber(subscriber_id))
    AND NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
  );

DROP POLICY IF EXISTS quote_requests_update ON quote_requests;
CREATE POLICY quote_requests_update ON quote_requests FOR UPDATE
  USING (
    NOT public.is_customer_user()
    AND NOT public.is_subscriber_user()
    AND (
      owner_company_id = public.current_company_id()
      OR (
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'quotes')
      )
    )
  );

-- documents: tilaajan kohteet
DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        customer_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM customers c
          WHERE c.id = documents.customer_id
            AND c.subscriber_id = public.current_subscriber_id()
        )
      WHEN public.is_customer_user() THEN customer_id = public.current_customer_id()
      WHEN customer_id IS NOT NULL THEN public.can_read_customer(customer_id)
      ELSE public.can_see_company_row(owner_company_id)
    END
  );

-- Asiakasrekisterin luonti: valinnainen tilaaja
CREATE OR REPLACE FUNCTION public.create_customer_for_registry(
  p_owner_company_id UUID,
  p_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_subscriber_id UUID DEFAULT NULL
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created customers;
BEGIN
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Asiakkaan nimi on pakollinen';
  END IF;

  IF NOT public.can_create_customer(p_owner_company_id) THEN
    RAISE EXCEPTION 'Ei oikeutta luoda asiakasta valittuun rekisteriin';
  END IF;

  IF p_subscriber_id IS NOT NULL AND NOT public.can_read_subscriber(p_subscriber_id) THEN
    RAISE EXCEPTION 'Ei oikeutta valittuun tilaajaan';
  END IF;

  INSERT INTO customers (owner_company_id, name, address, city, phone, subscriber_id)
  VALUES (
    p_owner_company_id,
    trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    p_subscriber_id
  )
  RETURNING * INTO created;

  PERFORM public.ensure_partner_customer_access(created.id, created.owner_company_id);

  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_for_registry(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
