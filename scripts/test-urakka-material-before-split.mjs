import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { calculateWorkReportBillable, formatEuro, includeUrakkaExpenseLines } from '../src/lib/workReportBilling.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { parseBillingQuoteSettings, computePartnerNetMargin } from '../src/lib/workReportBillingQuote.ts';
import { resolveOutcomeUrakka, buildQuoteOutcomeSummary, buildAccountingStatement } from '../src/lib/quoteOutcomeSummary.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
const rates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
const quoteData = {
  type: 'huolto', workItems: [{id:'a',hours:10,materials:[],description:'Ajoaika',pricePerHour:65},{id:'b',hours:40,materials:[],description:'Huolto',pricePerHour:65}],
  laborHours: 2, travelKmRate: 0.53, travelKmEnabled:false, travelKmDistance:0, installationLaborHours:50, installationLaborPurchaseRate:50,
  installationVehicleAllowance:50, installationVehicleHoursPerBlock:8,
  installationSupplies: [
    {id:'340bf5b0-1001-4ad3-9d92-e36b3f0a7d44',name:'Huoltotarvikkeet',rowKind:'supply',quantity:30,sellPrice:45,marginPercent:80,purchasePrice:25},
    {id:'185b11a8-301f-4cc4-8c80-cdac629e206f',name:'Majoitus',rowKind:'expense',quantity:5,sellPrice:200,marginPercent:100,purchasePrice:100},
    {id:'b7cd3bbc-6cae-456b-8ed2-a897fc2d5b7e',name:'Km korvaus',unit:'km',rowKind:'expense',quantity:800,sellPrice:1.2,marginPercent:20,purchasePrice:1},
  ],
};
const base = { work_report_id:'wr', entry_type:'fixed_price', hours_overtime:0, hours_on_call:0, created_by:'u1', customer_extra_billing:{}, partner_billing:{urakka_all_in:true}, trip_legs:[], refrigerant_lines:[] };
const kmx=(d)=>({id:'k'+d,expense_type:'km',description:`Ajomatkat (${d} km)`,qty:d,unit_price:0.9,customer_unit_price:1,bill_to_partner:true,bill_to_customer:true,partner_billed:true});
const logs = [
 {...base,id:'a',log_date:'2026-11-01',created_at:'2026-11-05T14:44:11Z',hours_regular:5,fixed_price_amount:5904,customer_fixed_price_amount:6560,partner_urakka_margin_percent:10,trip_legs:[{distance_km:408.3}],expense_lines:[kmx(408.3)]},
 {...base,id:'b',log_date:'2026-11-03',created_at:'2026-11-03T11:31:52Z',hours_regular:10,expense_lines:[{id:'m',expense_type:'material',description:'Huoltotarvikkeet',qty:30,unit_price:0,bill_to_partner:false,bill_to_customer:false,partner_billed:true},{id:'o',expense_type:'other',description:'Majoitus',qty:5,unit_price:56,bill_to_partner:true,bill_to_customer:true,partner_billed:true}]},
 {...base,id:'c',log_date:'2026-11-04',created_at:'2026-11-05T08:16:56Z',hours_regular:5,expense_lines:[]},
 {...base,id:'d',log_date:'2026-11-05',created_at:'2026-11-05T14:48:07Z',hours_regular:5,trip_legs:[{distance_km:406.9}],expense_lines:[kmx(406.9)]},
];
import assert from 'node:assert/strict';
const build = (bill, kmQty = null, rate = null) => {
  const ls = logs.map((l) => ({ ...l, expense_lines: l.expense_lines.map((e) => {
    const x = kmQty && e.expense_type === 'km' ? { ...e, qty: kmQty } : e;
    return bill && (x.expense_type === 'km' || x.description === 'Majoitus') ? { ...x, urakka_billed: true } : x;
  }) }));
  const users = [{ id: 'u1', display_name: 'T', bill_hours_enabled: true, bill_expenses_enabled: true }];
  const calc = calculateWorkReportBillable({ logs: ls, users, rates, ratesSource: 'partnership', tripKmRate: 0.53, billToCompanyId: 'c2', billToCompanyName: 'X' });
  const raw = parseBillingQuoteSettings({ quote_request_id: 'q', quote_sale_net: 6560, quote_purchase_net: 4900, actual_purchase_net: 4900, customer_invoice_total: 6560, customer_mode: 'quote_fixed', partner_commission_percent: 0, purchase_lines: extractQuotePurchaseLines(quoteData) });
  const settings = mergeActualPurchaseFromWorkReportLogs(raw, ls, quoteData);
  const pm = computePartnerNetMargin(settings, calc.grandTotal, { logs: ls, partnerRates: calc.ratesUsed, partnerCalculation: calc, quoteData });
  const cmp = compareQuoteCategories({ quoteData, partnerCalculation: includeUrakkaExpenseLines(calc), logs: ls, partnerRates: calc.ratesUsed, tripKmRate: 0.53, billingSettings: settings });
  const input = { partnerMargin: pm, comparison: cmp, quoteSaleNet: 6560, formatEuro };
  return { calc, ls, input, withUrakka: buildQuoteOutcomeSummary({ ...input, urakka: resolveOutcomeUrakka(calc, ls, rate) }), without: buildQuoteOutcomeSummary(input) };
};

