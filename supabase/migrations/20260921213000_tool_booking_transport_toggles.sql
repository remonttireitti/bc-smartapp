-- Public booking: two transport toggles map to delivery_mode (none|delivery|pickup|both).
-- Require guest phone + email. No enum change (already none|delivery|pickup|both).
-- Booking remains billable once confirmed even before tool collection / delivery.

COMMENT ON COLUMN tool_bookings.delivery_mode IS
  'none=ei kuljetusta; delivery=Tilaan kuljetuksen vuokraajalta; pickup=Tilaan kuljetuksen palautukseen; both=molemmat osuudet';

CREATE OR REPLACE FUNCTION public.create_tool_booking_public(
  p_token TEXT,
  p_tool_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_guest_name TEXT,
  p_guest_phone TEXT DEFAULT NULL,
  p_guest_email TEXT DEFAULT NULL,
  p_delivery_mode TEXT DEFAULT 'none',
  p_delivery_distance_km NUMERIC DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_tool RECORD;
  v_mode TEXT := COALESCE(NULLIF(trim(p_delivery_mode), ''), 'none');
  v_fee NUMERIC(12, 2) := NULL;
  v_limit NUMERIC;
  v_min NUMERIC;
  v_per NUMERIC;
  v_dist NUMERIC;
  v_leg_fee NUMERIC(12, 2);
  v_legs INTEGER := 0;
  v_id UUID;
  v_overlap BOOLEAN;
  v_needs_company BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Virheellinen varauslinkki.';
  END IF;
  IF p_guest_name IS NULL OR length(trim(p_guest_name)) < 2 THEN
    RAISE EXCEPTION 'Nimi on pakollinen.';
  END IF;
  IF p_guest_phone IS NULL OR length(trim(p_guest_phone)) < 5 THEN
    RAISE EXCEPTION 'Puhelinnumero on pakollinen.';
  END IF;
  IF p_guest_email IS NULL OR position('@' in trim(p_guest_email)) = 0 THEN
    RAISE EXCEPTION 'Sähköposti on pakollinen.';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at < p_starts_at THEN
    RAISE EXCEPTION 'Virheellinen varausaika.';
  END IF;
  IF v_mode NOT IN ('none', 'delivery', 'pickup', 'both') THEN
    RAISE EXCEPTION 'Virheellinen kuljetustapa.';
  END IF;

  SELECT
    c.id,
    c.tools_booking_enabled,
    c.delivery_enabled,
    c.pickup_enabled,
    c.delivery_min_fee_eur,
    c.delivery_distance_limit_km,
    c.delivery_per_km_eur
  INTO v_company
  FROM companies c
  WHERE c.tools_booking_token = trim(p_token);

  IF NOT FOUND OR COALESCE(v_company.tools_booking_enabled, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'Julkinen varauskalenteri ei ole käytössä.';
  END IF;

  SELECT tl.id, tl.company_id, tl.is_loanable, tl.status
  INTO v_tool
  FROM tools tl
  WHERE tl.id = p_tool_id
    AND tl.company_id = v_company.id;

  IF NOT FOUND OR COALESCE(v_tool.is_loanable, true) IS NOT TRUE OR v_tool.status = 'retired' THEN
    RAISE EXCEPTION 'Työkalu ei ole varattavissa.';
  END IF;

  IF v_mode IN ('delivery', 'both') AND COALESCE(v_company.delivery_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Vienti ei ole käytössä.';
  END IF;
  IF v_mode IN ('pickup', 'both') AND COALESCE(v_company.pickup_enabled, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'Palautusnouto ei ole käytössä.';
  END IF;

  v_needs_company := v_mode IN ('delivery', 'pickup', 'both');
  IF v_mode IN ('delivery', 'both') THEN
    v_legs := v_legs + 1;
  END IF;
  IF v_mode IN ('pickup', 'both') THEN
    v_legs := v_legs + 1;
  END IF;

  IF v_needs_company THEN
    v_dist := COALESCE(p_delivery_distance_km, 0);
    IF v_dist < 0 THEN
      RAISE EXCEPTION 'Etäisyys ei voi olla negatiivinen.';
    END IF;
    v_min := COALESCE(v_company.delivery_min_fee_eur, 0);
    v_limit := COALESCE(v_company.delivery_distance_limit_km, 0);
    v_per := COALESCE(v_company.delivery_per_km_eur, 0);
    IF v_dist <= v_limit THEN
      v_leg_fee := v_min;
    ELSE
      v_leg_fee := v_min + (v_dist - v_limit) * v_per;
    END IF;
    v_fee := v_leg_fee * v_legs;
  END IF;

  -- Hard conflict only: open loans + confirmed bookings.
  -- Pending stays a queue (multiple requests allowed for the same window).
  SELECT EXISTS (
    SELECT 1
    FROM tool_loans l
    WHERE l.tool_id = p_tool_id
      AND l.returned_at IS NULL
      AND l.loaned_at <= p_ends_at
      AND COALESCE(l.returned_at, l.expected_return_at, 'infinity'::timestamptz) >= p_starts_at
  ) OR EXISTS (
    SELECT 1
    FROM tool_bookings bk
    WHERE bk.tool_id = p_tool_id
      AND bk.status = 'confirmed'
      AND bk.starts_at <= p_ends_at
      AND bk.ends_at >= p_starts_at
  )
  INTO v_overlap;

  IF v_overlap THEN
    RAISE EXCEPTION 'Valittu aika limittäin olemassa olevan lainan tai vahvistetun varauksen kanssa.';
  END IF;

  INSERT INTO tool_bookings (
    company_id, tool_id, status, starts_at, ends_at,
    guest_name, guest_phone, guest_email,
    delivery_mode, delivery_distance_km, delivery_fee_eur, delivery_address, notes
  ) VALUES (
    v_company.id, p_tool_id, 'pending', p_starts_at, p_ends_at,
    trim(p_guest_name), NULLIF(trim(COALESCE(p_guest_phone, '')), ''), NULLIF(trim(COALESCE(p_guest_email, '')), ''),
    v_mode, CASE WHEN v_needs_company THEN v_dist ELSE NULL END, v_fee,
    CASE WHEN v_needs_company THEN NULLIF(trim(COALESCE(p_delivery_address, '')), '') ELSE NULL END,
    NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_tool_booking_public(
  TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) IS 'Julkinen varauspyyntö (pending = jonossa). Pakolliset: nimi, puhelin, sähköposti. Kuljetus: none|delivery|pickup|both (kaksi kytkintä); maksu = osuusmaksu × osuuksien määrä.';

REVOKE ALL ON FUNCTION public.create_tool_booking_public(
  TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tool_booking_public(
  TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) TO anon, authenticated;
