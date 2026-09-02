import assert from 'node:assert/strict';
import {
  calculateWorkReportCustomerBillableQuotePlusExtras,
  customerUsesQuotePlusExtras,
  parseBillingQuoteSettings,
} from '../src/lib/workReportBillingQuote.ts';
import {
  calculateWorkReportCustomerQuoteExtras,
  shouldCalculateCustomerQuoteExtras,
} from '../src/lib/workReportCustomerBilling.ts';

const quoteSettings = parseBillingQuoteSettings({
  quote_request_id: 'q-1',
  quote_title: 'Testitarjous',
  customer_invoice_total: 5000,
  quote_sale_net: 4000,
  customer_mode: 'quote_plus_extras',
  extra_customer_lines: [
    { id: 'manual-1', description: 'Lisäasennus', qty: 1, unit_price: 250, amount: 250 },
  ],
});

assert.equal(customerUsesQuotePlusExtras(quoteSettings), true);

const logs = [
  {
    id: 'log-1',
    work_report_id: 'wr-1',
    log_date: '2026-08-01',
    entry_type: 'regular',
    hours_regular: 2,
    hours_overtime: 0,
    hours_on_call: 0,
    fixed_price_amount: null,
    customer_extra_beyond_quote: true,
    customer_hourly_rate_override: 80,
    commission_amount: 0,
    commission_note: null,
    work_done: 'Lisätyö',
    created_by: 'user-1',
    created_at: '2026-08-01T10:00:00Z',
    author: { display_name: 'Matti' },
    expense_lines: [
      {
        id: 'exp-1',
        expense_type: 'part',
        description: 'Lisäosa',
        qty: 1,
        unit_price: 50,
        customer_unit_price: 100,
        bill_to_partner: false,
        bill_to_customer: true,
      },
    ],
  },
];

assert.equal(shouldCalculateCustomerQuoteExtras(logs, quoteSettings.extra_customer_lines), true);

const extrasOnly = calculateWorkReportCustomerQuoteExtras({
  logs,
  rates: { hourly_regular: 70, hourly_overtime: 90, hourly_on_call: 100 },
  ratesSource: 'company_default',
  customerName: 'Asiakas Oy',
  manualLines: quoteSettings.extra_customer_lines,
});

assert.equal(extrasOnly.grandTotal, 510); // 2h * 80 + 100 expense + 250 manual

const merged = calculateWorkReportCustomerBillableQuotePlusExtras({
  settings: quoteSettings,
  logs,
  rates: { hourly_regular: 70, hourly_overtime: 90, hourly_on_call: 100 },
  ratesSource: 'company_default',
  customerName: 'Asiakas Oy',
});

assert.ok(merged);
assert.equal(merged.billingMode, 'quote_plus_extras');
assert.equal(merged.grandTotal, 5510);
assert.equal(merged.quoteExtrasTotal, 510);
assert.equal(merged.byUser.length, 3); // quote + user + manual

console.log('test-quote-plus-extras-billing: ok');
