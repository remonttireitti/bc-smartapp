import assert from 'node:assert/strict';
import {
  buildRefrigerantPeriodReportHtml,
  mergePeriodReportRows,
  movementToPeriodReportRow,
  summarizePeriodReportRows,
  supplierLineToPeriodReportRow,
} from '../src/lib/refrigerantInventoryReport.ts';

const workUse = movementToPeriodReportRow({
  movement_type: 'work_use',
  qty_kg: 2,
  refrigerant_type: 'R-404A',
  serial_number: 'V055171',
  location: null,
  ownership_type: 'rental',
  work_report_id: 'wr-1',
  notes: null,
  created_at: '2026-08-28T10:03:52.000Z',
  customer: null,
  work_report: {
    title: 'Sinikalliontie 3 – Kylmiöt lämpönee',
    customers: { name: 'Sinikalliontie 3' },
  },
  cylinder: { rental_supplier: 'darment', stock_source: 'purchase', ownership_type: 'rental' },
});

assert.ok(workUse);
assert.equal(workUse.typeLabel, 'Myynti asiakkaalle');
assert.equal(workUse.party_name, 'Sinikalliontie 3');
assert.equal(workUse.notes, 'Sinikalliontie 3 – Kylmiöt lämpönee');

const purchase = movementToPeriodReportRow({
  movement_type: 'purchase',
  qty_kg: 10,
  refrigerant_type: 'R-404A',
  serial_number: 'V055171',
  location: null,
  ownership_type: 'rental',
  work_report_id: null,
  notes: 'Varastoon',
  created_at: '2026-06-08T07:27:07.000Z',
  customer: null,
  work_report: null,
  cylinder: { rental_supplier: 'darment', stock_source: 'purchase', ownership_type: 'rental' },
});

assert.ok(purchase);
assert.equal(purchase.party_name, 'Vuokra: Darment');

const purchaseOnRetrievedBottle = movementToPeriodReportRow({
  movement_type: 'purchase',
  qty_kg: 15,
  refrigerant_type: 'R-410A',
  serial_number: null,
  location: null,
  ownership_type: 'owned',
  work_report_id: null,
  notes: 'Varastoon',
  created_at: '2026-05-28T20:57:39.000Z',
  customer: null,
  work_report: null,
  cylinder: { rental_supplier: null, stock_source: 'customer_retrieved', ownership_type: 'owned' },
});

assert.ok(purchaseOnRetrievedBottle);
assert.equal(purchaseOnRetrievedBottle.typeLabel, 'Osto / varastoon');
assert.equal(purchaseOnRetrievedBottle.party_name, 'Ostettu varastoon');
assert.notEqual(purchaseOnRetrievedBottle.party_name, 'Asiakkaalta talteen');

const retrieve = movementToPeriodReportRow({
  movement_type: 'customer_retrieve',
  qty_kg: 10,
  refrigerant_type: 'R-410A',
  serial_number: null,
  location: null,
  ownership_type: 'owned',
  work_report_id: null,
  notes: null,
  created_at: '2026-05-28T18:09:22.000Z',
  customer: { name: 'Cityvarasto Hyrylä' },
  work_report: null,
  cylinder: null,
});

assert.ok(retrieve);
assert.equal(retrieve.typeLabel, 'Asiakkaalta talteen');
assert.equal(retrieve.party_name, 'Cityvarasto Hyrylä');
assert.equal(retrieve.notes, '');

const supplierSale = supplierLineToPeriodReportRow({
  source: 'supplier',
  supplier_name: 'Onninen',
  supplier_paid_by: 'own',
  bill_to_customer: true,
  warehouse_company_id: null,
  refrigerant_type: 'R-410A',
  qty_kg: 27,
  created_at: '2026-08-01T10:00:00.000Z',
  cylinder: null,
  daily_log: { log_date: '2026-08-01' },
  work_report: {
    owner_company_id: 'company-a',
    customers: { name: 'Testi Oy' },
  },
});

