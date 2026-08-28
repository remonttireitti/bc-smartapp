import assert from 'node:assert/strict';
import {
  collectRefrigerantHistoryTypes,
  filterRefrigerantHistoryByType,
  mergeRefrigerantInventoryHistoryRows,
  purchaseSaleRowAffectsWarehouseBalance,
  refrigerantHistoryDirectionLabel,
  summarizeRefrigerantHistoryBalance,
} from '../src/lib/refrigerantInventoryHistory.ts';

assert.equal(refrigerantHistoryDirectionLabel('in'), '+');
assert.equal(refrigerantHistoryDirectionLabel('out'), '−');

const movement = {
  id: 'm-1',
  movement_type: 'work_use',
  qty_kg: 2,
  refrigerant_type: 'R-404A',
  serial_number: 'V055171',
  ownership_type: 'rental',
  work_report_id: 'wr-1',
  created_at: '2026-08-28T10:30:23.000Z',
  customer: null,
  cylinder: { ownership_type: 'rental' },
  work_report: { title: 'Sinikalliontie 3' },
};

const saleRow = {
  id: 'sale:line-1',
  kind: 'sale',
  date: '2026-08-28',
  work_report_id: 'wr-1',
  work_report_title: 'Sinikalliontie 3',
  customer_name: 'Testi Oy',
  refrigerant_type: 'R-404A',
  qty_kg: 2,
  serial_number: 'V055171',
  ownership: 'Vuokra',
  source_label: 'Kumppanin varastosta',
  source: 'partner_warehouse',
  owner_company_id: 'company-a',
  created_by_company_id: 'company-b',
};

const deduped = mergeRefrigerantInventoryHistoryRows([movement], [saleRow]);
assert.equal(deduped.length, 1);
assert.equal(deduped[0].eventLabel, 'Myynti');
assert.equal(deduped[0].direction, 'out');
assert.equal(deduped[0].affects_warehouse_balance, true);

const serialMismatchSale = {
  ...saleRow,
  serial_number: '—',
};

const serialMismatchDeduped = mergeRefrigerantInventoryHistoryRows([movement], [serialMismatchSale]);
assert.equal(serialMismatchDeduped.length, 1);
assert.equal(serialMismatchDeduped[0].eventLabel, 'Myynti');
assert.equal(serialMismatchDeduped[0].affects_warehouse_balance, true);

const duplicateWorkUse = mergeRefrigerantInventoryHistoryRows(
  [
    movement,
    {
      ...movement,
      id: 'm-1b',
      created_at: '2026-08-28T10:31:00.000Z',
    },
  ],
  [saleRow],
);
assert.equal(duplicateWorkUse.length, 1);
assert.equal(duplicateWorkUse[0].eventLabel, 'Myynti');

const purchaseMovement = {
  ...movement,
  id: 'm-2',
  movement_type: 'purchase',
  work_report_id: null,
  created_at: '2026-06-08T07:27:07.000Z',
  work_report: null,
};

const retrieveMovement = {
  ...movement,
  id: 'm-3',
  movement_type: 'customer_retrieve',
  work_report_id: null,
  refrigerant_type: 'R-410A',
  qty_kg: 10,
  serial_number: '—',
  created_at: '2026-05-28T18:09:22.000Z',
  customer: { name: 'Cityvarasto Hyrylä' },
  work_report: null,
};

const retrieveRow = {
  ...saleRow,
  id: 'retrieve:m-3',
  kind: 'retrieve',
  refrigerant_type: 'R-410A',
  qty_kg: 10,
  serial_number: '—',
  customer_name: 'Cityvarasto Hyrylä',
  source_label: 'Asiakkaalta talteen',
};

const merged = mergeRefrigerantInventoryHistoryRows(
  [purchaseMovement, retrieveMovement],
  [retrieveRow],
);
assert.equal(merged.length, 2);
assert.ok(merged.some((row) => row.eventLabel === 'Osto / varastoon' && row.direction === 'in'));
assert.ok(merged.some((row) => row.eventLabel === 'Asiakkaalta talteen' && row.direction === 'in'));

const balance = summarizeRefrigerantHistoryBalance(merged);
assert.equal(balance.length, 2);
const r410 = balance.find((row) => row.refrigerant_type === 'R-410A');
assert.ok(r410);
assert.equal(r410.in_kg, 10);
assert.equal(r410.out_kg, 0);
assert.equal(r410.net_kg, 10);

const filtered = filterRefrigerantHistoryByType(merged, 'R-410A');
assert.equal(filtered.length, 1);
assert.deepEqual(collectRefrigerantHistoryTypes(merged), ['R-404A', 'R-410A']);

const supplierPurchase = {
  ...saleRow,
  id: 'purchase:line-2',
  kind: 'purchase',
  refrigerant_type: 'R-410A',
  qty_kg: 27,
  source: 'supplier',
  source_label: 'Tukkuri: Testi',
};

const supplierSale = {
  ...supplierPurchase,
  id: 'sale:line-2',
  kind: 'sale',
  source_label: 'Tukkurilta',
};

assert.equal(purchaseSaleRowAffectsWarehouseBalance(supplierPurchase), false);
assert.equal(purchaseSaleRowAffectsWarehouseBalance(supplierSale), false);

const passThroughHistory = mergeRefrigerantInventoryHistoryRows([], [supplierPurchase, supplierSale]);
assert.equal(passThroughHistory.length, 2);
assert.ok(passThroughHistory.every((row) => row.affects_warehouse_balance === false));

const passThroughBalance = summarizeRefrigerantHistoryBalance([...merged, ...passThroughHistory]);
const r410Balance = passThroughBalance.find((row) => row.refrigerant_type === 'R-410A');
assert.ok(r410Balance);
assert.equal(r410Balance.in_kg, 10);
assert.equal(r410Balance.out_kg, 0);
assert.equal(r410Balance.net_kg, 10);

console.log('test-refrigerant-inventory-history: ok');
