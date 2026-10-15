import assert from 'node:assert/strict';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';
import {
  parseDailyLogPartnerBilling,
  serializeDailyLogPartnerBilling,
  commissionOnlyAuthors,
} from '../src/lib/commissionBillingMode.ts';

function log(overrides) {
  return {
    id: 'log-1',
    log_date: '2026-10-01',
    entry_type: 'regular',
    hours_regular: 6,
    hours_overtime: 0,
    hours_on_call: 0,
    fixed_price_amount: 0,
    customer_fixed_price_amount: 0,
    partner_urakka_margin_percent: null,
    hourly_rate_override: null,
    customer_hourly_rate_override: null,
    commission_amount: 300,
    commission_note: 'Myyntiprovisio',
    work_done: 'Asennus',
    created_by: 'u1',
    created_at: '2026-10-01T08:00:00Z',
    author_name_snapshot: 'Enn',
    author_deleted: false,
    expense_lines: [
      { id: 'e1', daily_log_id: 'log-1', expense_type: 'parking', description: 'Pysäköinti', qty: 1, unit_price: 20, bill_to_partner: true, bill_to_customer: true, customer_unit_price: 20, sort_order: 0 },
      { id: 'e2', daily_log_id: 'log-1', expense_type: 'other', description: 'Lautta', qty: 1, unit_price: 30, bill_to_partner: true, bill_to_customer: true, customer_unit_price: 30, sort_order: 1 },
    ],
    trip_legs: [],
    refrigerant_lines: [],
    ...overrides,
  };
}

const base = {
  users: [{ id: 'u1', display_name: 'Enn', bill_hours_enabled: true, bill_expenses_enabled: true }],
  rates: { hourly_regular: 50, hourly_overtime: 0, hourly_on_call: 0 },
  ratesSource: 'company_default',
  billToCompanyId: 'owner',
  billToCompanyName: 'Owner',
};
const calc = (logs) => calculateWorkReportBillable({ ...base, logs });

// Legacy / default (partner_billing null) = mode B, all rows billed: 6h*50 + 20 + 30 + 300.
const legacy = calc([log({})]);
assert.equal(legacy.grandTotal, 650);
assert.equal(legacy.excludedTotal, 0);
assert.equal(calc([log({ partner_billing: null })]).grandTotal, 650);
assert.equal(calc([log({ partner_billing: { commission_mode: 'commission_plus' } })]).grandTotal, 650);

// Mode A: only commission.
const onlyA = calc([log({ partner_billing: { commission_mode: 'commission_only' } })]);
assert.equal(onlyA.grandTotal, 300);
assert.equal(onlyA.excludedTotal, 350);
const linesA = onlyA.byUser[0].lines;
assert.ok(linesA.filter((l) => l.kind !== 'commission').every((l) => !l.included && l.notBilledReason === 'commission_only'));
assert.ok(linesA.find((l) => l.kind === 'commission').included);

// Mode A covers the same author's other logs in the report, not other authors.
const multi = calc([
  log({ partner_billing: { commission_mode: 'commission_only' }, expense_lines: [] }),
  log({ id: 'log-2', commission_amount: 0, commission_note: null, hours_regular: 4, expense_lines: [] }),
]);
assert.equal(multi.grandTotal, 300);

// Mode B with toggles: hours off, one expense off.
const toggled = calc([
  log({
    partner_billing: { hours_billed: false },
    expense_lines: [
      { ...log({}).expense_lines[0], partner_billed: false },
      log({}).expense_lines[1],
    ],
  }),
]);
assert.equal(toggled.grandTotal, 330);
assert.equal(toggled.excludedTotal, 320);
assert.equal(toggled.byUser[0].lines.find((l) => l.description === 'Pysäköinti').notBilledReason, 'toggle');

// bill_to_partner=false (kuuluu urakkaan) is not tagged as a commission-mode exclusion.
const urakka = calc([log({ expense_lines: [{ ...log({}).expense_lines[0], bill_to_partner: false }] })]);
assert.equal(urakka.byUser[0].lines.find((l) => l.kind === 'expense').notBilledReason, undefined);

// Customer billing is NOT affected by commission mode or partner toggles.
const cust = (logs) =>
  calculateWorkReportCustomerBillable({ logs, rates: { hourly_regular: 60, hourly_overtime: 0, hourly_on_call: 0 }, ratesSource: 'company_default', customerName: 'C' });
assert.equal(cust([log({})]).grandTotal, 410);
assert.equal(cust([log({ partner_billing: { commission_mode: 'commission_only' } })]).grandTotal, 410);
assert.equal(cust([log({ partner_billing: { hours_billed: false } })]).grandTotal, 410);
assert.equal(
  cust([log({ partner_billing: { hours_billed: false, trips_billed: false }, expense_lines: log({}).expense_lines.map((e) => ({ ...e, partner_billed: false })) })]).grandTotal,
  410,
);

// Serialization keeps DB null for defaults.
assert.equal(serializeDailyLogPartnerBilling({ commission_mode: 'commission_plus', hours_billed: true, trips_billed: true }), null);
assert.deepEqual(serializeDailyLogPartnerBilling({ commission_mode: 'commission_only' }), { commission_mode: 'commission_only' });
assert.deepEqual(parseDailyLogPartnerBilling('{"hours_billed":false}'), { hours_billed: false });
assert.deepEqual(parseDailyLogPartnerBilling(null), {});
// Mode A without commission amount has no effect.
assert.equal(commissionOnlyAuthors([{ created_by: 'u1', commission_amount: 0, partner_billing: { commission_mode: 'commission_only' } }]).size, 0);

console.log('test-commission-billing-mode: ok');
