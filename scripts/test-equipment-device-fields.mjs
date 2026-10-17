import assert from 'node:assert/strict';
import { deviceFieldsFromSnapshot, effectiveDeviceFields, emptyFieldPatch, parseChargeKg, formatRefrigerant } from '../src/lib/equipmentDeviceFields.ts';
assert.equal(parseChargeKg('2,50'), 2.5);
assert.equal(parseChargeKg('10.20 kg'), 10.2);
assert.equal(parseChargeKg('—'), null);
assert.equal(parseChargeKg('0'), null);
const snap = { kylmaaineTyyppi: 'R-32', kylmaaineMaaraYhteensa: '1.40', kylmaaineLaatu: '' };
assert.deepEqual(deviceFieldsFromSnapshot(snap), { manufacturer: null, refrigerant: 'R-32', refrigerant_charge_kg: 1.4, installed_on: null });
// sarake voittaa tilannekuvan, puuttuva sarake → tilannekuva
const eff = effectiveDeviceFields({ manufacturer: 'Mitsubishi', refrigerant: 'R-410A', refrigerant_charge_kg: null, installed_on: '2020-05-01' }, snap);
assert.equal(eff.refrigerant, 'R-410A');
assert.equal(eff.refrigerant_charge_kg, 1.4);
assert.equal(effectiveDeviceFields(null, snap).refrigerant, 'R-32');
assert.equal(formatRefrigerant(eff), 'R-410A · 1,4 kg');
// täyttö ei ylikirjoita
const empty = { manufacturer: null, refrigerant: null, refrigerant_charge_kg: null, installed_on: null };
assert.deepEqual(emptyFieldPatch(empty, { manufacturer: 'Daikin', refrigerant: 'R-32', refrigerant_charge_kg: 1.2 }), { manufacturer: 'Daikin', refrigerant: 'R-32', refrigerant_charge_kg: 1.2 });
assert.deepEqual(emptyFieldPatch({ ...empty, manufacturer: 'Toshiba' }, { manufacturer: 'Daikin', refrigerant: '—' }), {});
console.log('equipment device fields ok');
