-- Auto-require customers read when partner can create work/maintenance reports.
-- Equipment registry follows customers access in RLS.

CREATE OR REPLACE FUNCTION public.apply_partnership_dependencies(perms JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  p JSONB := public.normalize_partnership_permissions(perms);
  cu TEXT := COALESCE(p ->> 'customers', 'none');
  wr TEXT := COALESCE(p ->> 'work_reports', 'none');
  mr TEXT := COALESCE(p ->> 'maintenance_reports', 'none');
BEGIN
  IF wr = 'write' OR mr = 'write' THEN
    IF cu = 'none' THEN
      p := jsonb_set(p, '{customers}', '"read"');
    END IF;
  END IF;

  RETURN p;
END;
$$;

CREATE OR REPLACE FUNCTION public.partnership_perms_for(acting_company UUID, owner_company UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p company_partnerships;
  perms JSONB;
BEGIN
  IF acting_company IS NULL OR owner_company IS NULL THEN
    RETURN public.default_partnership_permissions();
  END IF;

  IF acting_company = owner_company THEN
    RETURN NULL;
  END IF;

  SELECT * INTO p FROM public.partnership_between(acting_company, owner_company);
  IF p IS NULL THEN
    RETURN public.default_partnership_permissions();
  END IF;

  IF p.company_a_id = acting_company AND p.company_b_id = owner_company THEN
    perms := p.permissions_a_to_b;
  ELSE
    perms := p.permissions_b_to_a;
  END IF;

  RETURN public.apply_partnership_dependencies(perms);
END;
$$;

CREATE OR REPLACE FUNCTION public.partnerships_apply_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.permissions_a_to_b := public.apply_partnership_dependencies(NEW.permissions_a_to_b);
  NEW.permissions_b_to_a := public.apply_partnership_dependencies(NEW.permissions_b_to_a);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partnerships_apply_dependencies ON company_partnerships;
CREATE TRIGGER partnerships_apply_dependencies
  BEFORE INSERT OR UPDATE ON company_partnerships
  FOR EACH ROW EXECUTE FUNCTION public.partnerships_apply_dependencies();

-- Re-apply to existing rows
ALTER TABLE company_partnerships DISABLE TRIGGER partnerships_permission_ownership;

UPDATE company_partnerships
SET
  permissions_a_to_b = public.apply_partnership_dependencies(permissions_a_to_b),
  permissions_b_to_a = public.apply_partnership_dependencies(permissions_b_to_a);

ALTER TABLE company_partnerships ENABLE TRIGGER partnerships_permission_ownership;
