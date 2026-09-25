/**
 * Kumppanilaskun automaattinen provisiorivi + provisio summana (€) tai %.
 * Esimerkkiraportti: tarjous 3982,40 · työ 400 · kulut 40,30 · laite 1260 ·
 * tarvikkeet 245 → kate ennen provisiota 2037,10.
 */
import assert from 'node:assert/strict';
import {
  calculateWorkReportBillable,
  stripAutoPartnerCommission,
} from '../src/lib/workReportBilling.ts';
import {
  computePartnerNetMargin,
  formatCommissionPercent,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  resolvePartnerCommissionAmount,
  billingQuoteFromQuoteRow,
} from '../src/lib/workReportBillingQuote.ts';
import { applyQuoteCommissionToPartnerCalculation } from '../src/lib/workReportPartnerTotal.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { resolvePartnerBillingAmounts } from '../src/lib/workReportBillingCopy.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';
import {
  computeProjectedNetMarginIfLineApproved,
  extraBillingCommissionContextFromMargin,
  extraBillingCommissionNote,
  formatExtraBillingMarginImpactCell,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';

const baseQuote = {
  quote_request_id: 'q-1',
  quote_title: 'ILP asennus',
  quote_sale_net: 3982.4,
  customer_invoice_total: 3982.4,
  customer_mode: 'quote_fixed',
  quote_vat_rate: 0,
  partner_commission_percent: 50,
  purchase_lines: [
    { id: 'device:dev-1', label: 'ILP', source: 'device', quote_purchase_net: 1260, actual_purchase_net: 1260 },
    { id: 'supply:sup-1', label: 'Tarvikkeet', source: 'supply', quote_purchase_net: 300, actual_purchase_net: 300 },
  ],
};

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-20',
    entry_type: 'regular',
    hours_regular: 8,
    created_by: 'u1',
    expense_lines: [
      { id: 'k', expense_type: 'other', description: 'Pysäköinti ja lautta', qty: 1, unit_price: 40.3, bill_to_partner: true, bill_to_customer: true },
      { id: 't', expense_type: 'supplies', description: 'Asennustarvikkeet', qty: 1, unit_price: 245, bill_to_partner: false, bill_to_customer: false },
    ],
  },
];
const users = [{ id: 'u1', display_name: 'Asentaja', bill_hours_enabled: true, bill_expenses_enabled: true }];
const rates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };

function partnerCalc(logRows) {
  return calculateWorkReportBillable({
    logs: logRows,
    users,
    rates,
    ratesSource: 'partnership',
    billToCompanyId: 'owner',
    billToCompanyName: 'Owner Oy',
  });
}

function commissionLines(calc) {
  return calc.byUser.flatMap((u) => u.lines).filter((l) => l.kind === 'commission');
}

const base = partnerCalc(logs);
assert.equal(base.grandTotal, 440.3);

