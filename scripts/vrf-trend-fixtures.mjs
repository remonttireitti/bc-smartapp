/** Synteettiset VRF-mittaukset testeihin (deterministinen satunnaisuus). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ~1 mittaus / min, mukana: käyntiluvan vaihtelu, kompressori, sulatuskuviot (kenno nousee,
 * meno laskee), firmware-sulatus, DI3 raw/trigger, tauot, puuttuvia antureita, merkkijonolukuja.
 */
export function makeVrfReadings({ startMs, count, seed = 1, stepMs = 60_000 }) {
  const rnd = mulberry32(seed);
  const out = [];
  let t = startMs;
  let permit = true;
  let compressor = true;
  let coil = -8;
  let supply = 35;
  let ret = 28;
  let outdoor = -3;
  let defrostPhase = 0;
  for (let i = 0; i < count; i += 1) {
    if (rnd() < 0.01) t += 20 * 60_000 + Math.floor(rnd() * 3600_000); // tauko
    t += stepMs + Math.floor((rnd() - 0.5) * 4000);
    if (rnd() < 0.02) permit = !permit;
    if (rnd() < 0.05) compressor = !compressor;
    if (defrostPhase === 0 && rnd() < 0.04) defrostPhase = 4;
    if (defrostPhase > 0) {
      coil += 1.2 + rnd();
      supply -= 0.8 + rnd();
      defrostPhase -= 1;
    } else {
      coil += (rnd() - 0.55) * 0.6;
      supply += (rnd() - 0.45) * 0.8;
      if (coil > outdoor + 1) coil -= 2.5;
    }
    ret += (rnd() - 0.5) * 0.5;
    outdoor += (rnd() - 0.5) * 0.2;
    const temps = {
      outdoor_c: Math.round(outdoor * 100) / 100,
      outdoor_coil_c: rnd() < 0.02 ? null : Math.round(coil * 100) / 100,
      refrigerant_supply_c: rnd() < 0.02 ? 'nan' : Math.round(supply * 100) / 100,
      refrigerant_return_c: rnd() < 0.05 ? String(Math.round(ret * 10) / 10) : Math.round(ret * 100) / 100,
      hot_gas_c: Math.round((60 + rnd() * 20) * 10) / 10,
    };
    const di3TriggerVariant = rnd();
    const payload = {
      temperatures: temps,
      control: rnd() < 0.05 ? {} : { enabled: permit },
      status: {
        alarm_shutdown_active: rnd() < 0.01,
        compressor_likely_running: rnd() < 0.5,
      },
      digital_inputs:
        rnd() < 0.1
          ? { di_bus_energized: rnd() < 0.5 ? 0 : 1 }
          : {
              di2_compressor_running: compressor,
              di3_raw: rnd() < 0.97 ? 1 : 0,
              di4_unit_ready: rnd() < 0.7,
              di_bus_energized: true,
            },
      alarms: { hot_gas_high: rnd() < 0.005, sensor_disconnected: false },
      defrost: { active: rnd() < 0.01 },
      diagnostics: { di_bus_energized: true, rssi: -60 },
      settings:
        di3TriggerVariant < 0.1
          ? { di3_trigger_raw_level: 1, di3_alarm_shutdown_enabled: false }
          : di3TriggerVariant < 0.2
            ? { alarm_input_trigger_raw_level: '1' }
            : { di3_trigger_raw_level: 0 },
      network: { ssid: 'x'.repeat(20) },
    };
    out.push({
      id: i + 1,
      device_id: '00000000-0000-0000-0000-000000000001',
      recorded_at: new Date(t).toISOString(),
      payload,
      outdoor_c: temps.outdoor_c,
      heat_enabled: permit,
      operating_state: null,
      any_alarm: false,
    });
  }
  return out;
}
