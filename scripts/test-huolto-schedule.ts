import assert from 'node:assert/strict';
import { leakCheckInterval, buildDeviceSchedule, addMonthsYmd, refrigerantGwp } from '../src/lib/huoltoSchedule';
const r = (ref: string, kg: number, o: Record<string, unknown> = {}) => leakCheckInterval({ refrigerant: ref, chargeKg: kg, ...o });
let x = r('R-404A', 5); assert.equal(x.gwp, 3922); assert.equal(x.co2eTonnes!.toFixed(1), '19.6'); assert.equal(x.intervalMonths, 12);
x = r('R-449A', 5); assert.equal(x.gwp, 1397); assert.equal(x.co2eTonnes!.toFixed(2), '6.99'); assert.equal(x.intervalMonths, 12);
x = r('R-410A', 2.8); assert.equal(x.co2eTonnes!.toFixed(2), '5.85'); assert.equal(x.intervalMonths, 12);
x = r('R-32', 0.38); assert.equal(x.co2eTonnes!.toFixed(2), '0.26'); assert.equal(x.intervalMonths, null);
assert.equal(r('R-404A', 5, { leakDetection: true }).intervalMonths, 24);
assert.equal(r('R-404A', 15).intervalMonths, 6); // 58,8 t
assert.equal(r('R-404A', 15, { leakDetection: true }).intervalMonths, 12);
assert.equal(r('R-404A', 130).intervalMonths, 3); // 509,9 t
assert.equal(r('R-404A', 130, { leakDetection: true }).intervalMonths, 6);
assert.equal(r('R-410A', 4, { hermetic: true }).intervalMonths, null); // 8,35 t < 10 t hermeettinen
assert.equal(r('R-410A', 5, { hermetic: true }).intervalMonths, 12); // 10,44 t
assert.equal(r('R-1234yf', 0.9).intervalMonths, null);
assert.equal(r('R-1234yf', 1.5).intervalMonths, 12);
assert.equal(r('R-1234yf', 1.5, { hermetic: true }).intervalMonths, null);
assert.equal(r('R-404A', 5, { gwpOverride: 500 }).intervalMonths, null);
assert.equal(refrigerantGwp('r404a'), 3922);
assert.equal(addMonthsYmd('2026-08-31', 6), '2027-02-28');
const s = buildDeviceSchedule({ deviceType: 'pakastin', refrigerant: 'R-404A', chargeKg: 5, lastServiceYmd: '2026-04-14', lastLeakCheckYmd: '2025-11-01', todayYmd: '2026-10-27' });
assert.equal(s.serviceIntervalMonths, 6); assert.equal(s.service.state, 'myöhässä'); assert.equal(s.leak.state, 'erääntyy'); assert.ok(s.combineHint); assert.ok(s.needsService);
const s2 = buildDeviceSchedule({ deviceType: 'lämpöpumppu', refrigerant: 'R-32', chargeKg: 0.38, lastServiceYmd: '2026-10-27', todayYmd: '2026-10-27' });
assert.equal(s2.service.state, 'huollettu'); assert.equal(s2.leak.intervalMonths, null); assert.ok(!s2.needsService);
import { agoLabelFi, untilLabelFi, leakStatusText, serviceStatusText } from '../src/lib/huoltoSchedule';
assert.equal(agoLabelFi('2026-10-29', '2026-10-29'), 'tänään');
assert.equal(agoLabelFi('2026-10-16', '2026-10-29'), '13 pv sitten');
assert.equal(agoLabelFi('2026-10-15', '2026-10-29'), '2 vk sitten');
assert.equal(agoLabelFi('2026-09-03', '2026-10-29'), '2 kk sitten');
assert.equal(untilLabelFi('2026-11-03', '2026-10-29'), '5 pv päästä');
assert.equal(untilLabelFi('2026-12-10', '2026-10-29'), '6 vk päästä');
assert.equal(leakStatusText({ state: 'myöhässä', dueYmd: null }, '2026-10-29')?.label, 'Vuototarkastus myöhässä');
assert.equal(leakStatusText({ state: 'erääntyy', dueYmd: '2026-11-12' }, '2026-10-29')?.label, 'Vuototarkastus erääntyy 2 vk päästä');
assert.equal(serviceStatusText({ state: 'erääntyy', lastYmd: '2026-01-01', dueYmd: '2026-11-03' }, '2026-10-29').label, 'Huolto erääntyy 5 pv päästä');
console.log('huolto-schedule ok');
