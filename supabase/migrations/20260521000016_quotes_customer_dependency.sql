-- Tarjouspyynnöt require customers read when write access is granted.

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
  qt TEXT := COALESCE(p ->> 'quotes', 'none');
BEGIN
  IF wr = 'write' OR mr = 'write' OR qt = 'write' THEN
    IF cu = 'none' THEN
      p := jsonb_set(p, '{customers}', '"read"');
    END IF;
  END IF;

  RETURN p;
END;
$$;

ALTER TABLE company_partnerships DISABLE TRIGGER partnerships_permission_ownership;

UPDATE company_partnerships
SET
  permissions_a_to_b = public.apply_partnership_dependencies(permissions_a_to_b),
  permissions_b_to_a = public.apply_partnership_dependencies(permissions_b_to_a);

ALTER TABLE company_partnerships ENABLE TRIGGER partnerships_permission_ownership;