// --- 1. Prosenttitila 50 %: automaattinen rivi 1018,55, grandTotal = partner_total 1458,85
{
  const { calculation, partnerMargin } = applyQuoteCommissionToPartnerCalculation({
    billingQuote: baseQuote,
    logs,
    calculation: base,
  });
  assert.equal(partnerMargin.grossMarginNet, 2037.1);
  assert.equal(partnerMargin.commissionSource, 'percent');
  assert.equal(partnerMargin.commissionNet, 1018.55);
  const lines = commissionLines(calculation);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].logId, 'auto-partner-commission');
  assert.equal(lines[0].total, 1018.55);
  assert.equal(lines[0].description, 'Provisio 50 % puhtaasta katteesta');
  assert.equal(lines[0].logDate, '2026-09-20');
  assert.equal(calculation.grandTotal, 1458.85);

  // Idempotentti: uudelleenlaskenta rivin kanssa ei tuplaa
  const again = applyQuoteCommissionToPartnerCalculation({ billingQuote: baseQuote, logs, calculation });
  assert.equal(commissionLines(again.calculation).length, 1);
  assert.equal(again.calculation.grandTotal, 1458.85);
  assert.equal(again.partnerMargin.grossMarginNet, 2037.1);
  assert.equal(stripAutoPartnerCommission(again.calculation).grandTotal, 440.3);

  // Kate-laskenta rivin sisältävällä laskelmalla (paneeli saa tämän) — provisio ei ole kulu
  const panelMargin = computePartnerNetMargin(
    mergeActualPurchaseFromWorkReportLogs(baseQuote, logs, null),
    calculation.grandTotal,
    { logs, partnerRates: calculation.ratesUsed, partnerCalculation: calculation },
  );
  assert.equal(panelMargin.grossMarginNet, 2037.1);
  assert.equal(panelMargin.commissionNet, 1018.55);

  // Laskutettu aiemmin 1336,35 → laskuttamatta 122,50
  const amounts = resolvePartnerBillingAmounts(calculation.grandTotal, 1336.35, 'paid');
  assert.equal(amounts.open, 122.5);
  assert.equal(amounts.state, 'partial');
}

// --- 2. Summatila: 1000 € → 49,09 %, puhdas kate 1037,10, partner_total 1440,30
{
  const quote = { ...baseQuote, partner_commission_amount: 1000 };
  const parsed = parseBillingQuoteSettings(quote);
  assert.equal(parsed.partner_commission_amount, 1000);
  assert.equal(normalizeBillingQuoteSettings(parsed).partner_commission_amount, 1000);
  assert.equal(resolvePartnerCommissionAmount(parsed), 1000);
  assert.equal(parseBillingQuoteSettings({ ...baseQuote, partner_commission_amount: null }).partner_commission_amount, null);
  assert.equal(parseBillingQuoteSettings({ ...baseQuote, partner_commission_amount: -5 }).partner_commission_amount, 0);
  assert.equal(parseBillingQuoteSettings({ ...baseQuote, partner_commission_amount: 'x' }).partner_commission_amount, null);

  const { calculation, partnerMargin } = applyQuoteCommissionToPartnerCalculation({
    billingQuote: quote,
    logs,
    calculation: base,
  });
  assert.equal(partnerMargin.commissionSource, 'amount');
  assert.equal(partnerMargin.grossMarginNet, 2037.1);
  assert.equal(partnerMargin.commissionNet, 1000);
  assert.equal(partnerMargin.commissionPercent, 49.09);
  assert.equal(formatCommissionPercent(partnerMargin.commissionPercent), '49,09');
  assert.equal(partnerMargin.configuredCommissionPercent, 50);
  assert.equal(partnerMargin.netMarginNet, 1037.1);
  assert.equal(partnerMargin.commissionExceedsGross, false);
  assert.equal(calculation.grandTotal, 1440.3);
  const lines = commissionLines(calculation);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].total, 1000);
  assert.equal(lines[0].description, 'Provisio (sovittu summa, 49,09 % puhtaasta katteesta)');

  // Summa > kate sallitaan, mutta merkitään
  const over = computePartnerNetMargin(
    mergeActualPurchaseFromWorkReportLogs({ ...baseQuote, partner_commission_amount: 2500 }, logs, null),
    base.grandTotal,
    { logs, partnerRates: base.ratesUsed, partnerCalculation: base },
  );
  assert.equal(over.commissionNet, 2500);
  assert.equal(over.commissionExceedsGross, true);
  assert.equal(over.netMarginNet, -462.9);

  // Summa säilyy, kun tarjous linkitetään uudelleen
  const relinked = billingQuoteFromQuoteRow('q-1', 'ILP', createEmptyQuoteRequestData('huolto'), {
    previous: parsed,
  });
  assert.equal(relinked.partner_commission_amount, 1000);
  assert.equal(relinked.partner_commission_percent, 50);
}

