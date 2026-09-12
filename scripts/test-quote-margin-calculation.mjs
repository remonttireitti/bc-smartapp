import assert from 'node:assert/strict';
import { computePartnerNetMargin } from '../src/lib/workReportBillingQuote.ts';
import {
  analyzeMarginEatingExpenses,
  effectiveQuoteMaterialCostNet,
  sumPartnerPurchaseCostNet,
} from '../src/lib/workReportQuoteMargin.ts';
import { breakdownPartnerBillingForQuoteMargin } from '../src/lib/workReportBilling.ts';

// Wärtsilä-tyyppinen: koneet purchase_linesissa, tarvikkeet kumppanilaskutuksessa
const wartilaMargin = computePartnerNetMargin(
  {
    quote_sale_net: 24550,
    quote_purchase_net: 22850,
    actual_purchase_net: 22850,
    purchase_lines: [
      {
        id: 'machines',
        label: 'Suorakoneet 3 kpl',
        quote_purchase_net: 22850,
        actual_purchase_net: 22850,
      },
    ],
  },
  3131.8,
  {
    partnerCalculation: {
      version: 5,
      billToCompanyId: null,
      billToCompanyName: 'Kumppani',
      ratesUsed: { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 },
      ratesSource: 'partnership',
      byUser: [
        {
          userId: 'u1',
          userName: 'Asentaja',
          billHoursEnabled: true,
          billExpensesEnabled: true,
          effectiveBillHoursEnabled: true,
          effectiveBillExpensesEnabled: true,
          hoursQty: 53,
          hoursTotal: 2650,
          expensesTotal: 481.8,
          fixedTotal: 0,
          commissionTotal: 0,
          subtotal: 3131.8,
          excludedSubtotal: 0,
          lines: [
            {
              logId: 'l1',
              logDate: '2024-08-10',
              kind: 'hours_regular',
              description: 'Työ',
              qty: 53,
              unitPrice: 50,
              total: 2650,
              included: true,
            },
            {
              logId: 'l1',
              logDate: '2024-09-11',
              kind: 'expense',
              description: 'Tarvikkeet',
              qty: 1,
              unitPrice: 481.8,
              total: 481.8,
              included: true,
            },
          ],
        },
      ],
      grandTotal: 3131.8,
      excludedTotal: 0,
    },
    logs: [
      {
        id: 'l1',
        log_date: '2024-09-11',
        expense_lines: [
          {
            description: 'Kaapelit',
            qty: 1,
            unit_price: 481.8,
            bill_to_partner: true,
            bill_to_customer: true,
          },
        ],
      },
    ],
    partnerRates: { hourly_regular: 50 },
  },
);

assert.equal(wartilaMargin.effectiveMaterialCostNet, 23331.8);
assert.equal(wartilaMargin.installationLaborTravelNet, 2650);
assert.equal(wartilaMargin.partnerBilledMaterialsNet, 481.8);
assert.equal(wartilaMargin.netMarginNet, -1431.8);

// Ei kaksinkertaista vähennystä (vanha bugi antoi ~-24281)
assert.ok(wartilaMargin.netMarginNet > -5000);

// Lisälaskutus hyväksytty: nostaa tuloa, kumppanikulu mukana laskennassa
const withExtras = computePartnerNetMargin(
  { quote_sale_net: 10000, quote_purchase_net: 5000, actual_purchase_net: 5000 },
  1000,
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
          hoursQty: 10,
          hoursTotal: 500,
          expensesTotal: 500,
          fixedTotal: 0,
          commissionTotal: 0,
          subtotal: 1000,
          excludedSubtotal: 0,
          lines: [
            {
              logId: 'l1',
              logDate: '2024-01-01',
              kind: 'hours_regular',
              description: 'Työ',
              qty: 10,
              unitPrice: 50,
              total: 500,
              included: true,
            },
            {
              logId: 'l1',
              logDate: '2024-01-01',
              kind: 'expense',
              description: 'Lisätarvike: Ruuvit',
              qty: 1,
              unitPrice: 500,
              total: 500,
              included: true,
            },
          ],
        },
      ],
      grandTotal: 1000,
      excludedTotal: 0,
    },
    logs: [
      {
        id: 'l1',
        log_date: '2024-01-01',
        customer_extra_billing: {
          expense_description: 'Ruuvit',
          expense_qty: 1,
          expense_customer_unit_price: 800,
          expense_purchase_unit_price: 500,
          expense_bill_to_partner: true,
        },
      },
    ],
    partnerRates: { hourly_regular: 50 },
  },
);
assert.equal(withExtras.customerExtrasNet, 800);
assert.equal(withExtras.netMarginNet, 4800);

// Katetta syövä kulu ilman lisälaskutuslupaa
const marginEating = analyzeMarginEatingExpenses([
  {
    id: 'l1',
    log_date: '2024-01-01',
    expense_lines: [
      {
        description: 'Piilotettu kulu',
        qty: 2,
        unit_price: 50,
        bill_to_partner: false,
        bill_to_customer: false,
      },
      {
        description: 'Ei lupaa',
        qty: 1,
        unit_price: 100,
        bill_to_partner: false,
        bill_to_customer: true,
        customer_unit_price: 150,
      },
    ],
  },
]);
assert.equal(marginEating.total, 100);

const marginEatingWithPurchase = analyzeMarginEatingExpenses([
  {
    id: 'l1',
    log_date: '2024-01-01',
    expense_lines: [
      {
        description: 'Piilotettu kulu',
        qty: 2,
        unit_price: 50,
        bill_to_partner: false,
        bill_to_customer: false,
      },
      {
        description: 'Piikkiostos',
        qty: 1,
        unit_price: 100,
        bill_to_partner: false,
        bill_to_customer: true,
      },
    ],
  },
]);
assert.equal(marginEatingWithPurchase.total, 100);

assert.equal(effectiveQuoteMaterialCostNet(22850, 481.8), 23331.8);
assert.equal(effectiveQuoteMaterialCostNet(22850, 23000), 23000);
assert.equal(effectiveQuoteMaterialCostNet(22850, 0), 22850);

assert.equal(
  sumPartnerPurchaseCostNet([
    {
      id: 'l1',
      log_date: '2024-01-01',
      partner_purchase_lines: [{ qty: 2, unit_price: 25 }],
    },
  ]),
  50,
);

const tripBreakdown = breakdownPartnerBillingForQuoteMargin({
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
      hoursQty: 0,
      hoursTotal: 0,
      expensesTotal: 35,
      fixedTotal: 0,
      commissionTotal: 0,
      subtotal: 35,
      excludedSubtotal: 0,
      lines: [
        {
          logId: 'l1',
          logDate: '2024-01-01',
          kind: 'expense',
          description: 'Ajomatkat (10 km)',
          qty: 10,
          unitPrice: 0.59,
          total: 5.9,
          included: true,
        },
      ],
    },
  ],
  grandTotal: 35,
  excludedTotal: 0,
});
assert.equal(tripBreakdown.laborTravel, 35);
assert.equal(tripBreakdown.billedMaterials, 0);

console.log('test-quote-margin-calculation: ok');
