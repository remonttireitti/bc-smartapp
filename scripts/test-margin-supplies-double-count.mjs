/**
 * Regressio: päiväkirjan tarvikkeet (245 €) vähennettiin katteesta kahdesti —
 * kerran "Tarvikkeet"-hankintarivinä (group:diary-supplies) ja uudelleen
 * piilossa "katetta syövinä kuluina" (marginEatingExpenseNet) tai
 * kumppanin piikkiostoina (partnerPiikkiPurchaseNet).
 *
 * Skenaario (oikea raportti): tarjous 3982,40 · työ 400 · kulut 40,30 ·
 * laite 1260 · tarvikkeet 245 → kate ennen provisiota 2037,10,
 * provisio 50 % 1018,55, puhdas kate 1018,55, kumppanille 1458,85.
 */
import assert from 'node:assert/strict';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { computePartnerNetMargin } from '../src/lib/workReportBillingQuote.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import { applyQuoteCommissionToPartnerCalculation } from '../src/lib/workReportPartnerTotal.ts';

/** refreshAndPersistPartnerBillable-polku: partner_total = calculation.grandTotal. */
function computePartnerTotalWithQuoteCommission({ billingQuote, logs, calculation }) {
  const applied = applyQuoteCommissionToPartnerCalculation({ billingQuote, logs, calculation });
  return { partnerTotal: applied.calculation.grandTotal, partnerMargin: applied.partnerMargin };
}

const quoteData = {
  ...createEmptyQuoteRequestData('huolto'),
  installationSupplies: [
    {
      id: 'dev-1',
      name: 'Ilmalämpöpumppu',
      quantity: 1,
      purchasePrice: 1260,
      marginPercent: 30,
      sellPrice: 1800,
      rowKind: 'device',
    },
    {
      id: 'sup-1',
      name: 'Asennustarvikkeet',
      quantity: 1,
      purchasePrice: 300,
      marginPercent: 30,
      sellPrice: 428.57,
      rowKind: 'supply',
    },
  ],
};

/** Tallennettu billing_quote (kuten billingQuoteFromQuoteRow tallentaa). */
const savedBillingQuote = {
  quote_request_id: 'q-1',
  quote_title: 'ILP asennus',
  quote_sale_net: 3982.4,
  customer_invoice_total: 3982.4,
  customer_mode: 'quote_fixed',
  quote_vat_rate: 0,
  partner_commission_percent: 50,
  purchase_lines: [
    {
      id: 'device:dev-1',
      label: 'Ilmalämpöpumppu',
      source: 'device',
      quote_purchase_net: 1260,
      actual_purchase_net: 1260,
    },
    {
      id: 'supply:sup-1',
      label: 'Asennustarvikkeet',
      source: 'supply',
      quote_purchase_net: 300,
      actual_purchase_net: 300,
    },
  ],
};

const baseLog = {
  id: 'log-1',
  log_date: '2026-09-20',
  entry_type: 'regular',
  hours_regular: 8,
  created_by: 'u1',
};

const partnerExpense = {
  id: 'exp-kulut',
  expense_type: 'other',
  description: 'Pysäköinti ja lautta',
  qty: 1,
  unit_price: 40.3,
  bill_to_partner: true,
  bill_to_customer: true,
};

/** Sovelluksen tyypilliset tarvikemuodot päiväkirjassa. */
const supplyShapes = {
  // "Kuuluu urakkaan · suora kulu" (bill_to_partner=false, bill_to_customer=false)
  included_in_contract: {
    expense_lines: [
      partnerExpense,
      {
        id: 'exp-tarvike',
        expense_type: 'supplies',
        description: 'Asennustarvikkeet',
        qty: 1,
        unit_price: 245,
        bill_to_partner: false,
        bill_to_customer: false,
      },
    ],
  },
  // "Kumppanin tilillä hankittu", lisälaskutettava mutta ei laskutuslupaa
  customer_only_no_permission: {
    expense_lines: [
      partnerExpense,
      {
        id: 'exp-tarvike',
        expense_type: 'supplies',
        description: 'Asennustarvikkeet',
        qty: 1,
        unit_price: 245,
        customer_unit_price: 318.5,
        bill_to_partner: false,
        bill_to_customer: true,
        extra_billable: true,
        extra_billing_allowed: false,
      },
    ],
  },
  // Kumppanin piikkiosto (partner_purchase_lines)
  partner_purchase_line: {
    expense_lines: [partnerExpense],
    partner_purchase_lines: [
      { id: 'pp-1', description: 'Asennustarvikkeet', qty: 1, unit_price: 245 },
    ],
  },
};

const users = [
  { id: 'u1', display_name: 'Asentaja', bill_hours_enabled: true, bill_expenses_enabled: true },
];
const rates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };

function partnerCalcFor(logs) {
  return calculateWorkReportBillable({
    logs,
    users,
    rates,
    ratesSource: 'partnership',
    billToCompanyId: 'owner',
    billToCompanyName: 'Owner Oy',
  });
}

function assertRowsSumToGross(margin, label) {
  const rowsTotal = margin.deductionRows.reduce((sum, row) => sum + row.amount, 0);
  const expected = Math.round((margin.quoteSaleNet + margin.customerExtrasNet - rowsTotal) * 100) / 100;
  assert.equal(
    expected,
    margin.grossMarginNet,
    `${label}: näkyvät rivit eivät summaudu katteeseen (${JSON.stringify(margin.deductionRows)})`,
  );
}

function rowAmount(margin, key) {
  return margin.deductionRows.find((row) => row.key === key)?.amount ?? 0;
}

