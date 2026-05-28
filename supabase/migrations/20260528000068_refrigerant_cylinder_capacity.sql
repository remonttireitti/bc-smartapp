-- Pullovarasto: tilavuus (kg) ja tyhjät pullot varastossa.

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS capacity_kg NUMERIC(12,3);

UPDATE refrigerant_cylinders
SET capacity_kg = GREATEST(purchased_kg, remaining_kg)
WHERE capacity_kg IS NULL OR capacity_kg <= 0;

ALTER TABLE refrigerant_cylinders
  ALTER COLUMN capacity_kg SET DEFAULT 0;

UPDATE refrigerant_cylinders
SET capacity_kg = 11.3
WHERE (capacity_kg IS NULL OR capacity_kg <= 0) AND (purchased_kg > 0 OR remaining_kg > 0);

ALTER TABLE refrigerant_cylinders
  ALTER COLUMN refrigerant_type DROP NOT NULL;

COMMENT ON COLUMN refrigerant_cylinders.capacity_kg IS 'Pulmon nimellistilavuus (kg); purchased_kg pidetään synkassa rajana.';

-- Työraportissa: max täyttö = capacity_kg tai purchased_kg
CREATE OR REPLACE FUNCTION public.apply_refrigerant_cylinder_delta(
  p_cylinder_id UUID,
  p_delta_kg NUMERIC,
  p_work_report_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cylinder public.refrigerant_cylinders%ROWTYPE;
  v_next_remaining NUMERIC;
  v_max_kg NUMERIC;
  v_allowed UUID[];
  v_used NUMERIC;
BEGIN
  IF NOT public.user_can_use_refrigerant_on_report(p_work_report_id) THEN
    RAISE EXCEPTION 'Ei oikeutta käyttää kylmäainetta tällä raportilla.';
  END IF;

  v_allowed := public.work_report_refrigerant_company_ids(p_work_report_id);
  IF cardinality(v_allowed) = 0 THEN
    RAISE EXCEPTION 'Työraporttia ei löytynyt.';
  END IF;

  SELECT * INTO v_cylinder
  FROM public.refrigerant_cylinders
  WHERE id = p_cylinder_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kylmäainepulloa ei löytynyt.';
  END IF;

  IF v_cylinder.status IN ('recycled', 'returned') THEN
    RAISE EXCEPTION 'Pullo ei ole käytettävissä (status %).', v_cylinder.status;
  END IF;

  IF COALESCE(v_cylinder.remaining_kg, 0) <= 0.005 THEN
    RAISE EXCEPTION 'Pullo on tyhjä — täytä se ensin varastossa.';
  END IF;

  IF NOT v_cylinder.company_id = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Pullo ei kuulu tähän työraporttiin liittyvään yritykseen.';
  END IF;

  v_max_kg := GREATEST(
    COALESCE(NULLIF(v_cylinder.capacity_kg, 0), v_cylinder.purchased_kg),
    v_cylinder.purchased_kg
  );

  v_next_remaining := ROUND((v_cylinder.remaining_kg + p_delta_kg)::numeric, 3);

  IF v_next_remaining < -0.0005 THEN
    RAISE EXCEPTION 'Pullossa % on vain % kg.',
      v_cylinder.serial_number, v_cylinder.remaining_kg;
  END IF;

  v_next_remaining := GREATEST(0, LEAST(v_max_kg, v_next_remaining));

  IF p_delta_kg < -0.0005 THEN
    v_used := LEAST(ABS(p_delta_kg), v_cylinder.remaining_kg - v_next_remaining);
    IF v_used > 0.0005 THEN
      PERFORM public.log_refrigerant_cylinder_movement(
        v_cylinder.company_id,
        v_cylinder.id,
        'work_use',
        v_used,
        COALESCE(NULLIF(TRIM(v_cylinder.refrigerant_type), ''), '—'),
        v_cylinder.serial_number,
        v_cylinder.customer_id,
        v_cylinder.location,
        v_cylinder.ownership_type,
        p_work_report_id,
        NULL
      );
    END IF;
  END IF;

  UPDATE public.refrigerant_cylinders
  SET
    remaining_kg = v_next_remaining,
    status = CASE
      WHEN v_next_remaining <= 0.005 THEN 'empty'
      WHEN v_next_remaining >= v_max_kg - 0.05 THEN 'in_stock'
      ELSE 'in_stock'
    END
  WHERE id = p_cylinder_id;
END;
$$;

DROP FUNCTION IF EXISTS public.list_refrigerant_cylinders_for_work_report(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.list_refrigerant_cylinders_for_work_report(
  p_work_report_id UUID,
  p_include_cylinder_ids UUID[] DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  company_name TEXT,
  serial_number TEXT,
  refrigerant_type TEXT,
  purchased_kg NUMERIC,
  remaining_kg NUMERIC,
  capacity_kg NUMERIC,
  owner_user_id UUID,
  ownership_type TEXT,
  status TEXT,
  owner_display_name TEXT,
  owner_email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.company_id,
    co.name AS company_name,
    c.serial_number,
    c.refrigerant_type,
    c.purchased_kg,
    c.remaining_kg,
    COALESCE(NULLIF(c.capacity_kg, 0), c.purchased_kg) AS capacity_kg,
    c.owner_user_id,
    c.ownership_type,
    c.status,
    p.display_name AS owner_display_name,
    p.email AS owner_email
  FROM public.refrigerant_cylinders c
  JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.profiles p ON p.id = c.owner_user_id
  WHERE c.company_id = ANY(public.work_report_refrigerant_company_ids(p_work_report_id))
    AND c.status NOT IN ('retired', 'returned', 'recycled')
    AND public.user_can_use_refrigerant_on_report(p_work_report_id)
    AND (
      c.remaining_kg > 0.005
      OR c.id = ANY(p_include_cylinder_ids)
    )
  ORDER BY co.name, c.serial_number;
$$;
