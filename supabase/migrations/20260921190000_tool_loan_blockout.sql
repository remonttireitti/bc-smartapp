-- Owner blockouts ≠ loans. Distinguish sulku (is_blockout) from real tool_loans.

ALTER TABLE tool_loans
  ADD COLUMN IF NOT EXISTS is_blockout BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tool_loans.is_blockout IS
  'True = omistajan sulku (ei lainaa). Sulkee kalenteriaikoja; ei näytetä Lainassa / Nykyinen lainaaja.';

-- Legacy: open "loans" on non-loanable tools were used as calendar blockouts.
UPDATE tool_loans tl
SET is_blockout = true
FROM tools t
WHERE tl.tool_id = t.id
  AND tl.returned_at IS NULL
  AND COALESCE(tl.is_blockout, false) = false
  AND COALESCE(t.is_loanable, true) = false;

-- Clear loaned status when only blockouts (or nothing) remain open.
UPDATE tools t
SET status = 'available',
    assigned_user_id = NULL
WHERE t.status = 'loaned'
  AND NOT EXISTS (
    SELECT 1
    FROM tool_loans tl
    WHERE tl.tool_id = t.id
      AND tl.returned_at IS NULL
      AND COALESCE(tl.is_blockout, false) = false
  );

-- Public busy ranges: mark blockouts; still only expose loanable tools' busy windows.
CREATE OR REPLACE FUNCTION public.get_tools_booking_public(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_tools JSONB;
  v_busy JSONB;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Virheellinen varauslinkki.';
  END IF;

  SELECT
    c.id,
    c.name,
    c.tools_booking_enabled,
    c.delivery_enabled,
    c.pickup_enabled,
    c.delivery_min_fee_eur,
    c.delivery_distance_limit_km,
    c.delivery_per_km_eur
  INTO v_company
  FROM companies c
  WHERE c.tools_booking_token = trim(p_token);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Varauslinkkiä ei löydy.';
  END IF;

  IF COALESCE(v_company.tools_booking_enabled, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'Julkinen varauskalenteri ei ole käytössä.';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name), '[]'::jsonb)
  INTO v_tools
  FROM (
    SELECT
      tl.id,
      tl.name,
      tl.category,
      tl.status,
      tl.rate_day_eur,
      tl.rate_weekend_eur,
      tl.rate_week_eur,
      tl.rate_month_eur,
      (
        SELECT ti.image_path
        FROM tool_images ti
        WHERE ti.tool_id = tl.id
        ORDER BY ti.sort_order, ti.created_at
        LIMIT 1
      ) AS image_path
    FROM tools tl
    WHERE tl.company_id = v_company.id
      AND COALESCE(tl.is_loanable, true) = true
      AND tl.status IS DISTINCT FROM 'retired'
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(b)::jsonb), '[]'::jsonb)
  INTO v_busy
  FROM (
    SELECT
      l.tool_id,
      l.loaned_at AS starts_at,
      COALESCE(l.returned_at, l.expected_return_at) AS ends_at,
      CASE WHEN COALESCE(l.is_blockout, false) THEN 'blockout'::text ELSE 'loan'::text END AS source,
      CASE WHEN l.returned_at IS NULL THEN 'active' ELSE 'returned' END AS status
    FROM tool_loans l
    JOIN tools tl ON tl.id = l.tool_id
    WHERE tl.company_id = v_company.id
      AND COALESCE(tl.is_loanable, true) = true
      AND l.returned_at IS NULL

    UNION ALL

    SELECT
      bk.tool_id,
      bk.starts_at,
      bk.ends_at,
      'booking'::text AS source,
      bk.status
    FROM tool_bookings bk
    WHERE bk.company_id = v_company.id
      AND bk.status IN ('pending', 'confirmed')
  ) b;

  RETURN jsonb_build_object(
    'company', jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'delivery_enabled', COALESCE(v_company.delivery_enabled, false),
      'pickup_enabled', COALESCE(v_company.pickup_enabled, true),
      'delivery_min_fee_eur', v_company.delivery_min_fee_eur,
      'delivery_distance_limit_km', v_company.delivery_distance_limit_km,
      'delivery_per_km_eur', v_company.delivery_per_km_eur
    ),
    'tools', v_tools,
    'busy', v_busy
  );
END;
$$;
