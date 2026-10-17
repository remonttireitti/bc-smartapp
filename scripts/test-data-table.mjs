import assert from 'node:assert/strict';
import { filterAndSortRows, compareTableValues } from '../src/components/DataTable.tsx';

const cols = [
  { key: 'name', label: 'Nimi', value: (r) => r.name },
  { key: 'n', label: 'N', value: (r) => r.n },
  { key: 'd', label: 'Päivä', value: (r) => r.d },
];
const rows = [
  { name: 'Öljy Oy', n: 10, d: '2026-01-02' },
  { name: 'aalto', n: 2, d: '' },
  { name: 'Bertta', n: 100, d: '2026-05-01' },
];
assert.deepEqual(filterAndSortRows(rows, cols, '', { key: 'name', dir: 'asc' }).map((r) => r.name), ['aalto', 'Bertta', 'Öljy Oy']);
assert.deepEqual(filterAndSortRows(rows, cols, '', { key: 'n', dir: 'desc' }).map((r) => r.n), [100, 10, 2]);
// tyhjät aina viimeisinä
assert.deepEqual(filterAndSortRows(rows, cols, '', { key: 'd', dir: 'desc' }).map((r) => r.name), ['Bertta', 'Öljy Oy', 'aalto']);
assert.deepEqual(filterAndSortRows(rows, cols, '', { key: 'd', dir: 'asc' }).map((r) => r.name), ['Öljy Oy', 'Bertta', 'aalto']);
assert.deepEqual(filterAndSortRows(rows, cols, 'bert', null).map((r) => r.name), ['Bertta']);
assert.deepEqual(filterAndSortRows(rows, cols, '', null).map((r) => r.name), rows.map((r) => r.name));
assert.equal(compareTableValues('a2', 'a10') < 0, true);
console.log('data-table ok');
