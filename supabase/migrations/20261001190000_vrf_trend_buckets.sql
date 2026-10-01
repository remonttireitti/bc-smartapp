-- VRF-trendin palvelinpuolen koostus.
-- Pitkillä aikaväleillä (7 pv, 30 pv, 90 pv) selain haki aiemmin jokaisen mittauksen
-- koko telemetria-JSONin (~1 rivi / min → 10 000–130 000 riviä, 1000 rivin sivuina peräkkäin).
-- Tämä funktio palauttaa aikaikkunoittain (esim. 15 min / 1 h / 3 h) keskiarvo/min/max ja
-- tilaviivojen osuudet → ~700 riviä yhdellä kutsulla.
--
-- SECURITY INVOKER: vrf_readings-taulun RLS on voimassa (yritys / lukuoikeus kuten ennenkin).
-- Sulatusarvio ja tilatieto lasketaan samalla säännöllä kuin selaimessa (src/lib/vrfMonitoring.ts:
-- VrfDefrostTracker, vrfActivityStateFromSignals). Yli 15 min mittaustauko nollaa kontekstin.
-- Sovellus toimii myös ilman tätä migraatiota (kokoaa selaimessa), mutta hitaammin.

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

CREATE OR REPLACE FUNCTION public.vrf_trend_buckets(
  p_device_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_bucket_seconds INTEGER
)
RETURNS TABLE (
  bucket_start TIMESTAMPTZ,
  samples INTEGER,
  outdoor_avg DOUBLE PRECISION,
  outdoor_min DOUBLE PRECISION,
  outdoor_max DOUBLE PRECISION,
  coil_avg DOUBLE PRECISION,
  coil_min DOUBLE PRECISION,
  coil_max DOUBLE PRECISION,
  supply_avg DOUBLE PRECISION,
  supply_min DOUBLE PRECISION,
  supply_max DOUBLE PRECISION,
  return_avg DOUBLE PRECISION,
  return_min DOUBLE PRECISION,
  return_max DOUBLE PRECISION,
  hot_gas_avg DOUBLE PRECISION,
  hot_gas_min DOUBLE PRECISION,
  hot_gas_max DOUBLE PRECISION,
  delta_avg DOUBLE PRECISION,
  delta_min DOUBLE PRECISION,
  delta_max DOUBLE PRECISION,
  permit_on INTEGER,
  compressor_on INTEGER,
  defrost_on INTEGER,
  alarm_on INTEGER,
  unit_ready_on INTEGER,
  st_heating INTEGER,
  st_standby INTEGER,
  st_defrost INTEGER,
  st_off INTEGER,
  st_shutdown_wait INTEGER,
  st_alarm INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_bucket INTEGER := greatest(60, least(coalesce(p_bucket_seconds, 3600), 86400));
BEGIN
  IF p_device_id IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Virheellinen aikaväli';
  END IF;
  IF p_end - p_start > INTERVAL '400 days' THEN
    RAISE EXCEPTION 'Aikaväli liian pitkä';
  END IF;
  IF extract(epoch FROM (p_end - p_start)) / v_bucket > 5000 THEN
    RAISE EXCEPTION 'Liian monta aikaikkunaa — kasvata ikkunan pituutta';
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
      AND r.recorded_at >= p_start
      AND r.recorded_at <= p_end
  ),
  gapped AS (
    SELECT raw.*, lag(raw.ts) OVER (ORDER BY raw.ts) AS prev_ts
    FROM raw
  ),
  seg AS (
    SELECT
      gapped.*,
      sum(CASE WHEN gapped.prev_ts IS NULL OR gapped.ts - gapped.prev_ts > INTERVAL '15 minutes' THEN 1 ELSE 0 END)
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
      flagged.*,
      CASE
        WHEN flagged.shutdown THEN 'shutdown_wait'
        WHEN flagged.ext_alarm OR flagged.other_alarm THEN 'alarm'
        WHEN flagged.defrost THEN 'defrost'
        WHEN NOT flagged.permit THEN 'off'
        WHEN flagged.compressor THEN 'heating'
        ELSE 'standby'
      END AS state,
      to_timestamp(floor(extract(epoch FROM flagged.ts) / v_bucket) * v_bucket) AS b
    FROM flagged
  )
  SELECT
    s.b AS bucket_start,
    count(*)::INTEGER AS samples,
    avg(s.t_out), min(s.t_out), max(s.t_out),
    avg(s.t_coil), min(s.t_coil), max(s.t_coil),
    avg(s.t_supply), min(s.t_supply), max(s.t_supply),
    avg(s.t_ret), min(s.t_ret), max(s.t_ret),
    avg(s.t_hot), min(s.t_hot), max(s.t_hot),
    avg(s.t_supply - s.t_ret), min(s.t_supply - s.t_ret), max(s.t_supply - s.t_ret),
    (count(*) FILTER (WHERE s.permit))::INTEGER,
    (count(*) FILTER (WHERE s.compressor))::INTEGER,
    (count(*) FILTER (WHERE s.defrost))::INTEGER,
    (count(*) FILTER (WHERE s.ext_alarm))::INTEGER,
    (count(*) FILTER (WHERE s.unit_ready))::INTEGER,
    (count(*) FILTER (WHERE s.state = 'heating'))::INTEGER,
    (count(*) FILTER (WHERE s.state = 'standby'))::INTEGER,
    (count(*) FILTER (WHERE s.state = 'defrost'))::INTEGER,
    (count(*) FILTER (WHERE s.state = 'off'))::INTEGER,
    (count(*) FILTER (WHERE s.state = 'shutdown_wait'))::INTEGER,
    (count(*) FILTER (WHERE s.state = 'alarm'))::INTEGER
  FROM stated s
  GROUP BY s.b
  ORDER BY s.b;
END;
$$;

COMMENT ON FUNCTION public.vrf_trend_buckets(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) IS
  'VRF-trendi aikaikkunoittain (ka/min/max + tilaviivojen osuudet). RLS voimassa (SECURITY INVOKER).';

REVOKE ALL ON FUNCTION public.vrf_trend_buckets(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vrf_trend_buckets(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.vrf_trend_buckets(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vrf_trend_buckets(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.vrf_jsonb_num(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vrf_jsonb_bool(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
