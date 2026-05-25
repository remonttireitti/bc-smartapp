-- Tilaaja- ja asiakasportaali: työtilauksen lähetys palveluyritykselle

CREATE OR REPLACE FUNCTION public.subscriber_owns_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = p_customer_id
      AND c.subscriber_id = public.current_subscriber_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.portal_work_order_insert_ok(
  p_owner_company_id UUID,
  p_created_by_company_id UUID,
  p_customer_id UUID,
  p_subscriber_id UUID,
  p_status TEXT,
  p_assigned_user_id UUID,
  p_created_by_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cust_owner UUID;
BEGIN
  IF p_created_by_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  IF p_assigned_user_id IS NOT NULL THEN
    RETURN false;
  END IF;

  IF p_status IS DISTINCT FROM 'draft' THEN
    RETURN false;
  END IF;

  IF public.is_subscriber_user() THEN
    IF p_subscriber_id IS DISTINCT FROM public.current_subscriber_id() THEN
      RETURN false;
    END IF;
    IF p_customer_id IS NULL OR NOT public.subscriber_owns_customer(p_customer_id) THEN
      RETURN false;
    END IF;
    SELECT c.owner_company_id INTO cust_owner FROM customers c WHERE c.id = p_customer_id;
    RETURN cust_owner = p_owner_company_id
      AND p_created_by_company_id = p_owner_company_id;
  END IF;

  IF public.is_customer_user() THEN
    IF p_customer_id IS DISTINCT FROM public.current_customer_id() THEN
      RETURN false;
    END IF;
    IF p_subscriber_id IS NOT NULL THEN
      RETURN false;
    END IF;
    SELECT c.owner_company_id INTO cust_owner FROM customers c WHERE c.id = p_customer_id;
    RETURN cust_owner = p_owner_company_id
      AND p_created_by_company_id = p_owner_company_id;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_work_order_update_ok(p_report_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w work_reports;
BEGIN
  SELECT * INTO w FROM work_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF w.created_by_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  IF w.status IS DISTINCT FROM 'draft' THEN
    RETURN false;
  END IF;

  IF w.assigned_user_id IS NOT NULL THEN
    RETURN false;
  END IF;

  IF public.is_subscriber_user() THEN
    RETURN w.subscriber_id = public.current_subscriber_id();
  END IF;

  IF public.is_customer_user() THEN
    RETURN w.customer_id = public.current_customer_id();
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS work_reports_insert ON work_reports;
CREATE POLICY work_reports_insert ON work_reports FOR INSERT
  WITH CHECK (
    CASE
      WHEN public.is_subscriber_user() OR public.is_customer_user() THEN
        public.portal_work_order_insert_ok(
          owner_company_id,
          created_by_company_id,
          customer_id,
          subscriber_id,
          status::text,
          assigned_user_id,
          created_by_user_id
        )
      ELSE
        created_by_company_id = public.current_company_id()
        AND public.can_write_module(owner_company_id, 'work_reports')
        AND (customer_id IS NULL OR public.can_read_customer(customer_id))
        AND (subscriber_id IS NULL OR public.can_read_subscriber(subscriber_id))
        AND NOT public.is_customer_user()
        AND NOT public.is_subscriber_user()
    END
  );

DROP POLICY IF EXISTS work_reports_select ON work_reports;
CREATE POLICY work_reports_select ON work_reports FOR SELECT
  USING (
    CASE
      WHEN public.is_subscriber_user() THEN
        created_by_user_id = auth.uid()
        OR (
          public.report_visible_to_subscriber(subscriber_id, customer_id)
          AND status IN ('completed', 'billed_partner', 'billed_customer')
        )
      WHEN public.is_customer_user() THEN
        created_by_user_id = auth.uid()
        OR (
          customer_id = public.current_customer_id()
          AND status IN ('completed', 'billed_partner', 'billed_customer')
        )
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

DROP POLICY IF EXISTS work_reports_update ON work_reports;
CREATE POLICY work_reports_update ON work_reports FOR UPDATE
  USING (
    CASE
      WHEN public.is_subscriber_user() OR public.is_customer_user() THEN
        public.portal_work_order_update_ok(id)
      ELSE
        public.can_see_company_row(owner_company_id, created_by_company_id)
        AND NOT public.is_customer_user()
        AND NOT public.is_subscriber_user()
    END
  );

-- Laskutusrivi: yritys luo käsittelyssä (portaali ei kirjoita billing-tauluun)
