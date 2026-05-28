-- Kylmäaine: asiakkaalta talteenotto, kierrätys, liikehistoria, raportointi.

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS stock_source TEXT NOT NULL DEFAULT 'purchase';

ALTER TABLE refrigerant_cylinders
  DROP CONSTRAINT IF EXISTS refrigerant_cylinders_stock_source_check;

ALTER TABLE refrigerant_cylinders
  ADD CONSTRAINT refrigerant_cylinders_stock_source_check
  CHECK (stock_source IN ('purchase', 'customer_retrieved'));

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE refrigerant_cylinders
  ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN refrigerant_cylinders.stock_source IS 'purchase = ostettu varastoon, customer_retrieved = asiakkaalta talteenotettu';
COMMENT ON COLUMN refrigerant_cylinders.location IS 'Fyysinen sijainti / missä pullo on';

CREATE TABLE IF NOT EXISTS refrigerant_cylinder_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cylinder_id UUID REFERENCES refrigerant_cylinders(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL,
  qty_kg NUMERIC(12,3) NOT NULL,
  refrigerant_type TEXT NOT NULL,
  serial_number TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  location TEXT,
  ownership_type TEXT,
  work_report_id UUID REFERENCES work_reports(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT refrigerant_cylinder_movements_type_check CHECK (
    movement_type IN ('purchase', 'customer_retrieve', 'work_use', 'adjustment', 'recycle', 'return_rental')
  )
);

CREATE INDEX IF NOT EXISTS refrigerant_cylinder_movements_company_created_idx
  ON refrigerant_cylinder_movements (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS refrigerant_cylinder_movements_cylinder_idx
  ON refrigerant_cylinder_movements (cylinder_id);

ALTER TABLE refrigerant_cylinder_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refrigerant_cylinder_movements_select ON refrigerant_cylinder_movements;
CREATE POLICY refrigerant_cylinder_movements_select ON refrigerant_cylinder_movements FOR SELECT
  USING (
    NOT public.is_customer_user()
    AND (
      company_id = public.current_company_id()
      OR public.can_read_module(company_id, 'inventory')
    )
  );

DROP POLICY IF EXISTS refrigerant_cylinder_movements_write ON refrigerant_cylinder_movements;
CREATE POLICY refrigerant_cylinder_movements_write ON refrigerant_cylinder_movements FOR INSERT
  WITH CHECK (
    NOT public.is_customer_user()
    AND public.can_write_module(company_id, 'inventory')
  );

CREATE OR REPLACE FUNCTION public.log_refrigerant_cylinder_movement(
  p_company_id UUID,
  p_cylinder_id UUID,
  p_movement_type TEXT,
  p_qty_kg NUMERIC,
  p_refrigerant_type TEXT,
  p_serial_number TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_ownership_type TEXT DEFAULT NULL,
  p_work_report_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.can_write_module(p_company_id, 'inventory') THEN
    RAISE EXCEPTION 'Ei oikeutta kirjata kylmäaineliikettä.';
  END IF;

  INSERT INTO public.refrigerant_cylinder_movements (
    company_id, cylinder_id, movement_type, qty_kg, refrigerant_type,
    serial_number, customer_id, location, ownership_type, work_report_id, notes, created_by
  ) VALUES (
    p_company_id, p_cylinder_id, p_movement_type, ROUND(p_qty_kg::numeric, 3), p_refrigerant_type,
    p_serial_number, p_customer_id, p_location, p_ownership_type, p_work_report_id, p_notes, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
    RAISE EXCEPTION 'Ei oikeutta merkitä kierrätykseen.';
  END IF;

  IF v_cylinder.status IN ('recycled', 'returned') THEN
    RAISE EXCEPTION 'Pullo on jo merkitty poistuneeksi varastosta.';
  END IF;

  v_qty := GREATEST(0, v_cylinder.remaining_kg);

  PERFORM public.log_refrigerant_cylinder_movement(
    v_cylinder.company_id,
    v_cylinder.id,
    'recycle',
    v_qty,
    v_cylinder.refrigerant_type,
    v_cylinder.serial_number,
    v_cylinder.customer_id,
    v_cylinder.location,
    v_cylinder.ownership_type,
    NULL,
    COALESCE(p_notes, 'Kierrätykseen toimitettu')
  );

  UPDATE public.refrigerant_cylinders
  SET remaining_kg = 0, status = 'recycled', updated_at = now()
  WHERE id = p_cylinder_id;
END;
$$;

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

  IF NOT v_cylinder.company_id = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Pullo ei kuulu tähän työraporttiin liittyvään yritykseen.';
  END IF;

  v_next_remaining := ROUND((v_cylinder.remaining_kg + p_delta_kg)::numeric, 3);

  IF v_next_remaining < -0.0005 THEN
    RAISE EXCEPTION 'Pullossa % (%) on vain % kg.',
      v_cylinder.serial_number, v_cylinder.refrigerant_type, v_cylinder.remaining_kg;
  END IF;

  v_next_remaining := GREATEST(0, LEAST(v_cylinder.purchased_kg, v_next_remaining));

  IF p_delta_kg < -0.0005 THEN
    v_used := LEAST(ABS(p_delta_kg), v_cylinder.remaining_kg - v_next_remaining);
    IF v_used > 0.0005 THEN
      PERFORM public.log_refrigerant_cylinder_movement(
        v_cylinder.company_id,
        v_cylinder.id,
        'work_use',
        v_used,
        v_cylinder.refrigerant_type,
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
      WHEN v_cylinder.status = 'recycled' THEN 'recycled'
      WHEN v_next_remaining <= 0.005 THEN 'empty'
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

GRANT EXECUTE ON FUNCTION public.log_refrigerant_cylinder_movement(
  UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refrigerant_cylinder_recycled(UUID, TEXT) TO authenticated;
