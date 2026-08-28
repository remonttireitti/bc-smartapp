import assert from 'node:assert/strict';
import { formatRefrigerantLineLabelForReport } from '../src/lib/refrigerantInventory.ts';
import {
  redactRefrigerantSupplierName,
  shouldHideRefrigerantSourceFromViewer,
} from '../src/lib/refrigerantVisibility.ts';

const report = {
  owner_company_id: 'owner-co',
  created_by_company_id: 'creator-co',
};

assert.equal(
  shouldHideRefrigerantSourceFromViewer({
    viewerCompanyId: 'owner-co',
    ownerCompanyId: 'owner-co',
    createdByCompanyId: 'creator-co',
  }),
  true,
);

assert.equal(redactRefrigerantSupplierName('Lämpökatsastus Oy', true), 'Tukkuri');
assert.equal(redactRefrigerantSupplierName('Lämpökatsastus Oy', false), 'Lämpökatsastus Oy');

const hidden = formatRefrigerantLineLabelForReport(
  {
    id: '1',
    daily_log_id: 'd1',
    work_report_id: 'w1',
    source: 'supplier',
    cylinder_id: null,
    warehouse_company_id: null,
    owner_user_id: null,
    supplier_name: 'Lämpökatsastus Oy',
    supplier_paid_by: 'own',
    unit_price: 10,
    customer_unit_price: null,
    bill_to_customer: true,
    refrigerant_type: 'R-410A',
    qty_kg: 2,
    notes: null,
    cylinder_disposition: null,
    created_by: null,
    created_at: '2026-01-01',
  },
  report,
  'owner-co',
);
assert.ok(hidden.includes('Tukkuri'));
assert.equal(hidden.includes('Lämpökatsastus'), false);

const visible = formatRefrigerantLineLabelForReport(
  {
    id: '1',
    daily_log_id: 'd1',
    work_report_id: 'w1',
    source: 'supplier',
    cylinder_id: null,
    warehouse_company_id: null,
    owner_user_id: null,
    supplier_name: 'Lämpökatsastus Oy',
    supplier_paid_by: 'own',
    unit_price: 10,
    customer_unit_price: null,
    bill_to_customer: true,
    refrigerant_type: 'R-410A',
    qty_kg: 2,
    notes: null,
    cylinder_disposition: null,
    created_by: null,
    created_at: '2026-01-01',
  },
  report,
  'creator-co',
);
assert.ok(visible.includes('Lämpökatsastus Oy'));

console.log('test-refrigerant-visibility: ok');
