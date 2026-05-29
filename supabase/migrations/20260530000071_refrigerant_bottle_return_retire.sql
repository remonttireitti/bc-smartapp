-- Vuokrapullon palautus ja omistuspullon poisto varastosta.

ALTER TABLE refrigerant_cylinder_movements
  DROP CONSTRAINT IF EXISTS refrigerant_cylinder_movements_type_check;

ALTER TABLE refrigerant_cylinder_movements
  ADD CONSTRAINT refrigerant_cylinder_movements_type_check
  CHECK (
    movement_type IN (
      'purchase', 'customer_retrieve', 'work_use', 'adjustment',
      'recycle', 'return_rental', 'dispose'
    )
  );

CREATE OR REPLACE FUNCTION public.mark_refrigerant_cylinder_returned_rental(
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
  v_qty NUMERIC;
BEGIN
  SELECT * INTO v_cylinder
  FROM public.refrigerant_cylinders
  WHERE id = p_cylinder_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pulloa ei löytynyt.';
  END IF;

  IF NOT public.can_write_module(v_cylinder.company_id, 'inventory') THEN
    RAISE EXCEPTION 'Ei oikeutta merkitä palautetuksi.';
  END IF;

  IF v_cylinder.ownership_type <> 'rental' THEN
    RAISE EXCEPTION 'Vain vuokrapulloja voi palauttaa tukkurille.';
  END IF;

  IF v_cylinder.status IN ('recycled', 'returned', 'retired') THEN
    RAISE EXCEPTION 'Pullo on jo poistunut varastosta.';
  END IF;

  v_qty := GREATEST(0, v_cylinder.remaining_kg);

  PERFORM public.log_refrigerant_cylinder_movement(
    v_cylinder.company_id,
    v_cylinder.id,
    'return_rental',
    v_qty,
    COALESCE(NULLIF(TRIM(v_cylinder.refrigerant_type), ''), '—'),
    v_cylinder.serial_number,
    v_cylinder.customer_id,
    v_cylinder.location,
    v_cylinder.ownership_type,
    NULL,
    COALESCE(p_notes, 'Vuokrapullo palautettu')
  );

  UPDATE public.refrigerant_cylinders
  SET
    remaining_kg = 0,
    refrigerant_type = NULL,
    customer_id = NULL,
    stock_source = 'purchase',
    status = 'returned',
    returned_at = CURRENT_DATE,
    updated_at = now()
  WHERE id = p_cylinder_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_refrigerant_cylinder_retired(
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
  v_qty NUMERIC;
BEGIN
  SELECT * INTO v_cylinder
  FROM public.refrigerant_cylinders
  WHERE id = p_cylinder_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pulloa ei löytynyt.';
  END IF;

  IF NOT public.can_write_module(v_cylinder.company_id, 'inventory') THEN
    RAISE EXCEPTION 'Ei oikeutta poistaa pulloa varastosta.';
  END IF;

  IF v_cylinder.ownership_type <> 'owned' THEN
    RAISE EXCEPTION 'Vain omistuspulloja voi poistaa varastosta (myynti/hävitys).';
  END IF;

  IF v_cylinder.status IN ('recycled', 'returned', 'retired') THEN
    RAISE EXCEPTION 'Pullo on jo poistunut varastosta.';
  END IF;

  v_qty := GREATEST(0, v_cylinder.remaining_kg);

  PERFORM public.log_refrigerant_cylinder_movement(
    v_cylinder.company_id,
    v_cylinder.id,
    'dispose',
    v_qty,
    COALESCE(NULLIF(TRIM(v_cylinder.refrigerant_type), ''), '—'),
    v_cylinder.serial_number,
    v_cylinder.customer_id,
    v_cylinder.location,
    v_cylinder.ownership_type,
    NULL,
    COALESCE(p_notes, 'Poistettu varastosta')
  );

  UPDATE public.refrigerant_cylinders
  SET
    remaining_kg = 0,
    refrigerant_type = NULL,
    customer_id = NULL,
    stock_source = 'purchase',
    status = 'retired',
    updated_at = now()
  WHERE id = p_cylinder_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_refrigerant_cylinder_returned_rental(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refrigerant_cylinder_retired(UUID, TEXT) TO authenticated;
