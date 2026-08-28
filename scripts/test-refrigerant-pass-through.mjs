import assert from 'node:assert/strict';
import {
  isRefrigerantStockPassThrough,
  isPartnerOwnedWorkReport,
  refrigerantSaleToOwnerUnitPrice,
  shouldBillRefrigerantSaleToReportOwner,
} from '../src/lib/refrigerantPassThrough.ts';
import { formatRefrigerantLineLabelForReport } from '../src/lib/refrigerantInventory.ts';

const report = {
  owner_company_id: 'owner',
  created_by_company_id: 'creator',
};

assert.equal(isPartnerOwnedWorkReport(report), true);
assert.equal(
  isRefrigerantStockPassThrough({ source: 'partner_warehouse', qty_kg: 2 }, report),
  true,
);
assert.equal(shouldBillRefrigerantSaleToReportOwner({ source: 'partner_warehouse', qty_kg: 2 }, report), true);
assert.equal(refrigerantSaleToOwnerUnitPrice({ unit_price: 10, customer_unit_price: 25 }), 25);

const ownerLabel = formatRefrigerantLineLabelForReport(
  {
    id: '1',
    daily_log_id: 'd',
    work_report_id: 'w',
    source: 'partner_warehouse',
    cylinder_id: 'c',
    warehouse_company_id: 'lk',
    owner_user_id: null,
    supplier_name: null,
    supplier_paid_by: null,
    unit_price: 12,
    customer_unit_price: 28,
    bill_to_customer: false,
    refrigerant_type: 'R-404A',
    qty_kg: 1.998,
    notes: null,
    cylinder_disposition: 'partial_in_stock',
    created_by: null,
    created_at: '2026-01-01',
    cylinder: { serial_number: 'V055171', bottle_size: 'medium', notes: null },
    warehouse_company: { name: 'Lämpökatsastus Oy' },
    owner_user: { display_name: 'Yhteinen varasto' },
  },
  report,
  'owner',
  'Enn Kotselainen',
);
assert.ok(ownerLabel.includes('Enn Kotselainen'));
assert.equal(ownerLabel.includes('Lämpökatsastus'), false);
assert.equal(ownerLabel.includes('V055171'), false);

console.log('test-refrigerant-pass-through: ok');
