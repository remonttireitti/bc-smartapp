import assert from 'node:assert/strict';
import {
  calculateWorkReportBillable,
  mergePartnerExtraBillingFromDailyLogs,
} from '../src/lib/workReportBilling.ts';
import {
  calculateWorkReportCustomerBillableQuotePlusExtras,
  parseBillingQuoteSettings,
  shouldUseQuoteExtrasBilling,
} from '../src/lib/workReportBillingQuote.ts';
import {
  extraCustomerWorkFromDailyLogs,
  shouldCalculateCustomerQuoteExtrasFromLogs,
  computeQuoteExtrasMarginFromLogs,
  serializeDailyLogCustomerExtraBilling,
  dailyLogExtraBillingFromForm,
  emptyDailyLogExtraBillingForm,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';

const quoteSettings = parseBillingQuoteSettings({
  quote_request_id: 'q-1',
  quote_title: 'Testitarjous',
  customer_invoice_total: 5000,
  quote_sale_net: 4000,
  customer_mode: 'quote_fixed',
});

const logs = [
  {
    id: 'log-1',
    work_report_id: 'wr-1',
    log_date: '2026-09-01',
    entry_type: 'regular',
    hours_regular: 8,
    hours_overtime: 0,
    hours_on_call: 0,
    fixed_price_amount: null,
    commission_amount: 0,
    commission_note: null,
    work_done: 'Perustyö kalenteriin',
    created_by: 'user-1',
    created_at: '2026-09-01T10:00:00Z',
    author: { display_name: 'Matti' },
    customer_extra_billing: {
      hours: 2,
      hourly_rate: 80,
      description: 'Väliaikainen syöttö',
      expense_description: 'Onninen-lasku',
      expense_qty: 1,
      expense_customer_unit_price: 250,
      expense_purchase_unit_price: 133,
      expense_bill_to_partner: true,
    },
  },
];

assert.equal(shouldUseQuoteExtrasBilling(quoteSettings, logs), true);
assert.equal(shouldCalculateCustomerQuoteExtrasFromLogs(logs), true);

const works = extraCustomerWorkFromDailyLogs(logs);
assert.equal(works.length, 1);
assert.equal(works[0].hours, 2);
assert.equal(works[0].expense_lines?.length, 1);

const merged = calculateWorkReportCustomerBillableQuotePlusExtras({
  settings: quoteSettings,
  logs,
  rates: { hourly_regular: 70, hourly_overtime: 90, hourly_on_call: 100 },
  ratesSource: 'company_default',
  customerName: 'Asiakas Oy',
});

assert.ok(merged);
assert.equal(merged.grandTotal, 5410); // 5000 + 160 + 250
assert.equal(merged.quoteExtrasTotal, 410);

const users = [
  {
    id: 'user-1',
    display_name: 'Matti',
    bill_hours_enabled: true,
    bill_expenses_enabled: true,
  },
];
const partnerRates = { hourly_regular: 55, hourly_overtime: 75, hourly_on_call: 85 };
const basePartner = calculateWorkReportBillable({
  logs,
  users,
  rates: partnerRates,
  ratesSource: 'partnership',
  billToCompanyId: 'owner-1',
  billToCompanyName: 'Omistaja Oy',
});
const partnerMerged = mergePartnerExtraBillingFromDailyLogs(basePartner, {
  logs,
  rates: partnerRates,
  users,
});

const extraHoursLine = partnerMerged.byUser
  .flatMap((user) => user.lines)
  .find((line) => line.logId === 'log-1:extra-hours');
assert.ok(extraHoursLine);
assert.equal(extraHoursLine.total, 110); // 2 h × 55 €

const extraExpenseLine = partnerMerged.byUser
  .flatMap((user) => user.lines)
  .find((line) => line.logId === 'log-1:extra-expense');
assert.ok(extraExpenseLine);
assert.equal(extraExpenseLine.total, 133);

// Margin test: partner 50, customer 65 => +15 kate
const marginOnlyWork = computeQuoteExtrasMarginFromLogs(
  [
    {
      id: 'log-2',
      log_date: '2026-09-02',
      customer_extra_billing: {
        hours: 1,
        hourly_rate: 65,
        description: 'Testi',
      },
    },
  ],
  { hourly_regular: 50 },
);
assert.equal(marginOnlyWork.extrasMarginNet, 15);

// Tyhjä lisälaskutus tallennetaan {} eikä null (NOT NULL -sarake).
assert.deepEqual(
  serializeDailyLogCustomerExtraBilling(dailyLogExtraBillingFromForm(emptyDailyLogExtraBillingForm())),
  {},
);

console.log('test-quote-plus-extras-billing: ok');
