import assert from 'node:assert/strict';
import { defaultSuggestionSelection, latestSharedYmd, maxYmd, sharedRowsToHistoryEntries, suggestionKey, type EquipmentLinkSuggestion, type SharedHistoryRow } from '../src/lib/equipmentLinks';

const sug = (m: string, o: string): EquipmentLinkSuggestion => ({ mine_id: m, mine_label: m, other_id: o, other_label: o, other_serial: null, other_company: 'X', score: 'high', can_activate: true });
const list = [sug('a', '1'), sug('b', '2'), sug('b', '3'), sug('c', '3')];
const sel = defaultSuggestionSelection(list);
assert.deepEqual([...sel], [suggestionKey(list[0])]); // vain yksiselitteinen pari päällä

const rows: SharedHistoryRow[] = [
  { entry_date: '2026-10-20', kind: 'huoltopöytäkirja', company: 'L Oy', installer: 'M', tukes: 'T7', work_done: null, summary: 'Huolto', is_service: true, is_leak_check: true },
  { entry_date: '2026-11-01', kind: 'merkintä', company: 'L Oy', installer: 'M', tukes: null, work_done: 'Hälytys kuitattu', summary: null, is_service: false, is_leak_check: false },
];
assert.equal(latestSharedYmd(rows, 'service'), '2026-10-20');
assert.equal(latestSharedYmd(rows, 'leak'), '2026-10-20');
assert.equal(maxYmd('2026-09-01', '2026-10-20'), '2026-10-20');
const h = sharedRowsToHistoryEntries(rows);
assert.equal(h[0].summary, 'Huolto (L Oy · M, Tukes T7)');
assert.equal(h[1].kind, 'merkintä');
assert.ok(!JSON.stringify(h).match(/€|hinta/));
console.log('equipment-links ok');
