-- Työraportin kylmäainerivin muokkauksessa palautus (+delta) ei poistanut vanhaa work_use-kirjausta,
-- jolloin uusi vähennys jätti historian tuplaksi (esim. 1,998 kg + 2,000 kg samalle työraportille).

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
    END
  );

  v_next_remaining := ROUND((v_cylinder.remaining_kg + p_delta_kg)::numeric, 3);

  IF v_next_remaining < -0.0005 THEN
    RAISE EXCEPTION 'Pullossa % on vain % kg.',
      COALESCE(NULLIF(TRIM(v_cylinder.serial_number), ''), '—'), v_cylinder.remaining_kg;
  END IF;

  v_next_remaining := GREATEST(0, LEAST(v_max_kg, v_next_remaining));

  IF p_work_report_id IS NOT NULL AND ABS(p_delta_kg) > 0.0005 THEN
    DELETE FROM public.refrigerant_cylinder_movements
    WHERE movement_type = 'work_use'
      AND work_report_id = p_work_report_id
      AND cylinder_id = p_cylinder_id;
  END IF;

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

-- Siivoa olemassa olevat tuplat: pidä rivi joka vastaa työraportin kylmäaineriviä tai uusin.
WITH ranked AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (
      PARTITION BY m.work_report_id, m.cylinder_id, m.refrigerant_type
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM work_report_refrigerant_lines l
            WHERE l.work_report_id = m.work_report_id
              AND l.cylinder_id = m.cylinder_id
              AND l.refrigerant_type = m.refrigerant_type
              AND ROUND(l.qty_kg::numeric, 3) = ROUND(m.qty_kg::numeric, 3)
          ) THEN 0
          ELSE 1
        END,
        m.created_at DESC
    ) AS rn
  FROM refrigerant_cylinder_movements m
  WHERE m.movement_type = 'work_use'
    AND m.work_report_id IS NOT NULL
    AND m.cylinder_id IS NOT NULL
)
DELETE FROM refrigerant_cylinder_movements
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
