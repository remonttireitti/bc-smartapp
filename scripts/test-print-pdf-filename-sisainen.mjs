import assert from 'node:assert/strict';
import {
  formatPrintSaveFileName,
  withInternalPrintFileNameSuffix,
} from '../src/lib/printDocumentShell.ts';
import { buildWorkReportPrintTitle } from '../src/lib/workReportPrintHtml.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('withInternalPrintFileNameSuffix keeps customer base unchanged', () => {
  const base = 'Messukeskus - Päivystys - 5.11.2026';
  assert.equal(withInternalPrintFileNameSuffix(base, false), formatPrintSaveFileName(base));
});

test('withInternalPrintFileNameSuffix appends sisäinen for internal', () => {
  const base = 'Messukeskus - Päivystys - 5.11.2026';
  const internal = withInternalPrintFileNameSuffix(base, true);
  assert.equal(internal, formatPrintSaveFileName(`${base} sisäinen`));
  assert.match(internal, /sisäinen$/);
  assert.ok(internal.startsWith(formatPrintSaveFileName(base)));
});

test('withInternalPrintFileNameSuffix does not double-append', () => {
  const once = withInternalPrintFileNameSuffix('Tarjous - Asiakas', true);
  const twice = withInternalPrintFileNameSuffix(once, true);
  assert.equal(once, twice);
});

test('em/en dashes become hyphen in both variants', () => {
  const customer = withInternalPrintFileNameSuffix('Asiakas — Työ – 1.1.2026', false);
  const internal = withInternalPrintFileNameSuffix('Asiakas — Työ – 1.1.2026', true);
  assert.equal(customer, 'Asiakas - Työ - 1.1.2026');
  assert.equal(internal, 'Asiakas - Työ - 1.1.2026 sisäinen');
});

test('buildWorkReportPrintTitle differs only by sisäinen suffix', () => {
  const report = {
    title: 'Messukeskus – Päivystys',
    heading: 'Päivystys',
    description: null,
    location_text: null,
    completed_at: '2026-11-05T10:00:00Z',
    scheduled_start: null,
    customers: { name: 'Messukeskus' },
  };
  const customer = buildWorkReportPrintTitle(report, undefined, { printMode: 'customer' });
  const internal = buildWorkReportPrintTitle(report, undefined, { printMode: 'internal' });
  assert.equal(internal, formatPrintSaveFileName(`${customer} sisäinen`));
  assert.doesNotMatch(customer, /sisäinen/i);
  assert.match(internal, /sisäinen$/);
});

test('termatek-style base stays shared', () => {
  const offerNo = '123';
  const customerName = 'Messut Oy';
  const base = `Tarjous # ${offerNo} – ${customerName}`;
  const customer = withInternalPrintFileNameSuffix(base, false);
  const internal = withInternalPrintFileNameSuffix(base, true);
  assert.equal(customer, 'Tarjous # 123 - Messut Oy');
  assert.equal(internal, 'Tarjous # 123 - Messut Oy sisäinen');
});

console.log('All print PDF filename sisäinen tests passed.');
