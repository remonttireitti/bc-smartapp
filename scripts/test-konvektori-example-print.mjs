import assert from 'node:assert/strict';
import {
  buildKonvektoriExampleReportData,
  buildRandomKonvektoriExampleDate,
  KONVEKTORI_EXAMPLE_PERFORMER_NAME,
  KONVEKTORI_EXAMPLE_ROW_COUNT,
} from '../src/lib/huoltoRaportti/konvektoriExamplePrint.ts';
import { filterFaultyKonvektoriRows } from '../src/lib/huoltoRaportti/konvektoriTarkastus.ts';

const date = buildRandomKonvektoriExampleDate(new Date('2026-09-11'));
assert.match(date, /^\d{4}-\d{2}-\d{2}$/);

const data = buildKonvektoriExampleReportData({ huoltoPaivamaara: '2026-03-15' });
assert.equal(data.asiakas, 'Esimerkki asiakas Oy');
assert.equal(data.huoltoSuorittajaNimi, KONVEKTORI_EXAMPLE_PERFORMER_NAME);
assert.equal(data.huoltoSuorittajaTUKES, '');
assert.equal(data.laiteTyyppi, 'konvektorit');
assert.equal(data.konvektoriRows.length, KONVEKTORI_EXAMPLE_ROW_COUNT);
assert.equal(data.konvektoriRows[0]?.tunnus, 'K-101');
assert.equal(data.konvektoriRows[data.konvektoriRows.length - 1]?.tunnus, `K-${100 + KONVEKTORI_EXAMPLE_ROW_COUNT}`);

const faulty = filterFaultyKonvektoriRows(data.konvektoriRows);
assert.equal(faulty.length, 7);
assert.ok(faulty.every((row) => row.huomioTyyppi === 'vika' || row.venttiiliTarkastettu === false || row.puhallinTarkastettu === false || row.kennoPuhdistettu === false || row.kondenssiTarkastettu === false || row.ohjausToimii === false));

console.log('konvektori-example-print: ok');
