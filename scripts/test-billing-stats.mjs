import assert from 'node:assert/strict';
import {
  allocateToCategories,
  calculationCategoryTotals,
  collectBillingStatsEntries,
  percentShares,
  statsPeriodRange,
  summarizeBillingStats,
  trendMonths,
  withVat,
} from '../src/lib/billingStats.ts';

// Prosentit summautuvat tasan 100,0 %.
for (const vals of [[1, 1, 1], [33.33, 33.33, 33.34], [10, 0, 0], [0.01, 999.99], [5, 5, 5, 5, 5, 5, 5]]) {
  const p = percentShares(vals);
  assert.equal(Math.round(p.reduce((a, b) => a + b, 0) * 10), 1000, String(vals));
}
assert.deepEqual(percentShares([0, 0]), [0, 0]);
assert.deepEqual(percentShares([1, 1, 1]), [33.4, 33.3, 33.3]);

const line = (kind, total, extra = {}) => ({ logId: 'l', logDate: '2026-09-01', kind, description: 'x', qty: 1, unitPrice: total, total, included: true, ...extra });
const calc = (lines) => ({ version: 6, billToCompanyId: null, billToCompanyName: null, ratesUsed: {}, ratesSource: 'company', byUser: [{ lines }], grandTotal: 0, excludedTotal: 0 });
const c1 = calc([
  line('hours_regular', 100),
  line('expense', 30, { expenseType: 'material' }),
  line('expense', 20, { expenseType: 'parking' }),
  line('expense', 50, { expenseType: 'device' }),
  line('refrigerant', 10),
  line('commission', 5),
  line('expense', 99, { included: false }),
  line('refrigerant_purchase_deduction', 40),
]);
assert.deepEqual(calculationCategoryTotals(c1), { work: 100, fixed: 0, expenses: 20, supplies: 40, devices: 50, commission: 5 });
// Jako täsmää sentilleen.
const alloc = allocateToCategories(100.01, c1);
assert.equal(Math.round(Object.values(alloc).reduce((a, b) => a + b, 0) * 100), 10001);
assert.equal(allocateToCategories(50, null).work, 50);

// Kuukausirajat paikallisessa ajassa.
const now = new Date(2026, 9, 17, 12);
const prev = statsPeriodRange('prev_month', now);
assert.equal(prev.from.getTime(), new Date(2026, 8, 1).getTime());
assert.equal(prev.to.getTime(), new Date(2026, 9, 1).getTime());
assert.equal(statsPeriodRange('last_3', now).from.getMonth(), 7);
const custom = statsPeriodRange('custom', now, '2026-09-10', '2026-09-10');
assert.equal(custom.to.getTime(), new Date(2026, 8, 11).getTime());
assert.equal(statsPeriodRange('custom', now, '2026-09-10', '2026-09-01'), null);
assert.equal(trendMonths(prev).length, 6);
assert.equal(trendMonths(statsPeriodRange('this_year', now)).length, 12);
assert.equal(withVat(100), 125.5);

// Rivit: oma asiakas, lähtevä kumppanilasku (osittain laskutettu), saapuva kumppanilasku.
const ME = 'me';
const rows = [
  { id: 'r1', title: 'A', status: 'completed', completed_at: '2026-09-05T10:00:00Z', scheduled_start: null, created_at: '2026-09-01T00:00:00Z',
    owner_company_id: ME, created_by_company_id: ME, delegate_company_id: null, customer_id: 'c1', customers: { name: 'Asiakas Oy' },
    owner_company: { name: 'Me' }, delegate_company: null,
    billing: { partner_invoice_status: 'none', partner_invoice_amount: null, partner_billed_amount: null, partner_billed_at: null, customer_invoice_status: 'paid', customer_invoice_amount: 200, customer_billed_at: '2026-09-20T10:00:00Z' },
    billable: { partner_total: 0, customer_total: 200, customer_calculation: calc([line('hours_regular', 150), line('expense', 50, { expenseType: 'part' })]) } },
  { id: 'r2', title: 'B', status: 'completed', completed_at: '2026-09-07T10:00:00Z', scheduled_start: null, created_at: '2026-09-01T00:00:00Z',
    owner_company_id: 'p1', created_by_company_id: ME, delegate_company_id: null, customer_id: 'c2', customers: { name: 'Loppuasiakas' },
    owner_company: { name: 'Kumppani 1' }, delegate_company: null,
    billing: { partner_invoice_status: 'partial', partner_invoice_amount: 300, partner_billed_amount: 100, partner_billed_at: '2026-09-25T10:00:00Z', customer_invoice_status: 'none', customer_invoice_amount: null, customer_billed_at: null },
    billable: { partner_total: 300, calculation: c1 } },
  { id: 'r3', title: 'C', status: 'completed', completed_at: '2026-09-08T10:00:00Z', scheduled_start: null, created_at: '2026-09-01T00:00:00Z',
    owner_company_id: ME, created_by_company_id: 'p2', delegate_company_id: null, customer_id: 'c3', customers: { name: 'X' },
    owner_company: { name: 'Me' }, creator_company: { name: 'Kumppani 2' }, delegate_company: null,
    billing: { partner_invoice_status: 'paid', partner_invoice_amount: 80, partner_billed_amount: 80, partner_billed_at: '2026-09-09T10:00:00Z', customer_invoice_status: 'none', customer_invoice_amount: null, customer_billed_at: null },
    billable: { partner_total: 80, calculation: calc([line('hours_regular', 80)]) } },
];
const entries = collectBillingStatsEntries(rows, ME, 'total');
const s = summarizeBillingStats(entries, prev, 'billed');
assert.equal(s.billed, 300); // 200 asiakas + 100 kumppanille
assert.equal(s.open, 200);
assert.equal(s.incoming, 80);
assert.equal(s.basisTotal, 300);
assert.deepEqual(s.byCounterparty.map((r) => [r.name, r.amount, r.percent, !!r.isPartner]), [['Asiakas Oy', 200, 66.7, false], ['Kumppani 1', 100, 33.3, true]]);
assert.equal(Math.round(s.byCategory.reduce((a, r) => a + r.amount, 0) * 100), 30000);
assert.equal(Math.round(s.byCategory.reduce((a, r) => a + r.percent, 0) * 10), 1000);
const p1 = s.byPartner.find((p) => p.name === 'Kumppani 1');
const p2 = s.byPartner.find((p) => p.name === 'Kumppani 2');
assert.equal(p1.outAmount, 100);
assert.equal(p2.inAmount, 80);
const sep = s.months.find((m) => m.key === '2026-09');
assert.deepEqual([sep.billed, sep.open], [300, 200]);
const all = summarizeBillingStats(entries, prev, 'all');
assert.equal(all.basisTotal, 500);
// Ilman Kumppanuuksia (asiakastila) kumppanirivejä ei ole.
const cust = summarizeBillingStats(collectBillingStatsEntries(rows.filter((r) => r.owner_company_id === ME), ME, 'customer'), prev, 'billed');
assert.ok(cust.byPartner.length === 0 && cust.incoming === 0);
console.log('billing-stats: ok');
