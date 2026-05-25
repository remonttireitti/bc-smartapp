-- Fix partnership permission direction: owner company grants access via the correct JSON field.
-- permissions_a_to_b = what A allows B to do on A's data
-- permissions_b_to_a = what B allows A to do on B's data

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

  IF p.company_a_id = owner_company AND p.company_b_id = acting_company THEN
    perms := p.permissions_a_to_b;
  ELSIF p.company_b_id = owner_company AND p.company_a_id = acting_company THEN
    perms := p.permissions_b_to_a;
  ELSE
    RETURN public.default_partnership_permissions();
  END IF;

  RETURN public.apply_partnership_dependencies(perms);
END;
$$;

-- Dev seed had grants in the wrong field (X→Y should live in permissions_b_to_a).
UPDATE company_partnerships
SET
  permissions_b_to_a = CASE
    WHEN permissions_b_to_a = '{}'::jsonb OR permissions_b_to_a IS NULL
      THEN permissions_a_to_b
    ELSE permissions_b_to_a
  END,
  permissions_a_to_b = '{}'::jsonb
WHERE company_a_id = '11111111-1111-4111-8111-111111111111'
  AND company_b_id = '22222222-2222-4222-8222-222222222222'
  AND COALESCE((permissions_a_to_b ->> 'create_maintenance_reports_as_partner')::boolean, false);
