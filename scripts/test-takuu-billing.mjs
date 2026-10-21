import assert from 'node:assert/strict';
import { calculateWorkReportBillable, warrantyTotal } from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';
import { annotateExpensePriceConfirmed } from '../src/lib/dailyLogCustomerExtraBilling.ts';
import { serializeDailyLogPartnerBilling, parseDailyLogPartnerBilling } from '../src/lib/commissionBillingMode.ts';
import { buildSupplyLineFlagsFromExpenseDrafts } from '../src/lib/workReportExpenseBilling.ts';

const rates = { hourly_regular: 55, hourly_overtime: 82.5, hourly_on_call: 110 };
const user = { id: 'u1', display_name: 'Enn', bill_hours_enabled: true, bill_expenses_enabled: true };
const partner = (logs) => calculateWorkReportBillable({ logs, users: [user], rates, ratesSource: 'partnership', billToCompanyId: 'c2', billToCompanyName: 'X' });
const customer = (logs) => calculateWorkReportCustomerBillable({ logs, rates, ratesSource: 'company', customerName: 'A' });
const mk = (pb, flags) => annotateExpensePriceConfirmed([{
  id: 'l1', work_report_id: 'r1', log_date: '2026-10-20', log_start_time: '08:00', entry_type: 'regular',
  hours_regular: 2, hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0, created_by: 'u1',
  created_at: '2026-10-20T08:00:00Z', fixed_price_amount: null, customer_fixed_price_amount: null,
  partner_urakka_margin_percent: null, commission_amount: 0, commission_note: null, work_done: 'Työ',
  partner_billing: pb, customer_extra_billing: flags ? { supply_line_flags: flags } : {},
  expense_lines: [
    { id: 'm1', description: 'Materiaali', expense_type: 'material', qty: 1, unit_price: 100 },
    { id: 'e1', description: 'Kulu', expense_type: 'other', qty: 1, unit_price: 30 },
  ], trip_legs: [], refrigerant_lines: [], author: null,
}]);

const base = mk(null, null);
assert.equal(partner(base).grandTotal, 240);
assert.equal(customer(base).grandTotal, 240);
assert.equal(warrantyTotal(partner(base)), 0);

const pb = serializeDailyLogPartnerBilling({ warranty: true });
assert.equal(parseDailyLogPartnerBilling(pb).warranty, true);
const hoursW = mk(pb, null);
assert.equal(partner(hoursW).grandTotal, 130);
assert.equal(customer(hoursW).grandTotal, 130);
assert.equal(warrantyTotal(partner(hoursW)), 110);

const flags = buildSupplyLineFlagsFromExpenseDrafts([
  { key: 'k1', description: 'Materiaali', qty: '1', unit_price: '100', expense_type: 'material', warranty: true, extra_billable: false, extra_billing_allowed: false },
  { key: 'k2', description: 'Kulu', qty: '1', unit_price: '30', expense_type: 'other', warranty: false, extra_billable: false, extra_billing_allowed: false },
]);
const matW = mk(null, flags);
assert.equal(matW[0].expense_lines[0].warranty, true);
assert.equal(partner(matW).grandTotal, 140);
assert.equal(customer(matW).grandTotal, 140);

const allW = mk(pb, [{ warranty: true }, { warranty: true }]);
const p = partner(allW), c = customer(allW);
assert.equal(p.grandTotal, 0);
assert.equal(c.grandTotal, 0);
assert.equal(warrantyTotal(p), 240);
assert.equal(warrantyTotal(c), 240);
assert.equal(p.byUser[0].lines.filter((l) => l.warranty).length, 3);
console.log('takuu ok', { before: [partner(base).grandTotal, customer(base).grandTotal], hoursW: 130, matW: 140, all: [p.grandTotal, c.grandTotal, warrantyTotal(p)] });

// Ajomatkat: 56 km × 0,9 € = 50,40 €; Takuu (partner_billing.trips_warranty) → 0 €.
const trip = (pb, withLine) => annotateExpensePriceConfirmed([{ ...base[0], hours_regular: 0, partner_billing: pb, customer_extra_billing: {},
  expense_lines: withLine ? [{ id: 'auto-trip-km', description: 'Ajomatkat (56 km)', expense_type: 'km', qty: 56, unit_price: 0.9, sort_order: 0 }] : [],
  trip_legs: [{ id: 't1', distance_km: 56 }] }]);
const tp = (logs) => calculateWorkReportBillable({ logs, users: [user], rates, ratesSource: 'partnership', billToCompanyId: 'c2', billToCompanyName: 'X', tripKmRate: 0.9 });
for (const withLine of [true, false]) {
  assert.equal(tp(trip(null, withLine)).grandTotal, 50.4, `trip ${withLine}`);
  const w = tp(trip({ trips_warranty: true }, withLine));
  assert.equal(w.grandTotal, 0);
  assert.equal(warrantyTotal(w), 50.4);
}
assert.equal(customer(trip(null, true)).grandTotal, 50.4);
assert.equal(customer(trip({ trips_warranty: true }, true)).grandTotal, 0);
assert.equal(warrantyTotal(customer(trip({ trips_warranty: true }, true))), 50.4);
assert.equal(parseDailyLogPartnerBilling(serializeDailyLogPartnerBilling({ trips_warranty: true })).trips_warranty, true);
console.log('trip takuu ok 50.4 -> 0');
