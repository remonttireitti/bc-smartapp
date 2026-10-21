import assert from 'node:assert/strict';
import { calculateWorkReportBillable, warrantyTotal } from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';
import { annotateExpensePriceConfirmed } from '../src/lib/dailyLogCustomerExtraBilling.ts';
import { refrigerantFlagsFromDrafts } from '../src/lib/refrigerantInventory.ts';
import { serializeDailyLogPartnerBilling } from '../src/lib/commissionBillingMode.ts';

const rates = { hourly_regular: 55, hourly_overtime: 82.5, hourly_on_call: 110 };
const user = { id: 'u1', display_name: 'Enn', bill_hours_enabled: true, bill_expenses_enabled: true };
const report = { owner_company_id: 'owner', created_by_company_id: 'enn' };
const partner = (logs) => calculateWorkReportBillable({ logs, users: [user], rates, ratesSource: 'partnership', billToCompanyId: 'owner', billToCompanyName: 'X', report, viewerCompanyId: 'enn' });
const customer = (logs) => calculateWorkReportCustomerBillable({ logs, rates, ratesSource: 'company', customerName: 'A' });
const draft = (o) => ({ key: 'k', source: 'partner_warehouse', cylinder_id: 'c1', warehouse_company_id: 'owner', owner_user_id: '', supplier_name: '', supplier_paid_by: '', unit_price: '', customer_unit_price: '150', refrigerant_type: 'R-32', qty_kg: '2', notes: '', cylinder_disposition: 'partial_in_stock', commission_percent: '10', ...o });
const mk = (d, lineOver = {}) => {
  const pb = serializeDailyLogPartnerBilling({ refrigerant_flags: refrigerantFlagsFromDrafts([d], { partnerOwnedReport: true }) });
  return annotateExpensePriceConfirmed([{ id: 'l1', work_report_id: 'r1', log_date: '2026-10-21', log_start_time: '08:00', entry_type: 'regular',
    hours_regular: 0, hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0, created_by: 'u1', created_at: '2026-10-21T08:00:00Z',
    fixed_price_amount: null, customer_fixed_price_amount: null, partner_urakka_margin_percent: null, commission_amount: 0, commission_note: null,
    work_done: 'Työ', partner_billing: pb, customer_extra_billing: {}, expense_lines: [], trip_legs: [], author: null,
    refrigerant_lines: [{ id: 'rf1', daily_log_id: 'l1', work_report_id: 'r1', source: 'partner_warehouse', cylinder_id: 'c1', warehouse_company_id: 'owner',
      owner_user_id: null, supplier_name: null, supplier_paid_by: null, unit_price: 0, customer_unit_price: d.customer_unit_price ? Number(d.customer_unit_price) : null,
      bill_to_customer: false, refrigerant_type: 'R-32', qty_kg: 2, notes: null, cylinder_disposition: 'partial_in_stock', created_by: 'u1', created_at: '2026-10-21T08:01:00Z', ...lineOver }] }]);
};
const out = {};
const a = mk(draft({}));
out.case1 = [partner(a).grandTotal, customer(a).grandTotal];
assert.deepEqual(out.case1, [30, 300]);
assert.equal(partner(a).byUser[0].lines[0].kind, 'commission');
const b = mk(draft({ customer_unit_price: '' }));
out.case2 = [partner(b).grandTotal, customer(b).grandTotal, customer(b).byUser.flatMap((u) => u.lines).length];
assert.deepEqual(out.case2, [0, 0, 0]);
const c = mk(draft({ warranty: true }));
out.case3 = [partner(c).grandTotal, customer(c).grandTotal, warrantyTotal(partner(c)), warrantyTotal(customer(c))];
assert.deepEqual(out.case3, [0, 0, 30, 300]);
// Vanha rivi ilman lippuja: välitysmyynti omistajalle kuten ennen (2 × 150 = 300).
const old = mk(draft({}), {});
old[0].partner_billing = null; delete old[0].refrigerant_lines[0].customer_sale; delete old[0].refrigerant_lines[0].commission_percent;
out.legacy = partner(old).grandTotal;
assert.equal(out.legacy, 300);
console.log('refrigerant ok', JSON.stringify(out));
