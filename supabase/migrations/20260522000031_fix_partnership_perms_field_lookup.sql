-- Fix partnership permission field lookup to match schema + ownership trigger.
-- permissions_a_to_b = company A acting on company B's registry
-- permissions_b_to_a = company B acting on company A's registry
-- company_a admin may edit permissions_b_to_a; company_b admin may edit permissions_a_to_b.
-- Migration 20260521000019 inverted this lookup and moved dev seed grants to the wrong field.

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

-- Undo migration 19 data move for BC ↔ UKH: UKH (company_b admin) grants belong in permissions_a_to_b.
UPDATE company_partnerships
SET
  permissions_a_to_b = CASE
    WHEN permissions_a_to_b = '{}'::jsonb OR permissions_a_to_b IS NULL
      THEN permissions_b_to_a
    ELSE permissions_a_to_b
  END,
  permissions_b_to_a = '{}'::jsonb
WHERE company_a_id = '11111111-1111-4111-8111-111111111111'
  AND company_b_id = '22222222-2222-4222-8222-222222222222'
  AND permissions_b_to_a != '{}'::jsonb
  AND (permissions_a_to_b = '{}'::jsonb OR permissions_a_to_b IS NULL);
