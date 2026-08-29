import assert from 'node:assert/strict';
import { buildRefrigerantPeriodReportHtml } from '../src/lib/refrigerantInventoryReport.ts';

const html = buildRefrigerantPeriodReportHtml({
  companyName: 'Lämpökatsastus Oy',
  fromLabel: '1.8.2026',
  toLabel: '29.8.2026',
  summary: {
    purchased_kg: 10,
    customer_retrieved_kg: 0,
    recycled_kg: 0,
    work_use_kg: 7,
    sold_kg: 0,
  },
  rows: [
    {
      kind: 'movement',
      date: '2026-08-28T10:03:52.000Z',
      typeLabel: 'Käyttö työkohteella',
      refrigerant_type: 'R-404A',
      serial_number: 'V055171',
      qty_kg: 2,
      customer_name: '—',
      location: '—',
      ownership: 'Vuokra',
      notes: '',
    },
  ],
});

assert.match(html, /<title>Kylmäaineraportti Lämpökatsastus Oy<\/title>/);
assert.match(html, /Käyttö työkohteella/);
assert.match(html, /V055171/);
assert.doesNotMatch(html, /Ei tapahtumia valitulla jaksolla/);

console.log('test-refrigerant-inventory-report: ok');