import { applyQuoteCommissionToPartnerCalculation } from '../src/lib/workReportPartnerTotal.ts';
import { computeUrakkaMaterialSplit, urakkaMaterialBillDelta } from '../src/lib/workReportUrakkaMaterials.ts';

// Urakan tarvikekulu vähennetään asiakashinnasta ENNEN 90/10-jakoa: kumppanilasku = 90 % × (asiakashinta − tarvikkeet).
assert.deepEqual(computeUrakkaMaterialSplit(5000, 90, 500), { customerNet: 5000, materialsNet: 500, potNet: 4500, partnerBillNet: 4050, partnerKeepsNet: 450 });
assert.deepEqual(computeUrakkaMaterialSplit(5000, 90, 0), { customerNet: 5000, materialsNet: 0, potNet: 5000, partnerBillNet: 4500, partnerKeepsNet: 500 });
assert.equal(computeUrakkaMaterialSplit(1000, 90, 5000).materialsNet, 1000, 'tarvikkeet rajataan asiakashintaan');
assert.equal(urakkaMaterialBillDelta(6560, 90, 600), -540);
assert.equal(urakkaMaterialBillDelta(6560, 90, 0), 0);

const users = [{ id: 'u1', display_name: 'T', bill_hours_enabled: true, bill_expenses_enabled: true }];
const bq = { quote_request_id: 'q', quote_sale_net: 6560, quote_purchase_net: 4900, actual_purchase_net: 4900, customer_invoice_total: 6560, customer_mode: 'quote_fixed', partner_commission_percent: 0, purchase_lines: extractQuotePurchaseLines(quoteData) };
function scenario(unitPrice, { direct = false } = {}) {
  const ls = logs.map((l) => {
    let x = l.id === 'b' ? { ...l, expense_lines: l.expense_lines.map((e) => (e.id === 'm' ? { ...e, unit_price: unitPrice, bill_to_partner: false } : e)) } : l;
    if (direct && x.id === 'a') x = { ...x, customer_fixed_price_amount: null, partner_urakka_margin_percent: null };
    return { ...x, expense_lines: x.expense_lines.map((e) => (e.expense_type === 'km' || e.description === 'Majoitus' ? { ...e, urakka_billed: true } : e)) };
  });
  const calc = calculateWorkReportBillable({ logs: ls, users, rates, ratesSource: 'partnership', tripKmRate: 0.53, billToCompanyId: 'c2', billToCompanyName: 'X' });
  const applied = applyQuoteCommissionToPartnerCalculation({ billingQuote: bq, logs: ls, calculation: calc, quoteData });
  const again = applyQuoteCommissionToPartnerCalculation({ billingQuote: bq, logs: ls, calculation: applied.calculation, quoteData });
  const settings = mergeActualPurchaseFromWorkReportLogs(parseBillingQuoteSettings(bq), ls, quoteData);
  const pm = computePartnerNetMargin(settings, applied.calculation.grandTotal, { logs: ls, partnerRates: calc.ratesUsed, partnerCalculation: applied.calculation, quoteData });
  const cmp = compareQuoteCategories({ quoteData, partnerCalculation: includeUrakkaExpenseLines(applied.calculation), logs: ls, partnerRates: calc.ratesUsed, tripKmRate: 0.53, billingSettings: settings });
  const summary = buildQuoteOutcomeSummary({ partnerMargin: pm, comparison: cmp, quoteSaleNet: 6560, formatEuro, urakka: resolveOutcomeUrakka(applied.calculation, ls) });
  const fixedLines = applied.calculation.byUser.flatMap((u) => u.lines).filter((l) => l.kind === 'fixed_price');
  return { calc, applied: applied.calculation, again: again.calculation, summary, fixedLines, cmp };
}

