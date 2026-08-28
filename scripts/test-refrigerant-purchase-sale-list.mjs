import assert from 'node:assert/strict';
import {
  buildRefrigerantPurchaseSaleRows,
  filterPurchaseSaleRowsForViewer,
  formatRefrigerantOwnershipLabel,
  lineBelongsToWarehouseCompany,
  refrigerantPurchaseSaleSourceLabel,
} from '../src/lib/refrigerantPurchaseSaleList.ts';

const companyId = 'company-a';

function baseLine(overrides = {}) {
  return {
    id: 'line-1',
    work_report_id: 'wr-1',
    source: 'warehouse',
    supplier_name: null,
    supplier_paid_by: null,
    bill_to_customer: true,
    warehouse_company_id: null,
    refrigerant_type: 'R-410A',
    qty_kg: 2.5,
    created_at: '2026-01-15T10:00:00.000Z',
    cylinder: { serial_number: 'SN-1', ownership_type: 'owned' },
    daily_log: { log_date: '2026-01-15' },
    work_report: {
      id: 'wr-1',
      title: 'Huolto asiakkaalle',
      owner_company_id: companyId,
      created_by_company_id: 'creator-co',
      customers: { name: 'Testi Oy' },
    },
    ...overrides,
  };
}

assert.equal(formatRefrigerantOwnershipLabel('owned'), 'Omistus');
assert.equal(formatRefrigerantOwnershipLabel('rental'), 'Vuokra');
assert.equal(formatRefrigerantOwnershipLabel(null), '—');

assert.equal(
  refrigerantPurchaseSaleSourceLabel({
    kind: 'purchase',
    source: 'supplier',
    supplier_name: 'Kylmä Oy',
  }),
  'Tukkuri: Kylmä Oy',
);

assert.equal(
  lineBelongsToWarehouseCompany(
    {
      warehouse_company_id: 'company-b',
      work_report: { owner_company_id: companyId, id: 'wr-1', title: null, customers: null },
    },
    companyId,
  ),
  true,
);

const saleRows = buildRefrigerantPurchaseSaleRows([baseLine()], companyId);
assert.equal(saleRows.length, 1);
assert.equal(saleRows[0].kind, 'sale');
assert.equal(saleRows[0].serial_number, 'SN-1');
assert.equal(saleRows[0].ownership, 'Omistus');
assert.equal(saleRows[0].customer_name, 'Testi Oy');

const purchaseRows = buildRefrigerantPurchaseSaleRows(
  [
    baseLine({
      source: 'supplier',
      supplier_name: 'Tukkuri',
      supplier_paid_by: 'own',
      bill_to_customer: true,
      cylinder: null,
    }),
  ],
  companyId,
);
assert.equal(purchaseRows.length, 2);
assert.deepEqual(
  purchaseRows.map((row) => row.kind).sort(),
  ['purchase', 'sale'],
);

const filtered = buildRefrigerantPurchaseSaleRows(
  [baseLine({ work_report: { ...baseLine().work_report, owner_company_id: 'other' } })],
  companyId,
);
assert.equal(filtered.length, 0);

const ownerView = filterPurchaseSaleRowsForViewer(purchaseRows, companyId);
assert.equal(ownerView.some((row) => row.kind === 'purchase'), false);
assert.ok(ownerView.some((row) => row.kind === 'sale'));

console.log('test-refrigerant-purchase-sale-list: ok');
