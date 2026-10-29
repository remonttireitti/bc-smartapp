// Kylmäaineen yksi totuuden lähde: laitekortti ↔ huoltopöytäkirja (ei oikeaa Supabasea).
import assert from 'node:assert/strict';
import { snapshotWithRefrigerant, refrigerantFieldsFromReport, patchTouchesRefrigerant } from '../src/lib/equipmentRefrigerant';
import { syncEquipmentFromReport } from '../src/lib/huoltoRaportti/equipmentSnapshot';

type Row = { id: string; refrigerant: string | null; refrigerant_charge_kg: number | null; manufacturer: string | null; installed_on: string | null; huolto_technical_snapshot: Record<string, unknown> };
function fakeSupabase(row: Row) {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      assert.equal(table, 'equipment');
      return {
        select: () => ({
          in: async () => ({ data: [{ ...row }], error: null }),
          eq: () => ({ maybeSingle: async () => ({ data: { huolto_technical_snapshot: row.huolto_technical_snapshot }, error: null }) }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => { updates.push(patch); Object.assign(row, patch); return { error: null }; },
        }),
      };
    },
  };
  return { client: client as never, updates };
}
const base = (): Row => ({ id: 'e1', refrigerant: 'R-449A', refrigerant_charge_kg: 5, manufacturer: null, installed_on: null,
  huolto_technical_snapshot: { laiteTyyppi: 'pakastin', kylmaaineTyyppi: 'R-404A', kylmaaineMaaraYhteensa: '9', kylmaainePiireja: '1', kylmaaineValmistajaMaara: '9' } });

// snapshotWithRefrigerant: kortin arvo korvaa vanhentuneen kopion, yhden piirin summa täsmää
let s = snapshotWithRefrigerant(base().huolto_technical_snapshot, { refrigerant: 'R-449A', refrigerant_charge_kg: 5 });
assert.equal(s.kylmaaineTyyppi, 'R-449A'); assert.equal(s.kylmaaineMaaraYhteensa, '5'); assert.equal(s.kylmaaineValmistajaMaara, '5');
assert.equal(refrigerantFieldsFromReport(s).refrigerant_charge_kg, 5);
s = snapshotWithRefrigerant({ ...s, kylmaaineLisattyMaara: '1' }, { refrigerant: 'R-449A', refrigerant_charge_kg: 5 });
assert.equal(s.kylmaaineValmistajaMaara, '4'); assert.equal(s.kylmaaineLisattyMaara, '1');
// clear: tyhjennys poistaa avaimet
s = snapshotWithRefrigerant(s, {}, { clear: true });
assert.equal(s.kylmaaineTyyppi, undefined); assert.equal(s.kylmaaineMaaraYhteensa, undefined);
assert.ok(patchTouchesRefrigerant({ kylmaaineTyyppi: 'x' })); assert.ok(!patchTouchesRefrigerant({ laiteMalli: 'x' }));

// 1) Pöytäkirjaa ei muokattu kylmäaineen osalta → kortti voittaa, sarakkeita ei kirjoiteta yli
{
  const row = base(); const { client, updates } = fakeSupabase(row);
  await syncEquipmentFromReport('e1', { laiteTyyppi: 'pakastin', kylmaaineTyyppi: 'R-404A', kylmaaineMaaraYhteensa: '9', kylmaainePiireja: '1', kylmaaineValmistajaMaara: '9' }, client, undefined, { refrigerantEdited: false });
  assert.equal(row.refrigerant, 'R-449A'); assert.equal(row.refrigerant_charge_kg, 5);
  assert.equal(row.huolto_technical_snapshot.kylmaaineTyyppi, 'R-449A'); assert.equal(row.huolto_technical_snapshot.kylmaaineMaaraYhteensa, '5');
  assert.ok(!updates.some((u) => 'refrigerant' in u || 'refrigerant_charge_kg' in u), 'sarakkeita ei saa ylikirjoittaa');
}
// 2) Pöytäkirjalla muokattu → laitekortin sarakkeet ja snapshot päivittyvät yhdessä
{
  const row = base(); const { client, updates } = fakeSupabase(row);
  await syncEquipmentFromReport('e1', { laiteTyyppi: 'pakastin', kylmaaineTyyppi: 'R-290', kylmaaineMaaraYhteensa: '3,5', kylmaainePiireja: '1', kylmaaineValmistajaMaara: '3,5' }, client, undefined, { refrigerantEdited: true });
  assert.equal(row.refrigerant, 'R-290'); assert.equal(row.refrigerant_charge_kg, 3.5);
  assert.equal(row.huolto_technical_snapshot.kylmaaineTyyppi, 'R-290');
  assert.ok(updates.some((u) => u.refrigerant === 'R-290'));
}
// 3) Kortilla ei kylmäainetta (vanha laite) → fill-empty täyttää sarakkeet pöytäkirjasta
{
  const row = { ...base(), refrigerant: null, refrigerant_charge_kg: null, huolto_technical_snapshot: {} } as Row; const { client } = fakeSupabase(row);
  await syncEquipmentFromReport('e1', { laiteTyyppi: 'pakastin', kylmaaineTyyppi: 'R-134a', kylmaaineMaaraYhteensa: '2', kylmaainePiireja: '1' }, client, undefined, { refrigerantEdited: false });
  assert.equal(row.refrigerant, 'R-134a'); assert.equal(row.refrigerant_charge_kg, 2);
}
console.log('test-equipment-refrigerant-source OK');
