-- Kumppanin varasto kylmäaineelle: lähde partner_warehouse, saldon päivitys työraportin kautta.

ALTER TABLE work_report_refrigerant_lines
  DROP CONSTRAINT IF EXISTS work_report_refrigerant_lines_source_check;

ALTER TABLE work_report_refrigerant_lines
  ADD CONSTRAINT work_report_refrigerant_lines_source_check
  CHECK (source IN ('warehouse', 'partner_warehouse', 'supplier'));

ALTER TABLE work_report_refrigerant_lines
  ADD COLUMN IF NOT EXISTS warehouse_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.work_report_refrigerant_company_ids(p_work_report_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT cid
      FROM (
        SELECT w.owner_company_id AS cid FROM work_reports w WHERE w.id = p_work_report_id
        UNION
        SELECT w.created_by_company_id FROM work_reports w WHERE w.id = p_work_report_id
        UNION
        SELECT w.delegate_company_id FROM work_reports w WHERE w.id = p_work_report_id
      ) s
      WHERE cid IS NOT NULL
    ),
    ARRAY[]::UUID[]
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_use_refrigerant_on_report(p_work_report_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM work_reports w
    WHERE w.id = p_work_report_id
      AND NOT public.is_customer_user()
      AND (
        w.owner_company_id = public.current_company_id()
        OR w.created_by_company_id = public.current_company_id()
        OR w.delegate_company_id = public.current_company_id()
      )
  );
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

  IF NOT v_cylinder.company_id = ANY(v_allowed) THEN
    RAISE EXCEPTION 'Pullo ei kuulu tähän työraporttiin liittyvään yritykseen.';
  END IF;

  v_next_remaining := ROUND((v_cylinder.remaining_kg + p_delta_kg)::numeric, 3);

  IF v_next_remaining < -0.0005 THEN
    RAISE EXCEPTION 'Pullossa % (%) on vain % kg.',
      v_cylinder.serial_number, v_cylinder.refrigerant_type, v_cylinder.remaining_kg;
  END IF;

  v_next_remaining := GREATEST(0, LEAST(v_cylinder.purchased_kg, v_next_remaining));

  UPDATE public.refrigerant_cylinders
  SET
    remaining_kg = v_next_remaining,
    status = CASE WHEN v_next_remaining <= 0.005 THEN 'empty' ELSE 'in_stock' END
  WHERE id = p_cylinder_id;
END;
$$;

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
    c.status,
    p.display_name AS owner_display_name,
    p.email AS owner_email
  FROM public.refrigerant_cylinders c
  JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN public.profiles p ON p.id = c.owner_user_id
  WHERE c.company_id = ANY(public.work_report_refrigerant_company_ids(p_work_report_id))
    AND c.status <> 'retired'
    AND public.user_can_use_refrigerant_on_report(p_work_report_id)
    AND (
      c.remaining_kg > 0.005
      OR c.id = ANY(p_include_cylinder_ids)
    )
  ORDER BY co.name, c.serial_number;
$$;

GRANT EXECUTE ON FUNCTION public.apply_refrigerant_cylinder_delta(UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_refrigerant_cylinders_for_work_report(UUID, UUID[]) TO authenticated;
