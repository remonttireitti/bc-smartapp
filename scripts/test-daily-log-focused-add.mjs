/** "+ Lisää työ / kulu / tarvike": saman päivän kirjaukseen lisäys, ei kaksoiskirjausta. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  focusedAddTargetLog,
  mergeFocusedAddRows,
  mergeFocusedAddWorkDone,
} from '../src/lib/dailyLogFocusedAdd.ts';

const logs = [
  { id: 'a', log_date: '2026-10-06', created_at: '2026-10-06T17:00:00Z' },
  { id: 'b', log_date: '2026-10-07', created_at: '2026-10-07T16:00:00Z' },
  { id: 'c', log_date: '2026-10-07', created_at: '2026-10-07T18:00:00Z' },
];
assert.equal(focusedAddTargetLog(logs, '2026-10-06').id, 'a');
assert.equal(focusedAddTargetLog(logs, '2026-10-07').id, 'c'); // uusin samalta päivältä
assert.equal(focusedAddTargetLog(logs, '2026-10-10'), null); // tänään ei kirjausta → uusi

// Käyttäjä lisää tarvikkeen (n1) tälle päivälle (ei kohdetta) ja vaihtaa päiväksi 6.10. (kohde: e1, e2).
const target6 = [{ key: 'e1' }, { key: 'e2' }];
const step1 = mergeFocusedAddRows(target6, [{ key: 'n1' }], new Set());
assert.deepEqual(step1.map((r) => r.key), ['e1', 'e2', 'n1']);
// Vaihtaa päiväksi 7.10. (kohde: f1): 6.10. rivit pois, uusi rivi mukana.
const step2 = mergeFocusedAddRows([{ key: 'f1' }], [...step1, { key: 'n2' }], new Set(['e1', 'e2']));
assert.deepEqual(step2.map((r) => r.key), ['f1', 'n1', 'n2']);
// Takaisin päivälle ilman kirjausta: vain uudet rivit.
assert.deepEqual(mergeFocusedAddRows([], step2, new Set(['f1'])).map((r) => r.key), ['n1', 'n2']);

assert.equal(mergeFocusedAddWorkDone('Asennettu sisäyksikkö', 'Koekäyttö'), 'Asennettu sisäyksikkö\nKoekäyttö');
assert.equal(mergeFocusedAddWorkDone('Asennettu sisäyksikkö', ''), 'Asennettu sisäyksikkö');
assert.equal(mergeFocusedAddWorkDone('Asennettu sisäyksikkö', 'sisäyksikkö'), 'Asennettu sisäyksikkö');
assert.equal(mergeFocusedAddWorkDone('', 'Koekäyttö'), 'Koekäyttö');

// Sivu: napit ja osiot lähdekoodissa (kohdistettu lisäys, ei koko dialogia).
const src = fs.readFileSync(new URL('../src/pages/WorkReportDetailPage.tsx', import.meta.url), 'utf8');
for (const label of ['+ Lisää työ', '+ Lisää kulu', '+ Lisää tarvike tai varaosa']) assert.ok(src.includes(label), label);
assert.ok(!src.includes('+ Lisää työkirjaus\n'), 'yksittäinen nappi poistettu');
assert.match(src, /work: \['day', 'work', 'hours'\]/);
assert.match(src, /expenses: \['day', 'expenses', 'trips'\]/);
assert.match(src, /materials: \['day', 'expenses'\],/);
console.log('test-daily-log-focused-add: OK');