for (const [shape, extra] of Object.entries(supplyShapes)) {
  const logs = [{ ...baseLog, ...extra }];
  const partnerCalculation = partnerCalcFor(logs);
  assert.equal(partnerCalculation.grandTotal, 440.3, `${shape}: kumppanin kustannukset`);

  // Paneelin polku: tarjousdata ladattu
  const effective = mergeActualPurchaseFromWorkReportLogs(savedBillingQuote, logs, quoteData);
  const margin = computePartnerNetMargin(effective, partnerCalculation.grandTotal, {
    logs,
    partnerRates: partnerCalculation.ratesUsed,
    partnerCalculation,
  });
  assert.ok(margin, shape);
  assert.equal(rowAmount(margin, 'labor_expenses'), 440.3, `${shape}: työ ja kulut`);
  assert.equal(rowAmount(margin, 'device'), 1260, `${shape}: laite`);
  assert.equal(rowAmount(margin, 'supplies'), 245, `${shape}: tarvikkeet`);
  assert.equal(margin.marginEatingExpenseNet, 0, `${shape}: tarvike ei saa olla myös katetta syövä kulu`);
  assert.equal(margin.partnerPiikkiPurchaseNet, 0, `${shape}: piikkiosto ei saa vähentyä toiseen kertaan`);
  assert.equal(margin.grossMarginNet, 2037.1, `${shape}: kate ennen provisiota`);
  assert.equal(margin.commissionPercent, 50);
  assert.equal(margin.commissionNet, 1018.55, `${shape}: provisio`);
  assert.equal(margin.netMarginNet, 1018.55, `${shape}: puhdas kate`);
  assert.deepEqual(
    margin.deductionRows.map((row) => row.key),
    ['labor_expenses', 'device', 'supplies'],
    `${shape}: vain kolme vähennysriviä`,
  );
  assertRowsSumToGross(margin, shape);

  // refreshAndPersistPartnerBillable-polku (quoteData = null)
  const persisted = computePartnerTotalWithQuoteCommission({
    billingQuote: savedBillingQuote,
    logs,
    calculation: partnerCalculation,
  });
  assert.equal(persisted.partnerMargin.grossMarginNet, 2037.1, `${shape}: persist kate`);
  assert.equal(persisted.partnerMargin.commissionNet, 1018.55, `${shape}: persist provisio`);
  assert.equal(persisted.partnerTotal, 1458.85, `${shape}: kumppanille laskutettava`);
  assertRowsSumToGross(persisted.partnerMargin, `${shape} (persist)`);
}

// Aito katetta syövä kulu (ei tarvike-hankinnassa) näkyy omana rivinään kuvauksineen.
{
  const logs = [
    {
      ...baseLog,
      expense_lines: [
        ...supplyShapes.included_in_contract.expense_lines,
        {
          id: 'exp-km',
          expense_type: 'km',
          description: 'Ajomatkat (50 km)',
          qty: 50,
          unit_price: 0.5,
          bill_to_partner: false,
          bill_to_customer: false,
        },
      ],
    },
  ];
  const partnerCalculation = partnerCalcFor(logs);
  const effective = mergeActualPurchaseFromWorkReportLogs(savedBillingQuote, logs, quoteData);
  const margin = computePartnerNetMargin(effective, partnerCalculation.grandTotal, {
    logs,
    partnerRates: partnerCalculation.ratesUsed,
    partnerCalculation,
  });
  assert.equal(rowAmount(margin, 'supplies'), 245);
  assert.equal(margin.marginEatingExpenseNet, 25);
  const eatingRow = margin.deductionRows.find((row) => row.key === 'margin_eating');
  assert.ok(eatingRow, 'katetta syövä kulu näkyy omana rivinään');
  assert.deepEqual(eatingRow.details, [{ description: 'Ajomatkat (50 km)', total: 25 }]);
  assert.equal(margin.grossMarginNet, 2012.1);
  assertRowsSumToGross(margin, 'margin-eating');
}

// Manuaalinen Myyntiprovisio € päiväkirjassa: ei vähennetä katteesta kuluna,
// commissionNet = manuaalinen summa, eikä se tuplaannu partner_total:iin.
{
  const logs = [
    { ...baseLog, ...supplyShapes.included_in_contract, commission_amount: 500, commission_note: 'Myyntiprovisio' },
  ];
  const partnerCalculation = partnerCalcFor(logs);
  assert.equal(partnerCalculation.grandTotal, 940.3);
  const effective = mergeActualPurchaseFromWorkReportLogs(savedBillingQuote, logs, quoteData);
  const margin = computePartnerNetMargin(effective, partnerCalculation.grandTotal, {
    logs,
    partnerRates: partnerCalculation.ratesUsed,
    partnerCalculation,
  });
  assert.equal(rowAmount(margin, 'labor_expenses'), 440.3);
  assert.equal(margin.grossMarginNet, 2037.1);
  assert.equal(margin.commissionNet, 500);
  assert.equal(margin.netMarginNet, 1537.1);
  assertRowsSumToGross(margin, 'manual-commission');
  const persisted = computePartnerTotalWithQuoteCommission({
    billingQuote: savedBillingQuote,
    logs,
    calculation: partnerCalculation,
  });
  assert.equal(persisted.partnerTotal, 940.3);
}

// Ilman laskutustarjousta partner_total = laskelman loppusumma.
{
  const logs = [{ ...baseLog, ...supplyShapes.included_in_contract }];
  const partnerCalculation = partnerCalcFor(logs);
  const persisted = computePartnerTotalWithQuoteCommission({
    billingQuote: {},
    logs,
    calculation: partnerCalculation,
  });
  assert.equal(persisted.partnerTotal, 440.3);
  assert.equal(persisted.partnerMargin, null);
}

console.log('test-margin-supplies-double-count: ok');
