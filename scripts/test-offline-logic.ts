import assert from 'node:assert/strict';
import { matchesFilter, parseRestUrl, projectRow, sortRows, splitTopLevel } from '../src/lib/offline/restQuery';
import { canonJson, findConflictKeys, mergeJsonConflict, resolveConflictPayload } from '../src/lib/offline/sync';
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
// Postgres jsonb järjestää avaimet uudelleen → sama sisältö eri avainjärjestyksellä EI ole ristiriita (juurisyy kaksoisluonnokseen)
const clientOrder = { laiteTyyppi: 'ilp', a: 1, huomiot: 'x', nested: { zz: 1, b: 2 } };
const jsonbOrder = { a: 1, nested: { b: 2, zz: 1 }, huomiot: 'x', laiteTyyppi: 'ilp' };
assert.equal(canonJson(clientOrder), canonJson(jsonbOrder));
assert.deepEqual(findConflictKeys({ data: jsonbOrder }, { data: { ...clientOrder, huomiot: 'y' } }, { data: clientOrder }, {}), []); // base client-järjestyksessä
assert.deepEqual(findConflictKeys({ data: jsonbOrder }, { data: { ...clientOrder, huomiot: 'y' } }, { data: { a: 0 } }, { data: [JSON.stringify(clientOrder)] }), []); // vanha sent-merkintä
assert.deepEqual(findConflictKeys({ data: { ...jsonbOrder, huomiot: 'srv' } }, { data: { ...clientOrder, huomiot: 'y' } }, { data: clientOrder }, {}), ['data']); // aito ristiriita
// Ristiriidan ratkaisu samaan riviin: palvelimen muutokset säilyvät, laitteen muutokset tulevat mukaan, ei kopiota
const notes: { path: string; server: string }[] = [];
const merged = mergeJsonConflict(
  { a: 1, huomiot: 'srv', malli: 'SRV', extra: 'E' },
  { a: 1, huomiot: 'dev', malli: 'M1', uusi: 'U' },
  { a: 1, huomiot: 'alku', malli: 'M1' },
  notes,
) as Record<string, unknown>;
assert.deepEqual(merged, { a: 1, huomiot: 'dev', malli: 'SRV', extra: 'E', uusi: 'U' });
assert.deepEqual(notes.map((n) => n.path), ['huomiot']);
const res = resolveConflictPayload({ status: 'submitted', data: { a: 2 } }, { status: 'draft', completed_at: null, data: { a: 1, b: 1 } }, { status: 'draft', completed_at: null, data: { a: 1 } }, ['status', 'data']);
assert.equal('status' in res.payload, false); // valmista ei palauteta luonnokseksi
assert.deepEqual(res.payload.data, { a: 2, b: 1 });
console.log('offline-logic ok');
