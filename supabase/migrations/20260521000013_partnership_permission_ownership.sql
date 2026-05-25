-- Each company admin may only edit permissions they grant (partner acting in OUR name).

CREATE OR REPLACE FUNCTION public.enforce_partnership_permission_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := public.current_company_id();
BEGIN
  IF NOT public.is_company_admin() THEN
    RAISE EXCEPTION 'Vain ylläpitäjä voi muokata kumppanuusoikeuksia';
  END IF;

  IF cid IS NULL THEN
    RAISE EXCEPTION 'Yritys puuttuu profiilista';
  END IF;

  IF NEW.company_a_id = cid THEN
    IF NEW.permissions_a_to_b IS DISTINCT FROM OLD.permissions_a_to_b THEN
      RAISE EXCEPTION 'Et voi myöntää itsellesi oikeuksia toisen yrityksen nimissä — kumppanin ylläpitäjä määrittää sen';
    END IF;
  ELSIF NEW.company_b_id = cid THEN
    IF NEW.permissions_b_to_a IS DISTINCT FROM OLD.permissions_b_to_a THEN
      RAISE EXCEPTION 'Et voi myöntää itsellesi oikeuksia toisen yrityksen nimissä — kumppanin ylläpitäjä määrittää sen';
    END IF;
  ELSE
    RAISE EXCEPTION 'Ei oikeutta muokata tätä kumppanuutta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partnerships_permission_ownership ON company_partnerships;
CREATE TRIGGER partnerships_permission_ownership
  BEFORE UPDATE ON company_partnerships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_partnership_permission_ownership();

DROP POLICY IF EXISTS partnerships_update ON company_partnerships;
CREATE POLICY partnerships_update ON company_partnerships FOR UPDATE
  USING (
    public.is_company_admin()
    AND (
      company_a_id = public.current_company_id()
      OR company_b_id = public.current_company_id()
    )
  );

DROP POLICY IF EXISTS partnerships_insert ON company_partnerships;
CREATE POLICY partnerships_insert ON company_partnerships FOR INSERT
  WITH CHECK (
    public.is_company_admin()
    AND company_a_id = public.current_company_id()
  );
