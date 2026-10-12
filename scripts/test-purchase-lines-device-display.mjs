import assert from 'node:assert/strict';
import { purchaseLinesForDisplay } from '../src/lib/workReportDeviceEntries.ts';
// Wärtsilä 293ec669: laitekirjaus 5106,71 € oli Tarvikkeet-rivillä, laite 0 €.
const lines = [
  { id: 'device:x', label: 'Mitsubishi', source: 'device', quantity: 1, unit: 'kpl', quote_purchase_net: 4174, actual_purchase_net: 0, actual_from_entries: true },
  { id: 'group:diary-supplies', label: 'Tarvikkeet', source: 'group', quantity: null, unit: null, quote_purchase_net: 2160, actual_purchase_net: 5942.85 },
];
const logs = [{ id: 'l1', log_date: '2026-10-09', customer_extra_billing: null, expense_lines: [
  { id: 'd', expense_type: 'device', description: 'Mitsubishi', qty: 1, unit_price: 5106.71, bill_to_partner: false, bill_to_customer: false, sort_order: 0 },
] }];
const out = purchaseLinesForDisplay(lines, logs);
assert.equal(out[0].actual_purchase_net, 5106.71);
assert.equal(out[1].actual_purchase_net, 836.14);
assert.deepEqual(purchaseLinesForDisplay(lines, []), lines);
console.log('test-purchase-lines-device-display: ok');
