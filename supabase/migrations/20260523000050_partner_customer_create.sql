-- Allow partners with work_reports write to create customers in partner registry.
-- Auto-share created customer to the creating partner (restricted partnerships).

CREATE OR REPLACE FUNCTION public.can_create_customer(p_owner_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_company_id() IS NOT NULL
    AND NOT public.is_customer_user()
    AND (
      public.can_write_module(p_owner_company_id, 'customers')
      OR (
        p_owner_company_id <> public.current_company_id()
        AND public.can_write_module(p_owner_company_id, 'work_reports')
      )
    );
$$;

DROP POLICY IF EXISTS customers_insert ON customers;
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (public.can_create_customer(owner_company_id));

CREATE OR REPLACE FUNCTION public.grant_partner_access_on_customer_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
  pid UUID;
BEGIN
  IF cid IS NULL OR cid = NEW.owner_company_id THEN
    RETURN NEW;
  END IF;

  IF NOT public.can_write_module(NEW.owner_company_id, 'work_reports') THEN
    RETURN NEW;
  END IF;

  pid := public.partnership_id_between(cid, NEW.owner_company_id);
  IF pid IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO customer_partner_access (partnership_id, customer_id, can_view, can_create_reports)
  VALUES (pid, NEW.id, true, true)
  ON CONFLICT (partnership_id, customer_id) DO UPDATE
  SET can_view = EXCLUDED.can_view,
      can_create_reports = EXCLUDED.can_create_reports;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_grant_partner_access ON customers;
CREATE TRIGGER customers_grant_partner_access
  AFTER INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_partner_access_on_customer_create();
