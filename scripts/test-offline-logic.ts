import assert from 'node:assert/strict';
import { matchesFilter, parseRestUrl, projectRow, sortRows, splitTopLevel } from '../src/lib/offline/restQuery';
import { findConflictKeys } from '../src/lib/offline/sync';
import { applyOverlay } from '../src/lib/offline/store';

const base = 'https://x.supabase.co/rest/v1';
const q = parseRestUrl(`${base}/maintenance_reports?select=id,status,equipment(name,tag)&customer_id=eq.c1&status=in.(draft,submitted)&order=updated_at.desc&limit=5`, base)!;
assert.equal(q.table, 'maintenance_reports');
assert.equal(q.filters.length, 2);
assert.equal(q.limit, 5);
assert.equal(q.unsupported, false);
assert.equal(parseRestUrl(`${base}/equipment?or=(a.eq.1,b.eq.2)`, base)!.unsupported, true);
assert.equal(parseRestUrl(`${base}/equipment_notes?equipment.customer_id=eq.c1`, base)!.unsupported, true);
assert.deepEqual(splitTopLevel('id, equipment(name, tag), a:b'), ['id', 'equipment(name, tag)', 'a:b']);

const row = { id: 'r1', status: 'draft', customer_id: 'c1', equipment: { name: 'JK10', tag: 'JK10' }, data: { huoltoPaivamaara: '2026-10-27' } };
assert.equal(matchesFilter(row, q.filters[0]), true);
assert.equal(matchesFilter(row, q.filters[1]), true);
assert.equal(matchesFilter(row, { col: 'missing', op: 'eq', val: 'x', neg: false }), undefined);
assert.deepEqual(projectRow(row, 'id,status,equipment(name,tag)'), { id: 'r1', status: 'draft', equipment: row.equipment });
assert.equal(projectRow(row, 'id,completed_at'), null); // puuttuva sarake → ei palvella arvaamalla
assert.deepEqual(projectRow(row, 'id,pvm:data->>huoltoPaivamaara'), { id: 'r1', pvm: '2026-10-27' });
assert.deepEqual(sortRows([{ a: 1 }, { a: 3 }, { a: 2 }], [{ col: 'a', desc: true }]).map((r) => r.a), [3, 2, 1]);

// Jonon päällekirjoitus näkyy lukuina (myös verkossa) → editori ei lataa vanhaa palvelinversiota yli
const outbox = [{ table: 'maintenance_reports', op: 'update', id: 'r1', payload: { status: 'submitted' }, base: {}, ts: 1, state: 'pending', attempts: 0 }] as never;
assert.equal(applyOverlay('maintenance_reports', [row], outbox)[0].status, 'submitted');
assert.equal(applyOverlay('equipment', [row], outbox)[0].status, 'draft');
// Kolmitieyhdistys: palvelin ennallaan → ei ristiriitaa; palvelimella toisen käyttäjän muutos → ristiriita; oma aiempi (osittain mennyt) lähetys → ei ristiriitaa
assert.deepEqual(findConflictKeys({ data: 'A' }, { data: 'B' }, { data: 'A' }, {}), []);
assert.deepEqual(findConflictKeys({ data: 'C' }, { data: 'B' }, { data: 'A' }, {}), ['data']);
assert.deepEqual(findConflictKeys({ data: 'B1' }, { data: 'B2' }, { data: 'A' }, { data: [JSON.stringify('B1')] }), []);
assert.deepEqual(findConflictKeys({ data: 'C' }, { data: 'C' }, { data: 'A' }, {}), []);
assert.deepEqual(findConflictKeys({ completed_at: null }, { completed_at: 'x' }, {}, {}), []); // lähtötila tuntematon → ei väitetä ristiriitaa
console.log('offline-logic ok');