// Ei tarvikekulua (Wärtsilä): ei vähennysriviä, lasku 5 904 €.
const m0 = scenario(0);
assert.equal(m0.fixedLines.length, 1);
assert.equal(m0.applied.grandTotal, m0.calc.grandTotal);
assert.equal(m0.summary.urakka.partnerBillNet, 5904);
assert.equal(m0.summary.urakka.wageNet, 4890.32);

// Tarvikekulu 600 € (30 kpl × 10 € × alv 0): lasku 90 % × (6560 − 600) = 5364, kumppanille jää 596.
const m1 = scenario(10);
assert.equal(m1.cmp.rows.find((r) => r.key === 'supplies').actualNet, 600);
assert.equal(m1.fixedLines.length, 2);
assert.equal(m1.fixedLines[1].total, -540);
assert.match(m1.fixedLines[1].description, /Tarvikekulut 600,00 € vähennetty asiakashinnasta ennen jakoa \(90 %\)/);
assert.equal(round(m1.applied.grandTotal), round(m1.calc.grandTotal - 540), 'kumppanilasku pienenee 90 % × 600');
assert.equal(m1.fixedLines.reduce((s, l) => s + l.total, 0), 5364);
assert.deepEqual(m1.again, m1.applied, 'idempotentti: toinen ajo ei tuplaa vähennystä');
const u1 = m1.summary.urakka;
assert.equal(u1.partnerBillNet, 5364);
assert.equal(u1.partnerKeepsNet, 596);
assert.equal(u1.materials.actualNet, 600);
// Omat kulut eivät sisällä tarvikkeita toista kertaa: ajot + majoitus pysyvät 1 013,68 €.
assert.equal(m1.summary.costs.actualNet, 1013.68);
assert.equal(u1.wageNet, round(5364 - 1013.68));
const st1 = buildAccountingStatement(m1.summary);
assert.deepEqual(st1.income.map((l) => l.label), ['Tarjoushinta', 'Tarvikkeet', 'Kumppanille jää (10 %)', 'Laskutettu kumppanilta']);
assert.deepEqual(st1.income.map((l) => l.actualNet), [6560, -600, -596, 5364]);
assert.ok(!st1.costs.some((l) => l.label === 'Tarvikkeet'), 'tarvikkeet vain kerran (jaettavan summan vähennys)');
// Tulot − tarvikkeet − kumppanille jää = laskutettu.
assert.equal(round(st1.income[0].actualNet + st1.income[1].actualNet + st1.income[2].actualNet), st1.income[3].actualNet);

// Suora kumppanihinta (ei asiakashintaa): jakoa ei ole → tarvikkeet pysyvät omina kuluina, ei vähennysriviä.
const d1 = scenario(10, { direct: true });
assert.equal(d1.fixedLines.length, 1);
assert.equal(d1.summary.urakka.materials, null);
assert.equal(d1.summary.costs.actualNet, 1613.68);
function round(v) { return Math.round(v * 100) / 100; }
console.log('urakka-material-before-split: ok');
