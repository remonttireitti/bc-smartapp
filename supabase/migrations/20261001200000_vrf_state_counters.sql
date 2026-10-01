-- VRF-trendin tilalaskurit valitulle aikavälille (Trendi-ikkuna → Laskurit).
-- Kompressorin käynnistykset, käyntiluvan / sulatusten / hälytysten kerrat, kokonaisaika
-- ja tilatiedon (lämmittää, valmiustila, sulatus, sammutettu, hälytysviive, hälytys) siirtymät.
--
-- Lasketaan raakamittauksista (ei aikaikkunoiden keskiarvoista), joten luvut ovat tarkkoja myös
-- 7 / 30 / 90 pv väleillä. Tilat johdetaan samalla säännöllä kuin vrf_trend_buckets ja selain
-- (src/lib/vrfMonitoring.ts, src/lib/vrfStateCounters.ts):
--   * kerta = pois → päälle -siirtymä, jonka jälkimmäinen mittaus on välillä [p_start, p_end];
--     edellinen mittaus voi olla ennen välin alkua (30 min katsotaan taaksepäin), joten jo valmiiksi
--     käynnissä oleva kompressori ei ole uusi käynnistys
--   * yli 15 min mittaustauko nollaa kontekstin: tauon jälkeen päällä oleva ei ole uusi kerta,
--     eikä taukoa lasketa päälläoloaikaan
--   * aika = mittaukselta seuraavalle (≤ 15 min), rajattuna väliin [p_start, p_end]
--
-- Itsenäinen ja ajettavissa uudelleen (CREATE OR REPLACE). SECURITY INVOKER → vrf_readings-taulun
-- RLS on voimassa. Sovellus toimii ilman tätä (≤ 36 h välit lasketaan selaimessa).

