import assert from 'node:assert/strict';
import { airCapacity, enthalpy, humidityRatio, specificVolume, staticEvaporatorEstimate } from '../src/lib/huoltoRaportti/airCapacity';
const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
// Käsinlaskettu esimerkki: höyrystin 0 °C / 90 % → −5 °C / 95 %, 3600 m³/h.
near(humidityRatio(0, 90), 0.0033938, 2e-6, 'w1');
near(enthalpy(0, 0.0033938), 8.488, 0.002, 'h1');
near(humidityRatio(-5, 95), 0.0023516, 2e-6, 'w2');
near(enthalpy(-5, 0.0023516), 0.8295, 0.002, 'h2');
near(specificVolume(0, 0.0033938), 0.77802, 1e-4, 'v1');
const e = airCapacity({ tIn: '0', rhIn: '90', tOut: '-5', rhOut: '95', airflowM3h: '3600', direction: 'cooling' })!;
near(e.massFlowKgS, 1.2853, 1e-3, 'm');
near(e.totalKw, 9.84, 0.01, 'Q');
near(e.latentKw, 3.35, 0.01, 'latentti');
near(e.sensibleKw, 6.49, 0.01, 'tuntuva');
// Lauhdutin 25 °C / 40 % → 35 °C / 25 %, 5000 m³/h.
const c = airCapacity({ tIn: 25, rhIn: 40, tOut: 35, rhOut: 25, airflowM3h: 5000, direction: 'heating' })!;
near(c.totalKw, 20.24, 0.02, 'lauhdutin Q'); assert.equal(c.latentKw, 0);
// Ilman kosteutta: tuntuva teho.
const s = airCapacity({ tIn: '25', rhIn: '', tOut: '35', rhOut: '', airflowM3h: '5000', direction: 'heating', allowSensibleOnly: true })!;
assert.ok(s.sensibleOnly); near(s.totalKw, 16.54, 0.02, 'tuntuva lauhdutin');
// Höyrystin ilman kosteuksia → ei tulosta. Puuttuva ilmavirta → ei tulosta.
assert.equal(airCapacity({ tIn: 0, rhIn: '', tOut: -5, rhOut: '', airflowM3h: 3600, direction: 'cooling' }), null);
assert.equal(airCapacity({ tIn: 0, rhIn: 90, tOut: -5, rhOut: 95, airflowM3h: '', direction: 'cooling' }), null);
// Staattinen: 1000×300×100 mm, ripaväli 10 mm, rivit oletus 4, putkia/rivi 12, kylmiö −18, kenno −24.
// Rivat 100 × 2 × 0,3 × 0,1 = 6,0 m²; putket 48 × π × 0,012 × 1,0 = 1,8096 m²; A = 7,8096 m²; Q = 7 × 7,8096 × 6 = 328,0 W.
const st = staticEvaporatorEstimate({ roomT: '-18', coilT: '-24', lengthMm: '1000', heightMm: '300', depthMm: '100' })!;
near(st.areaM2, 7.8096, 1e-3, 'A'); assert.equal(st.dtK, 6); near(st.kw, 0.328, 1e-3, 'Q staattinen');
const st2 = staticEvaporatorEstimate({ roomT: -18, coilT: -24, lengthMm: 1000, heightMm: 300, depthMm: 100, finPitchMm: 5, tubeRows: 2 })!;
near(st2.areaM2, 12 + 24 * Math.PI * 0.012, 1e-6, 'A ripaväli 5, 2 riviä');
assert.equal(staticEvaporatorEstimate({ roomT: -18, coilT: -24, lengthMm: '', heightMm: 300, depthMm: 100 }), null);
console.log('air-capacity ok');

{
  const { staticCapacityStatus } = await import('../src/lib/huoltoRaportti/airCapacity');
  const enn = { kennoPituusMm: '1100', kennoKorkeusMm: '150', kennoSyvyysMm: '700', hoyrystymisLampotila: '6' };
  const a = staticCapacityStatus(enn);
  if (a.result || a.missing !== 'syötä huoneen lämpötila') throw new Error('missing room: ' + a.missing);
  const b = staticCapacityStatus({ ...enn, kylmioLampotila: '12' });
  if (!b.result || !b.coilFromEvaporation || Math.abs(b.result.dtK - 6) > 1e-9) throw new Error('fallback');
  const c = staticCapacityStatus({ ...enn, kylmioLampotila: '12', kennoLampotila: '8' });
  if (!c.result || c.coilFromEvaporation || Math.abs(c.result.dtK - 4) > 1e-9) throw new Error('kenno wins');
  const d = staticCapacityStatus({});
  if (d.missing !== 'syötä huoneen lämpötila, kennon lämpötila ja kennon mitat') throw new Error('all missing: ' + d.missing);
  const e = staticCapacityStatus({ ...enn, kylmioLampotila: '2' });
  if (e.missing !== 'huoneen pitää olla kennoa lämpimämpi') throw new Error('dt<=0');
  console.log('static status ok', b.result.kw.toFixed(2), 'kW');
}

{
  const { evaporatorRoomTemp, staticCapacityStatus } = await import('../src/lib/huoltoRaportti/airCapacity');
  if (evaporatorRoomTemp({ tyyppi: 'staatinen', lampotilaMitattu: '-19' }) !== '-19') throw new Error('legacy mitattu');
  if (evaporatorRoomTemp({ tyyppi: 'puhallin', ilmaTuloLampotila: '-18', lampotilaMitattu: '-19' }) !== '-18') throw new Error('ilma ennen');
  if (!staticCapacityStatus({ lampotilaMitattu: '12', hoyrystymisLampotila: '6', kennoPituusMm: '1100', kennoKorkeusMm: '150', kennoSyvyysMm: '700' }).result) throw new Error('legacy room in teho');
  console.log('room temp ok');
}
