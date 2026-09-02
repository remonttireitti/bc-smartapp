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
  extra_customer_work: [
    {
      id: 'work-1',
      work_date: '2026-09-01',
      description: 'Väliaikainen syöttö asennettu',
      hours: 2,
      hourly_rate: 80,
      expense_lines: [
        {
          id: 'exp-1',
          description: 'Onninen lasku',
          qty: 1,
          customer_unit_price: 250,
          purchase_unit_price: 133,
        },
      ],
    },
  ],
});

assert.equal(customerUsesQuotePlusExtras(quoteSettings), true);
assert.equal(shouldCalculateCustomerQuoteExtras(quoteSettings.extra_customer_work), true);

const extrasOnly = calculateWorkReportCustomerQuoteExtras({
  works: quoteSettings.extra_customer_work ?? [],
  rates: { hourly_regular: 70, hourly_overtime: 90, hourly_on_call: 100 },
  ratesSource: 'company_default',
  customerName: 'Asiakas Oy',
});

assert.equal(extrasOnly.grandTotal, 410); // 2h * 80 + 250 expense

const merged = calculateWorkReportCustomerBillableQuotePlusExtras({
  settings: quoteSettings,
  rates: { hourly_regular: 70, hourly_overtime: 90, hourly_on_call: 100 },
  ratesSource: 'company_default',
  customerName: 'Asiakas Oy',
});

assert.ok(merged);
assert.equal(merged.billingMode, 'quote_plus_extras');
assert.equal(merged.grandTotal, 5410);
assert.equal(merged.quoteExtrasTotal, 410);
assert.equal(merged.byUser.length, 2); // quote + extras bucket

console.log('test-quote-plus-extras-billing: ok');
