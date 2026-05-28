-- Pullo-rekisteri: bottle_size, valinnainen sarjanumero, kierrätyskelpaamaton, käytön jälkeinen kohtelu.

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS bottle_size TEXT,
  ADD COLUMN IF NOT EXISTS non_recyclable BOOLEAN NOT NULL DEFAULT false;

UPDATE refrigerant_cylinders
SET bottle_size = CASE
  WHEN COALESCE(NULLIF(capacity_kg, 0), purchased_kg, 0) < 9 THEN 'small'
  WHEN COALESCE(NULLIF(capacity_kg, 0), purchased_kg, 0) < 18 THEN 'medium'
  ELSE 'large'
END
WHERE bottle_size IS NULL;

ALTER TABLE refrigerant_cylinders
  ALTER COLUMN bottle_size SET DEFAULT 'medium';

UPDATE refrigerant_cylinders SET bottle_size = 'medium' WHERE bottle_size IS NULL;

ALTER TABLE refrigerant_cylinders
  ALTER COLUMN bottle_size SET NOT NULL;

ALTER TABLE refrigerant_cylinders DROP CONSTRAINT IF EXISTS refrigerant_cylinders_bottle_size_check;
ALTER TABLE refrigerant_cylinders
  ADD CONSTRAINT refrigerant_cylinders_bottle_size_check
  CHECK (bottle_size IN ('small', 'medium', 'large'));

ALTER TABLE refrigerant_cylinders ALTER COLUMN serial_number DROP NOT NULL;

ALTER TABLE refrigerant_cylinders DROP CONSTRAINT IF EXISTS refrigerant_cylinders_company_id_serial_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS refrigerant_cylinders_company_serial_unique
  ON refrigerant_cylinders (company_id, serial_number)
  WHERE serial_number IS NOT NULL AND TRIM(serial_number) <> '';

ALTER TABLE refrigerant_cylinders DROP CONSTRAINT IF EXISTS refrigerant_cylinders_customer_retrieve_only;
ALTER TABLE refrigerant_cylinders
  ADD CONSTRAINT refrigerant_cylinders_customer_retrieve_only
  CHECK (customer_id IS NULL OR stock_source = 'customer_retrieved');

ALTER TABLE work_report_refrigerant_lines
  ADD COLUMN IF NOT EXISTS cylinder_disposition TEXT;

ALTER TABLE work_report_refrigerant_lines DROP CONSTRAINT IF EXISTS work_report_refrigerant_lines_cylinder_disposition_check;
ALTER TABLE work_report_refrigerant_lines
  ADD CONSTRAINT work_report_refrigerant_lines_cylinder_disposition_check
  CHECK (
    cylinder_disposition IS NULL
    OR cylinder_disposition IN ('partial_in_stock', 'empty_in_stock', 'return_to_supplier')
  );

COMMENT ON COLUMN refrigerant_cylinders.bottle_size IS 'Pulmon koko: small | medium | large';
COMMENT ON COLUMN refrigerant_cylinders.non_recyclable IS 'Kylmäaine ei kelpaa kierrätykseen';
COMMENT ON COLUMN work_report_refrigerant_lines.cylinder_disposition IS 'Pullossa jäljellä olevan aineen kohtelu työkäytön jälkeen';

CREATE OR REPLACE FUNCTION public.mark_refrigerant_cylinder_recycled(
  p_cylinder_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cylinder public.refrigerant_cylinders%ROWTYPE;
BEGIN
  SELECT * INTO v_cylinder
  FROM public.refrigerant_cylinders
  WHERE id = p_cylinder_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kylmäainepulloa ei löytynyt.';
  END IF;

  IF NOT public.can_write_module(v_cylinder.company_id, 'inventory') THEN
    RAISE EXCEPTION 'Ei oikeutta merkitä kierrätykseen.';
  END IF;

  IF COALESCE(v_cylinder.non_recyclable, false) THEN
    RAISE EXCEPTION 'Pullo on merkitty kierrätyskelpaamattomaksi aineelle.';
  END IF;

  IF v_cylinder.status = 'recycled' THEN
    RETURN;
  END IF;

  PERFORM public.log_refrigerant_cylinder_movement(
    v_cylinder.company_id,
    v_cylinder.id,
    'recycle',
    GREATEST(v_cylinder.remaining_kg, 0),
    COALESCE(NULLIF(TRIM(v_cylinder.refrigerant_type), ''), '—'),
    v_cylinder.serial_number,
    v_cylinder.customer_id,
    v_cylinder.location,
    v_cylinder.ownership_type,
    NULL,
    p_notes
  );

  UPDATE public.refrigerant_cylinders
  SET remaining_kg = 0, refrigerant_type = NULL, status = 'recycled'
  WHERE id = p_cylinder_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_refrigerant_cylinder_delta(
  p_cylinder_id UUID,
  p_delta_kg NUMERIC,
  p_work_report_id UUID,
  p_disposition TEXT DEFAULT NULL
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
  v_size TEXT;
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

  IF v_cylinder.status IN ('recycled', 'returned') AND p_delta_kg < -0.0005 THEN
    RAISE EXCEPTION 'Pullo ei ole käytettävissä (status %).', v_cylinder.status;
  END IF;

  IF NOT v_cylinder.company_id = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Pullo ei kuulu tähän työraporttiin liittyvään yritykseen.';
  END IF;

  IF p_delta_kg < -0.0005 AND COALESCE(v_cylinder.remaining_kg, 0) <= 0.005 THEN
    RAISE EXCEPTION 'Pullo on tyhjä — täytä se ensin varastossa.';
  END IF;

  v_size := COALESCE(v_cylinder.bottle_size, 'medium');
  v_max_kg := GREATEST(
    COALESCE(NULLIF(v_cylinder.capacity_kg, 0), v_cylinder.purchased_kg),
  CASE v_size
    WHEN 'small' THEN 10
    WHEN 'large' THEN 65
    ELSE 20
  END);

  v_next_remaining := ROUND((v_cylinder.remaining_kg + p_delta_kg)::numeric, 3);

  IF v_next_remaining < -0.0005 THEN
    RAISE EXCEPTION 'Pullossa % on vain % kg.',
      COALESCE(NULLIF(TRIM(v_cylinder.serial_number), ''), '—'), v_cylinder.remaining_kg;
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

  IF p_disposition = 'return_to_supplier' AND p_delta_kg < -0.0005 THEN
    UPDATE public.refrigerant_cylinders
    SET
      remaining_kg = 0,
      refrigerant_type = NULL,
      status = 'returned',
      returned_at = COALESCE(returned_at, NOW())
    WHERE id = p_cylinder_id;
    RETURN;
  END IF;

  UPDATE public.refrigerant_cylinders
  SET
    remaining_kg = v_next_remaining,
    status = CASE
      WHEN v_next_remaining <= 0.005 THEN 'empty'
      WHEN v_cylinder.status IN ('returned', 'empty') AND v_next_remaining > 0.005 THEN 'in_stock'
      ELSE 'in_stock'
    END,
    returned_at = CASE
      WHEN v_next_remaining > 0.005 AND v_cylinder.status = 'returned' THEN NULL
      ELSE returned_at
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
  bottle_size TEXT,
  non_recyclable BOOLEAN,
  owner_user_id UUID,
  ownership_type TEXT,
  status TEXT,
  notes TEXT,
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
    c.bottle_size,
    COALESCE(c.non_recyclable, false) AS non_recyclable,
    c.owner_user_id,
    c.ownership_type,
    c.status,
    c.notes,
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
  ORDER BY co.name, c.serial_number NULLS LAST, c.created_at;
$$;