// --- 3. Päiväkirjan Myyntiprovisio € voittaa: ei automaattista riviä, ei tuplausta
{
  const manualLogs = [{ ...logs[0], commission_amount: 500, commission_note: 'Myyntiprovisio' }];
  const manualBase = partnerCalc(manualLogs);
  assert.equal(manualBase.grandTotal, 940.3);
  for (const quote of [baseQuote, { ...baseQuote, partner_commission_amount: 1000 }]) {
    const { calculation, partnerMargin } = applyQuoteCommissionToPartnerCalculation({
      billingQuote: quote,
      logs: manualLogs,
      calculation: manualBase,
    });
    assert.equal(partnerMargin.commissionSource, 'daily_log');
    assert.equal(partnerMargin.commissionNet, 500);
    assert.equal(partnerMargin.grossMarginNet, 2037.1);
    assert.equal(partnerMargin.netMarginNet, 1537.1);
    const lines = commissionLines(calculation);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].logId, 'log-1');
    assert.equal(calculation.grandTotal, 940.3);
  }
}

// --- 4. Ilman laskutustarjousta ei provisioriviä
{
  const { calculation, partnerMargin } = applyQuoteCommissionToPartnerCalculation({
    billingQuote: {},
    logs,
    calculation: base,
  });
  assert.equal(partnerMargin, null);
  assert.equal(commissionLines(calculation).length, 0);
  assert.equal(calculation.grandTotal, 440.3);
}

// --- 5. Asiakaslasku ei muutu
{
  const customer = calculateWorkReportCustomerBillable({
    logs: [{ ...logs[0], commission_amount: 500 }],
    rates: { hourly_regular: 65, hourly_overtime: 85, hourly_on_call: 110 },
    ratesSource: 'company',
    customerName: 'Asiakas Oy',
  });
  assert.equal(
    customer.byUser.flatMap((u) => u.lines).some((l) => l.kind === 'commission'),
    false,
  );
}

// --- 6. "Kate jos hyväksytään" huomioi provision
{
  const pendingLine = {
    logId: 'l',
    logDate: '2026-09-20',
    kind: 'extra_work',
    description: 'Lisätyö',
    status: 'pending',
    customerNet: 600,
    partnerNet: 200,
    piikkiCostNet: 0,
    currentMarginImpactNet: -200,
    marginIfApprovedNet: 400,
  };
  // delta = 400 − (−200) = 600
  const percentMargin = { grossMarginNet: 2037.1, commissionNet: 1018.55, commissionPercent: 50, commissionSource: 'percent', netMarginNet: 1018.55 };
  const percentCtx = extraBillingCommissionContextFromMargin(percentMargin);
  assert.equal(percentCtx.mode, 'percent');
  // uusi kate 2637,10 → provisio 1318,55 → puhdas 1318,55 (= 1018,55 + 600 × 0,5)
  assert.equal(computeProjectedNetMarginIfLineApproved(1018.55, pendingLine, percentCtx), 1318.55);
  assert.equal(
    formatExtraBillingMarginImpactCell(pendingLine, (v) => `${v}€`, 1018.55, percentCtx).withPermission,
    '1318.55€',
  );
  assert.match(extraBillingCommissionNote(percentCtx), /50 %/);

  const amountMargin = { grossMarginNet: 2037.1, commissionNet: 1000, commissionPercent: 49.09, commissionSource: 'amount', netMarginNet: 1037.1 };
  const amountCtx = extraBillingCommissionContextFromMargin(amountMargin);
  assert.equal(amountCtx.mode, 'fixed');
  assert.equal(computeProjectedNetMarginIfLineApproved(1037.1, pendingLine, amountCtx), 1637.1);
  assert.match(extraBillingCommissionNote(amountCtx), /kiinteä/);

  // Ilman kontekstia vanha käytös (koko lisäkate)
  assert.equal(computeProjectedNetMarginIfLineApproved(1000, pendingLine), 1600);
}

console.log('test-partner-commission-row-and-amount: ok');
