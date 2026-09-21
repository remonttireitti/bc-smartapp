-- Työkaluvuokraus: yrityksen kuljetusasetukset, varaus-token, tool_bookings + julkiset RPC:t.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS tools_booking_token TEXT,
  ADD COLUMN IF NOT EXISTS tools_booking_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_min_fee_eur NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS delivery_distance_limit_km NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS delivery_per_km_eur NUMERIC(12, 2);

CREATE UNIQUE INDEX IF NOT EXISTS companies_tools_booking_token_uidx
  ON companies (tools_booking_token)
  WHERE tools_booking_token IS NOT NULL;

COMMENT ON COLUMN companies.tools_booking_token IS 'Julkinen varauskalenterilinkki /tyokalut/varaus/:token';
COMMENT ON COLUMN companies.tools_booking_enabled IS 'Onko julkinen työkaluvaraus käytössä.';
COMMENT ON COLUMN companies.delivery_enabled IS 'Tarjotaanko kuljetus työkaluvarauksille.';
COMMENT ON COLUMN companies.pickup_enabled IS 'Tarjotaanko nouto työkaluvarauksille.';
COMMENT ON COLUMN companies.delivery_min_fee_eur IS 'Kuljetuksen minimihinta (lyhyt matka / raja-km asti).';
COMMENT ON COLUMN companies.delivery_distance_limit_km IS 'Raja-km: tähän asti minimihinta, yli → + €/km.';
COMMENT ON COLUMN companies.delivery_per_km_eur IS 'Yli raja-km:n osuuden €/km.';

CREATE TABLE IF NOT EXISTS tool_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (delivery_mode IN ('none', 'delivery', 'pickup')),
  delivery_distance_km NUMERIC(12, 2),
  delivery_fee_eur NUMERIC(12, 2),
  delivery_address TEXT,
  notes TEXT,
  confirmed_loan_id UUID REFERENCES tool_loans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_tool_bookings_company ON tool_bookings(company_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_tool_bookings_tool_range ON tool_bookings(tool_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_tool_bookings_status ON tool_bookings(company_id, status);

COMMENT ON TABLE tool_bookings IS 'Julkiset / ulkoiset työkaluvaraukset (pending→confirmed→cancelled). Kalenterin lähde yhdessä tool_loans kanssa.';

DROP TRIGGER IF EXISTS tool_bookings_updated_at ON tool_bookings;
CREATE TRIGGER tool_bookings_updated_at
  BEFORE UPDATE ON tool_bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tool_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tool_bookings_select ON tool_bookings;
CREATE POLICY tool_bookings_select ON tool_bookings FOR SELECT
  USING (
    company_id = public.current_company_id()
    OR public.can_read_module(company_id, 'tools')
  );

DROP POLICY IF EXISTS tool_bookings_write ON tool_bookings;
CREATE POLICY tool_bookings_write ON tool_bookings FOR ALL
  USING (
    company_id = public.current_company_id()
    AND public.can_write_module(company_id, 'tools')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.can_write_module(company_id, 'tools')
  );

-- Tokenin generointi / varmistus (kirjautunut, tools-kirjoitus).
CREATE OR REPLACE FUNCTION public.ensure_company_tools_booking_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := public.current_company_id();
  v_token TEXT;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Profiilista puuttuu yritys.';
  END IF;
  IF NOT public.can_write_module(v_company_id, 'tools') THEN
    RAISE EXCEPTION 'Ei oikeutta työkaluvarauksen linkkiin.';
  END IF;

  SELECT tools_booking_token INTO v_token
  FROM companies
  WHERE id = v_company_id;

  IF v_token IS NULL OR length(trim(v_token)) = 0 THEN
    v_token := lower(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24));
    UPDATE companies
    SET tools_booking_token = v_token,
        tools_booking_enabled = COALESCE(tools_booking_enabled, true)
    WHERE id = v_company_id;
  END IF;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_company_tools_booking_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_company_tools_booking_token() TO authenticated;

-- Julkinen lukupaketti tokenilla (anon + authenticated).
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
      'loan'::text AS source,
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

REVOKE ALL ON FUNCTION public.get_tools_booking_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tools_booking_public(TEXT) TO anon, authenticated;

-- Julkinen varauksen luonti tokenilla.
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
  v_id UUID;
  v_overlap BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'Virheellinen varauslinkki.';
  END IF;
  IF p_guest_name IS NULL OR length(trim(p_guest_name)) < 2 THEN
    RAISE EXCEPTION 'Nimi on pakollinen.';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at < p_starts_at THEN
    RAISE EXCEPTION 'Virheellinen varausaika.';
  END IF;
  IF v_mode NOT IN ('none', 'delivery', 'pickup') THEN
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

  IF v_mode = 'delivery' AND COALESCE(v_company.delivery_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Kuljetus ei ole käytössä.';
  END IF;
  IF v_mode = 'pickup' AND COALESCE(v_company.pickup_enabled, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'Nouto ei ole käytössä.';
  END IF;

  IF v_mode = 'delivery' THEN
    v_dist := COALESCE(p_delivery_distance_km, 0);
    IF v_dist < 0 THEN
      RAISE EXCEPTION 'Etäisyys ei voi olla negatiivinen.';
    END IF;
    v_min := COALESCE(v_company.delivery_min_fee_eur, 0);
    v_limit := COALESCE(v_company.delivery_distance_limit_km, 0);
    v_per := COALESCE(v_company.delivery_per_km_eur, 0);
    IF v_dist <= v_limit THEN
      v_fee := v_min;
    ELSE
      v_fee := v_min + (v_dist - v_limit) * v_per;
    END IF;
  END IF;

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
      AND bk.status IN ('pending', 'confirmed')
      AND bk.starts_at <= p_ends_at
      AND bk.ends_at >= p_starts_at
  )
  INTO v_overlap;

  IF v_overlap THEN
    RAISE EXCEPTION 'Valittu aika limittäin olemassa olevan lainan tai varauksen kanssa.';
  END IF;

  INSERT INTO tool_bookings (
    company_id, tool_id, status, starts_at, ends_at,
    guest_name, guest_phone, guest_email,
    delivery_mode, delivery_distance_km, delivery_fee_eur, delivery_address, notes
  ) VALUES (
    v_company.id, p_tool_id, 'pending', p_starts_at, p_ends_at,
    trim(p_guest_name), NULLIF(trim(COALESCE(p_guest_phone, '')), ''), NULLIF(trim(COALESCE(p_guest_email, '')), ''),
    v_mode, CASE WHEN v_mode = 'delivery' THEN v_dist ELSE NULL END, v_fee,
    NULLIF(trim(COALESCE(p_delivery_address, '')), ''), NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tool_booking_public(
  TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tool_booking_public(
  TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) TO anon, authenticated;
