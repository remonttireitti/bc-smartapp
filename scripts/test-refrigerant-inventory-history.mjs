import assert from 'node:assert/strict';
import {
  collapseHistorySaleWorkUseDuplicates,
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
  cylinder_id: 'cyl-1',
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

const billingLine = {
  id: 'line-1',
  work_report_id: 'wr-1',
  cylinder_id: 'cyl-1',
  source: 'partner_warehouse',
  supplier_paid_by: null,
  bill_to_customer: false,
  warehouse_company_id: 'company-a',
  refrigerant_type: 'R-404A',
  qty_kg: 2,
  created_at: '2026-08-28T10:00:00.000Z',
  cylinder: { serial_number: 'V055171', ownership_type: 'rental' },
  daily_log: { log_date: '2026-08-28' },
  work_report: {
    id: 'wr-1',
    title: 'Sinikalliontie 3 – Kylmiöt lämpönee',
    owner_company_id: 'company-a',
    created_by_company_id: 'company-b',
    customers: { name: 'Sinikalliontie 3' },
  },
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

const deduped = mergeRefrigerantInventoryHistoryRows([movement], [saleRow], [billingLine], 'company-a');
assert.equal(deduped.length, 1);
assert.equal(deduped[0].eventLabel, 'Myynti');
assert.equal(deduped[0].direction, 'out');
assert.equal(deduped[0].affects_warehouse_balance, true);

const serialMismatchSale = {
  ...saleRow,
  serial_number: '—',
};

const serialMismatchDeduped = mergeRefrigerantInventoryHistoryRows(
  [movement],
  [serialMismatchSale],
  [billingLine],
  'company-a',
);
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
  [billingLine],
  'company-a',
);
assert.equal(duplicateWorkUse.length, 1);
assert.equal(duplicateWorkUse[0].eventLabel, 'Myynti');

const titleMatchedMovement = {
  ...movement,
  id: 'm-title',
  work_report_id: null,
  cylinder_id: 'cyl-1',
  created_at: '2026-08-28T10:30:23.000Z',
  work_report: { title: 'Sinikalliontie 3 - Kylmiot lamponee' },
};

const titleMatchedSale = {
  ...saleRow,
  id: 'sale:title',
  work_report_id: 'wr-different',
  work_report_title: 'Sinikalliontie 3 – Kylmiöt lämpönee',
  date: '2026-08-28',
};

const titleMatched = mergeRefrigerantInventoryHistoryRows(
  [titleMatchedMovement],
  [titleMatchedSale],
  [billingLine],
  'company-a',
);
assert.equal(titleMatched.length, 1);
assert.equal(titleMatched[0].eventLabel, 'Myynti');
assert.equal(titleMatched[0].affects_warehouse_balance, true);

const collapseOnly = collapseHistorySaleWorkUseDuplicates([
  {
    id: 'report:sale:line-1',
    at: '2026-08-28T12:00:00.000Z',
    eventLabel: 'Myynti',
    direction: 'out',
    work_report_id: 'wr-1',
    work_report_title: 'Sinikalliontie 3 – Kylmiöt lämpönee',
    customer_name: 'Sinikalliontie 3',
    refrigerant_type: 'R-404A',
    qty_kg: 2,
    serial_number: 'V055171',
    ownership: 'Vuokra',
    source_label: 'Kumppanin varastosta',
    affects_warehouse_balance: false,
  },
  {
    id: 'movement:m-1',
    at: '2026-08-28T10:30:23.000Z',
    eventLabel: 'Käyttö työkohteella',
    direction: 'out',
    work_report_id: 'wr-1',
    work_report_title: 'Sinikalliontie 3 – Kylmiöt lämpönee',
    customer_name: '—',
    refrigerant_type: 'R-404A',
    qty_kg: 2,
    serial_number: 'V055171',
    ownership: 'Vuokra',
    source_label: 'Käyttö työkohteella',
    affects_warehouse_balance: true,
  },
]);
assert.equal(collapseOnly.length, 1);
assert.equal(collapseOnly[0].eventLabel, 'Myynti');
assert.equal(collapseOnly[0].affects_warehouse_balance, true);

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