assert.ok(supplierSale);
assert.equal(supplierSale.typeLabel, 'Myynti asiakkaalle (tukkurin kautta)');
assert.equal(supplierSale.party_name, 'Testi Oy');
assert.match(supplierSale.notes, /ei varastoliikettä/);

const rows = mergePeriodReportRows(
  [
    {
      movement_type: 'purchase',
      qty_kg: 10,
      refrigerant_type: 'R-404A',
      serial_number: 'V055171',
      location: null,
      ownership_type: 'rental',
      work_report_id: null,
      notes: 'Varastoon',
      created_at: '2026-06-08T07:27:07.000Z',
      customer: null,
      work_report: null,
      cylinder: { rental_supplier: 'darment', stock_source: 'purchase', ownership_type: 'rental' },
    },
    {
      movement_type: 'customer_retrieve',
      qty_kg: 10,
      refrigerant_type: 'R-410A',
      serial_number: null,
      location: null,
      ownership_type: 'owned',
      work_report_id: null,
      notes: null,
      created_at: '2026-05-28T18:09:22.000Z',
      customer: { name: 'Cityvarasto Hyrylä' },
      work_report: null,
      cylinder: null,
    },
    {
      movement_type: 'work_use',
      qty_kg: 5,
      refrigerant_type: 'R-404A',
      serial_number: 'V055171',
      location: null,
      ownership_type: 'rental',
      work_report_id: 'wr-2',
      notes: null,
      created_at: '2026-06-11T14:07:27.000Z',
      customer: null,
      work_report: {
        title: 'Helsingin Meijeriliike',
        customers: { name: 'Helsingin Meijeriliike' },
      },
      cylinder: { rental_supplier: 'darment', stock_source: 'purchase', ownership_type: 'rental' },
    },
    {
      movement_type: 'work_use',
      qty_kg: 2,
      refrigerant_type: 'R-404A',
      serial_number: 'V055171',
      location: null,
      ownership_type: 'rental',
      work_report_id: 'wr-1',
      notes: null,
      created_at: '2026-08-28T10:03:52.000Z',
      customer: null,
      work_report: {
        title: 'Sinikalliontie 3 – Kylmiöt lämpönee',
        customers: { name: 'Sinikalliontie 3' },
      },
      cylinder: { rental_supplier: 'darment', stock_source: 'purchase', ownership_type: 'rental' },
    },
  ],
  [
    {
      source: 'supplier',
      supplier_name: 'Onninen',
      supplier_paid_by: 'own',
      bill_to_customer: true,
      warehouse_company_id: null,
      refrigerant_type: 'R-410A',
      qty_kg: 27,
      created_at: '2026-08-01T10:00:00.000Z',
      cylinder: null,
      daily_log: { log_date: '2026-08-01' },
      work_report: {
        owner_company_id: 'company-a',
        customers: { name: 'Testi Oy' },
      },
    },
  ],
);

const summary = summarizePeriodReportRows(rows);
assert.equal(summary.purchased_kg, 10);
assert.equal(summary.customer_retrieved_kg, 10);
assert.equal(summary.sold_kg, 34);
assert.equal(rows.filter((row) => row.typeLabel.startsWith('Myynti asiakkaalle')).length, 3);

const html = buildRefrigerantPeriodReportHtml({
  companyName: 'Lämpökatsastus Oy',
  fromLabel: '1.8.2026',
  toLabel: '29.8.2026',
  summary,
  rows,
  stock: [
    {
      serial_number: 'V055171',
      refrigerant_type: 'R-404A',
      remaining_kg: 3,
      capacity_kg: 10,
      ownership: 'Vuokra',
      status_label: 'Varastossa',
    },
  ],
});

assert.match(html, /Myynti asiakkaalle/);
assert.match(html, /Sinikalliontie 3/);
assert.match(html, /Varastosaldo/);
assert.match(html, /V055171/);
assert.doesNotMatch(html, /Käyttö työkohteella/);

console.log('test-refrigerant-inventory-report: ok');