CREATE OR REPLACE FUNCTION public.vrf_jsonb_num(v JSONB)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE jsonb_typeof(v)
    WHEN 'number' THEN (v #>> '{}')::DOUBLE PRECISION
    WHEN 'string' THEN
      CASE
        WHEN btrim(v #>> '{}') ~ '^[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$'
          THEN btrim(v #>> '{}')::DOUBLE PRECISION
      END
  END
$$;

CREATE OR REPLACE FUNCTION public.vrf_jsonb_bool(v JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE jsonb_typeof(v)
    WHEN 'boolean' THEN (v #>> '{}')::BOOLEAN
    WHEN 'number' THEN
      CASE (v #>> '{}')::NUMERIC WHEN 1 THEN TRUE WHEN 0 THEN FALSE END
    WHEN 'string' THEN
      CASE v #>> '{}' WHEN '1' THEN TRUE WHEN '0' THEN FALSE END
  END
$$;

CREATE OR REPLACE FUNCTION public.vrf_state_counters(
  p_device_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS TABLE (
  signal TEXT,
  transitions INTEGER,
  episodes INTEGER,
  on_ms DOUBLE PRECISION,
  covered_ms DOUBLE PRECISION,
  samples INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_gap CONSTANT INTERVAL := INTERVAL '15 minutes';
  v_lookback CONSTANT INTERVAL := INTERVAL '30 minutes';
BEGIN
  IF p_device_id IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Virheellinen aikaväli';
  END IF;
  IF p_end - p_start > INTERVAL '400 days' THEN
    RAISE EXCEPTION 'Aikaväli liian pitkä';
  END IF;

  RETURN QUERY
  WITH raw AS (
    SELECT
      r.recorded_at AS ts,
      public.vrf_jsonb_num(r.payload -> 'temperatures' -> 'outdoor_c') AS t_out,
      public.vrf_jsonb_num(r.payload -> 'temperatures' -> 'outdoor_coil_c') AS t_coil,
      public.vrf_jsonb_num(r.payload -> 'temperatures' -> 'refrigerant_supply_c') AS t_supply,
      public.vrf_jsonb_num(r.payload -> 'temperatures' -> 'refrigerant_return_c') AS t_ret,
      public.vrf_jsonb_num(r.payload -> 'temperatures' -> 'hot_gas_c') AS t_hot,
      coalesce(public.vrf_jsonb_bool(r.payload -> 'control' -> 'enabled'), r.heat_enabled IS TRUE) AS permit,
      CASE
        WHEN public.vrf_jsonb_bool(r.payload -> 'digital_inputs' -> 'di2_compressor_running') IS NOT NULL
          THEN public.vrf_jsonb_bool(r.payload -> 'digital_inputs' -> 'di2_compressor_running')
        WHEN coalesce(
          public.vrf_jsonb_bool(r.payload -> 'digital_inputs' -> 'di_bus_energized'),
          public.vrf_jsonb_bool(r.payload -> 'diagnostics' -> 'di_bus_energized')
        ) IS FALSE THEN FALSE
        ELSE coalesce(public.vrf_jsonb_bool(r.payload -> 'status' -> 'compressor_likely_running'), FALSE)
      END AS compressor,
      CASE
        WHEN public.vrf_jsonb_num(r.payload -> 'digital_inputs' -> 'di3_raw') IS NOT NULL
          THEN public.vrf_jsonb_num(r.payload -> 'digital_inputs' -> 'di3_raw') = (
            CASE WHEN coalesce(
              public.vrf_jsonb_num(r.payload -> 'settings' -> 'di3_trigger_raw_level'),
              public.vrf_jsonb_num(r.payload -> 'settings' -> 'alarm_input_trigger_raw_level'),
              0
            ) = 1 THEN 1 ELSE 0 END
          )
        WHEN public.vrf_jsonb_bool(r.payload -> 'digital_inputs' -> 'di3_alarm') IS NOT NULL
          THEN public.vrf_jsonb_bool(r.payload -> 'digital_inputs' -> 'di3_alarm')
        ELSE public.vrf_jsonb_bool(r.payload -> 'alarms' -> 'external_alarm_input') IS TRUE
      END AS ext_alarm,
      (
        public.vrf_jsonb_bool(r.payload -> 'alarms' -> 'external_alarm_input') IS TRUE
        OR public.vrf_jsonb_bool(r.payload -> 'alarms' -> 'sensor_disconnected') IS TRUE
        OR public.vrf_jsonb_bool(r.payload -> 'alarms' -> 'hot_gas_high') IS TRUE
        OR public.vrf_jsonb_bool(r.payload -> 'alarms' -> 'refrigerant_return_low') IS TRUE
        OR public.vrf_jsonb_bool(r.payload -> 'alarms' -> 'refrigerant_delta_high') IS TRUE
        OR public.vrf_jsonb_bool(r.payload -> 'alarms' -> 'refrigerant_delta_low') IS TRUE
      ) AS other_alarm,
      coalesce(
        public.vrf_jsonb_bool(r.payload -> 'digital_inputs' -> 'di4_unit_ready'),
        public.vrf_jsonb_bool(r.payload -> 'digital_inputs' -> 'di1_unit_ready')
      ) IS TRUE AS unit_ready,
      public.vrf_jsonb_bool(r.payload -> 'defrost' -> 'active') IS TRUE AS fw_defrost,
      (
        coalesce(public.vrf_jsonb_bool(r.payload -> 'settings' -> 'di3_alarm_shutdown_enabled'), TRUE)
        AND coalesce(public.vrf_jsonb_bool(r.payload -> 'status' -> 'alarm_shutdown_active'), FALSE)
      ) AS shutdown
    FROM public.vrf_readings r
    WHERE r.device_id = p_device_id
      AND r.recorded_at >= p_start - v_lookback
      AND r.recorded_at <= p_end + v_gap
  ),
  gapped AS (
    SELECT raw.*, lag(raw.ts) OVER (ORDER BY raw.ts) AS prev_ts
    FROM raw
  ),
  seg AS (
    SELECT
      gapped.*,
      sum(CASE WHEN gapped.prev_ts IS NULL OR gapped.ts - gapped.prev_ts > v_gap THEN 1 ELSE 0 END)
        OVER (ORDER BY gapped.ts ROWS UNBOUNDED PRECEDING) AS seg_id
    FROM gapped
  ),
  ctx AS (
    SELECT
      seg.*,
      row_number() OVER w AS rn,
      lag(seg.t_coil, 2) OVER w AS coil_prev2,
      lag(seg.t_supply, 2) OVER w AS supply_prev2,
      lag(seg.t_out, 2) OVER w AS out_prev2,
      sum(CASE WHEN seg.permit THEN 0 ELSE 1 END) OVER (w ROWS UNBOUNDED PRECEDING) AS permit_grp
    FROM seg
    WINDOW w AS (PARTITION BY seg.seg_id ORDER BY seg.ts)
  ),
  runs AS (
    SELECT
      ctx.*,
      min(ctx.ts) FILTER (WHERE ctx.permit) OVER (PARTITION BY ctx.seg_id, ctx.permit_grp) AS permit_on_at
    FROM ctx
  ),
  flagged AS (
    SELECT
      runs.*,
      (
        runs.fw_defrost
        OR (
          runs.rn >= 3
          AND runs.permit
          AND runs.compressor
          AND NOT (runs.permit_on_at IS NOT NULL AND runs.ts - runs.permit_on_at < INTERVAL '5 minutes')
          AND runs.coil_prev2 IS NOT NULL
          AND runs.t_coil IS NOT NULL
          AND runs.supply_prev2 IS NOT NULL
          AND runs.t_supply IS NOT NULL
          AND NOT (runs.out_prev2 IS NOT NULL AND runs.coil_prev2 > runs.out_prev2 - 2)
          AND runs.t_coil - runs.coil_prev2 >= 0.85
          AND runs.t_supply - runs.supply_prev2 <= -0.55
        )
      ) AS defrost
    FROM runs
  ),
  stated AS (
    SELECT
      flagged.seg_id,
      flagged.ts,
      flagged.permit,
      flagged.compressor,
      flagged.defrost,
      flagged.ext_alarm,
      flagged.unit_ready,
      CASE
        WHEN flagged.shutdown THEN 'shutdown_wait'
        WHEN flagged.ext_alarm OR flagged.other_alarm THEN 'alarm'
        WHEN flagged.defrost THEN 'defrost'
        WHEN NOT flagged.permit THEN 'off'
        WHEN flagged.compressor THEN 'heating'
        ELSE 'standby'
      END AS state
    FROM flagged
  ),
  seq AS (
    SELECT
      stated.*,
      lag(stated.ts) OVER w AS p_ts,
      lead(stated.ts) OVER w AS n_ts,
      lag(stated.permit) OVER w AS p_permit,
      lag(stated.compressor) OVER w AS p_compressor,
      lag(stated.defrost) OVER w AS p_defrost,
      lag(stated.ext_alarm) OVER w AS p_ext_alarm,
      lag(stated.unit_ready) OVER w AS p_unit_ready,
      lag(stated.state) OVER w AS p_state
    FROM stated
    WINDOW w AS (PARTITION BY stated.seg_id ORDER BY stated.ts)
  ),
  timed AS (
    SELECT
      seq.*,
      (seq.ts >= p_start AND seq.ts <= p_end) AS in_range,
      CASE
        WHEN seq.n_ts IS NULL THEN 0::DOUBLE PRECISION
        ELSE greatest(
          0::DOUBLE PRECISION,
          extract(epoch FROM (least(seq.n_ts, p_end) - greatest(seq.ts, p_start)))::DOUBLE PRECISION * 1000
        )
      END AS dur_ms
    FROM seq
  ),
  totals AS (
    SELECT
      coalesce(sum(timed.dur_ms), 0)::DOUBLE PRECISION AS covered,
      (count(*) FILTER (WHERE timed.in_range))::INTEGER AS n
    FROM timed
  ),
  expanded AS (
    SELECT t.in_range, t.dur_ms, t.p_ts, s.signal, s.cur, s.prev
    FROM timed t
    CROSS JOIN LATERAL (
      VALUES
        ('control', t.permit, t.p_permit),
        ('compressor', t.compressor, t.p_compressor),
        ('defrost', t.defrost, t.p_defrost),
        ('alarm', t.ext_alarm, t.p_ext_alarm),
        ('unit_ready', t.unit_ready, t.p_unit_ready),
        ('state:heating', t.state = 'heating', t.p_state = 'heating'),
        ('state:standby', t.state = 'standby', t.p_state = 'standby'),
        ('state:defrost', t.state = 'defrost', t.p_state = 'defrost'),
        ('state:off', t.state = 'off', t.p_state = 'off'),
        ('state:shutdown_wait', t.state = 'shutdown_wait', t.p_state = 'shutdown_wait'),
        ('state:alarm', t.state = 'alarm', t.p_state = 'alarm')
    ) AS s(signal, cur, prev)
  ),
  per_signal AS (
    SELECT
      e.signal,
      (count(*) FILTER (WHERE e.in_range AND e.cur AND e.prev IS FALSE))::INTEGER AS transitions,
      (count(*) FILTER (
        WHERE e.in_range AND e.cur AND NOT (e.prev IS TRUE AND e.p_ts >= p_start)
      ))::INTEGER AS episodes,
      coalesce(sum(e.dur_ms) FILTER (WHERE e.cur), 0)::DOUBLE PRECISION AS on_ms
    FROM expanded e
    GROUP BY e.signal
  ),
  signals AS (
    SELECT v.signal
    FROM (VALUES
      ('control'), ('compressor'), ('defrost'), ('alarm'), ('unit_ready'),
      ('state:heating'), ('state:standby'), ('state:defrost'), ('state:off'),
      ('state:shutdown_wait'), ('state:alarm')
    ) AS v(signal)
  )
  SELECT
    sg.signal,
    coalesce(ps.transitions, 0),
    coalesce(ps.episodes, 0),
    coalesce(ps.on_ms, 0::DOUBLE PRECISION),
    tot.covered,
    tot.n
  FROM signals sg
  CROSS JOIN totals tot
  LEFT JOIN per_signal ps ON ps.signal = sg.signal;
END;
$$;

COMMENT ON FUNCTION public.vrf_state_counters(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'VRF-tilalaskurit aikavälille (pois→päälle-kerrat, kokonaisaika) raakamittauksista. RLS voimassa (SECURITY INVOKER).';

REVOKE ALL ON FUNCTION public.vrf_state_counters(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vrf_state_counters(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.vrf_state_counters(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vrf_state_counters(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.vrf_jsonb_num(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vrf_jsonb_bool(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
