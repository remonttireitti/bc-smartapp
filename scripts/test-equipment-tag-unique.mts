import assert from 'node:assert/strict';
import { findDuplicateEquipmentTag, saveEquipmentFromReport } from '../src/lib/huoltoRaportti/equipmentSnapshot';
import { huoltoPerformerFieldsKeepingFiller } from '../src/lib/huoltoRaportti/performerFromProfile';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults';

const rows = [{ id: 'e1', tag: 'JK1', customer_id: 'c1' }, { id: 'e2', tag: 'JK 2', customer_id: 'c1' }, { id: 'e9', tag: 'JK3', customer_id: 'c2' }];
let inserts = 0;
function mock(): any {
  return { from: () => {
    const q: any = { _f: {} as Record<string, unknown>,
      select() { return q; }, eq(k: string, v: unknown) { q._f[k] = v; return q; },
      insert() { inserts++; return { select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }) }; },
      maybeSingle: async () => ({ data: null, error: null }),
      then(res: any) { res({ data: rows.filter((r) => !q._f.customer_id || r.customer_id === q._f.customer_id), error: null }); } };
    return q; } };
}
const sb = mock();
assert.equal(await findDuplicateEquipmentTag(sb, 'c1', 'jk1', null), 'JK1');
assert.equal(await findDuplicateEquipmentTag(sb, 'c1', ' JK  2 ', null), 'JK 2');
assert.equal(await findDuplicateEquipmentTag(sb, 'c1', 'JK3', null), null, 'other customer ok');
assert.equal(await findDuplicateEquipmentTag(sb, 'c1', 'JK1', 'e1'), null, 'own tag ok');
assert.equal(await findDuplicateEquipmentTag(sb, 'c1', 'JK1', 'e2'), 'JK1', 'rename onto existing blocked');
const form = { ...createEmptyHuoltoReportData(), laiteTyyppi: 'kylmäkoneikko', laiteTunnus: 'jk1' };
await assert.rejects(saveEquipmentFromReport(form, 'c1', 'o1', null, sb), /Asiakkaalla on jo laite tunnuksella "JK1"/);
assert.equal(inserts, 0);
const profileB: any = { display_name: 'Kumppani Kalle', tukes_number: '999' };
const session: any = { user: { email: 'k@x.fi' } };
assert.deepEqual(huoltoPerformerFieldsKeepingFiller({ huoltoSuorittajaNimi: 'Enn K', huoltoSuorittajaTUKES: '123' }, profileB, session), { huoltoSuorittajaNimi: 'Enn K', huoltoSuorittajaTUKES: '123' });
assert.equal(huoltoPerformerFieldsKeepingFiller({ huoltoSuorittajaNimi: '' }, profileB, session).huoltoSuorittajaNimi, 'Kumppani Kalle');
console.log('OK');
