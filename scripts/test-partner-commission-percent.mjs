import assert from 'node:assert/strict';
import {
  computePartnerNetMargin,
  DEFAULT_PARTNER_COMMISSION_PERCENT,
  formatUrakkaOutcomeSummary,
  resolvePartnerCommissionPercent,
} from '../src/lib/workReportBillingQuote.ts';
import {
  calculateWorkReportBillable,
  mergeAutoPartnerCommission,
  stripAutoPartnerCommission,
} from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';

assert.equal(DEFAULT_PARTNER_COMMISSION_PERCENT, 50);

assert.equal(resolvePartnerCommissionPercent(null), 50);
assert.equal(resolvePartnerCommissionPercent(undefined), 50);
assert.equal(resolvePartnerCommissionPercent({}), 50);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: null }), 50);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: undefined }), 50);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: 0 }), 0);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: 25 }), 25);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: 100 }), 100);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: -5 }), 0);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: 150 }), 100);
assert.equal(resolvePartnerCommissionPercent({ partner_commission_percent: Number.NaN }), 50);

const positive = computePartnerNetMargin(
  {
    quote_sale_net: 10000,
    quote_purchase_net: 4000,
    actual_purchase_net: 4000,
    partner_commission_percent: null,
  },
  2000,
  {
    partnerCalculation: {
      version: 5,
      billToCompanyId: null,
      billToCompanyName: 'K',
      ratesUsed: { hourly_regular: 50, hourly_overtime: 0, hourly_on_call: 0 },
      ratesSource: 'partnership',
      byUser: [
        {
          userId: 'u1',
          userName: 'A',
          billHoursEnabled: true,
          billExpensesEnabled: true,
          effectiveBillHoursEnabled: true,
          effectiveBillExpensesEnabled: true,
          hoursQty: 40,
          hoursTotal: 2000,
          expensesTotal: 0,
          fixedTotal: 0,
          commissionTotal: 0,
          subtotal: 2000,
          excludedSubtotal: 0,
          lines: [
            {
              logId: 'l1',
              logDate: '2024-01-01',
              kind: 'hours_regular',
              description: 'Työ',
              qty: 40,
              unitPrice: 50,
              total: 2000,
              included: true,
            },
          ],
        },
      ],
      grandTotal: 2000,
      excludedTotal: 0,
    },
  },
);
assert.ok(positive);
// 10000 - 2000 labor - 4000 materials = 4000 gross; 50% → 2000 commission; net 2000
assert.equal(positive.grossMarginNet, 4000);
assert.equal(positive.commissionPercent, 50);
assert.equal(positive.commissionNet, 2000);
assert.equal(positive.netMarginNet, 2000);

const zeroCommissionClean = computePartnerNetMargin(
  {
    quote_sale_net: 10000,
    quote_purchase_net: 4000,
    actual_purchase_net: 4000,
    partner_commission_percent: 0,
  },
  2000,
);
assert.ok(zeroCommissionClean);
assert.equal(zeroCommissionClean.grossMarginNet, 4000);
assert.equal(zeroCommissionClean.commissionPercent, 0);
assert.equal(zeroCommissionClean.commissionNet, 0);
assert.equal(zeroCommissionClean.netMarginNet, 4000);

const negative = computePartnerNetMargin(
  {
    quote_sale_net: 1000,
    quote_purchase_net: 800,
    actual_purchase_net: 800,
  },
  500,
);
assert.ok(negative);
assert.equal(negative.grossMarginNet, -300);
assert.equal(negative.commissionNet, 0);
assert.equal(negative.netMarginNet, -300);

const summaryOver = formatUrakkaOutcomeSummary({
  varianceNet: 120,
  quoteTotalNet: 1000,
  actualTotalNet: 1120,
  formatMoney: (v) => `${v.toFixed(2)} €`,
});
assert.match(summaryOver, /ylittivät/);
assert.match(summaryOver, /120\.00 €/);

const summaryUnder = formatUrakkaOutcomeSummary({
  varianceNet: -50,
  quoteTotalNet: 1000,
  actualTotalNet: 950,
  formatMoney: (v) => `${v} €`,
});
assert.match(summaryUnder, /alittivat/);

const summaryFlat = formatUrakkaOutcomeSummary({
  varianceNet: 0,
  quoteTotalNet: 1000,
  actualTotalNet: 1000,
});
assert.match(summaryFlat, /budjetissa/);

const baseCalc = calculateWorkReportBillable({
  logs: [
    {
      id: 'log-1',
      log_date: '2026-09-17',
      entry_type: 'regular',
      hours_regular: 2,
      created_by: 'u1',
    },
  ],
  users: [{ id: 'u1', display_name: 'Testi', bill_hours_enabled: true, bill_expenses_enabled: true }],
  rates: { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 },
  ratesSource: 'partnership',
  billToCompanyId: 'owner',
  billToCompanyName: 'Owner Oy',
});
assert.equal(baseCalc.grandTotal, 100);
assert.equal(baseCalc.byUser[0].commissionTotal, 0);

const withAuto = mergeAutoPartnerCommission(baseCalc, {
  amount: 200,
  percent: 50,
  logs: [
    {
      id: 'log-1',
      log_date: '2026-09-17',
      entry_type: 'regular',
      hours_regular: 2,
      created_by: 'u1',
    },
  ],
});
assert.equal(withAuto.byUser[0].commissionTotal, 200);
assert.equal(withAuto.grandTotal, 300);
assert.ok(
  withAuto.byUser[0].lines.some((line) => line.logId === 'auto-partner-commission'),
);

// Idempotent merge (replace, no double-count)
const withAutoTwice = mergeAutoPartnerCommission(withAuto, {
  amount: 200,
  percent: 50,
});
assert.equal(withAutoTwice.grandTotal, 300);
assert.equal(
  withAutoTwice.byUser[0].lines.filter((line) => line.logId === 'auto-partner-commission').length,
  1,
);

// Daily commission present → strip auto, no double-count
const withDailyCommission = mergeAutoPartnerCommission(baseCalc, {
  amount: 200,
  percent: 50,
  logs: [
    {
      id: 'log-1',
      log_date: '2026-09-17',
      entry_type: 'regular',
      hours_regular: 2,
      created_by: 'u1',
      commission_amount: 150,
      commission_note: 'Käsin merkitty',
    },
  ],
});
assert.equal(withDailyCommission.grandTotal, baseCalc.grandTotal);
assert.equal(
  withDailyCommission.byUser.some((u) =>
    u.lines.some((line) => line.logId === 'auto-partner-commission'),
  ),
  false,
);

const stripped = stripAutoPartnerCommission(withAuto);
assert.equal(stripped.grandTotal, 100);
assert.equal(stripped.byUser[0].commissionTotal, 0);

// Customer calc still excludes commission (auto or daily)
const logsWithCommission = [
  {
    id: 'log-1',
    log_date: '2026-09-17',
    entry_type: 'regular',
    hours_regular: 2,
    created_by: 'u1',
    commission_amount: 202.34,
    commission_note: 'provisio',
  },
];
const customerCalc = calculateWorkReportCustomerBillable({
  logs: logsWithCommission,
  rates: { hourly_regular: 65, hourly_overtime: 85, hourly_on_call: 110 },
  ratesSource: 'company',
  customerName: 'Asiakas Oy',
});
assert.equal(customerCalc.byUser[0]?.commissionTotal ?? 0, 0);
assert.equal(
  customerCalc.byUser.flatMap((user) => user.lines).some((line) => line.kind === 'commission'),
  false,
);

console.log('test-partner-commission-percent: ok');
