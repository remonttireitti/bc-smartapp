import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { calculateWorkReportBillable, formatEuro } from '../src/lib/workReportBilling.ts';
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
const build = (bill, kmQty = null) => {
  const ls = logs.map((l) => ({ ...l, expense_lines: l.expense_lines.map((e) => {
    const x = kmQty && e.expense_type === 'km' ? { ...e, qty: kmQty } : e;
    return bill && (x.expense_type === 'km' || x.description === 'Majoitus') ? { ...x, urakka_billed: true } : x;
  }) }));
  const users = [{ id: 'u1', display_name: 'T', bill_hours_enabled: true, bill_expenses_enabled: true }];
  const calc = calculateWorkReportBillable({ logs: ls, users, rates, ratesSource: 'partnership', tripKmRate: 0.53, billToCompanyId: 'c2', billToCompanyName: 'X' });
  const raw = parseBillingQuoteSettings({ quote_request_id: 'q', quote_sale_net: 6560, quote_purchase_net: 4900, actual_purchase_net: 4900, customer_invoice_total: 6560, customer_mode: 'quote_fixed', partner_commission_percent: 0, purchase_lines: extractQuotePurchaseLines(quoteData) });
  const settings = mergeActualPurchaseFromWorkReportLogs(raw, ls, quoteData);
  const pm = computePartnerNetMargin(settings, calc.grandTotal, { logs: ls, partnerRates: calc.ratesUsed, partnerCalculation: calc, quoteData });
  const cmp = compareQuoteCategories({ quoteData, partnerCalculation: calc, logs: ls, partnerRates: calc.ratesUsed, tripKmRate: 0.53, billingSettings: settings });
  const input = { partnerMargin: pm, comparison: cmp, quoteSaleNet: 6560, formatEuro };
  return { calc, ls, input, withUrakka: buildQuoteOutcomeSummary({ ...input, urakka: resolveOutcomeUrakka(calc, ls) }), without: buildQuoteOutcomeSummary(input) };
};

// Wärtsilä: urakka 90 % × 6560 = 5904, km/majoitus urakan sisällä.
const a = build(false);
assert.equal(a.without.verdict.tone, 'worse', 'vanha laskenta: 5904 − 4900 = −1004 (virhe)');
assert.equal(a.without.verdict.amountNet, -1004);
assert.deepEqual(resolveOutcomeUrakka(a.calc, a.ls), { partnerNet: 5904, partnerKeepsPercent: 10 });
const s = a.withUrakka;
assert.equal(s.verdict.tone, 'neutral');
assert.equal(s.verdict.label, 'Meni tarjouspyynnön mukaan');
assert.equal(s.costs.estimateNet, 5904);
assert.equal(s.costs.actualNet, 5904);
assert.equal(s.grossMargin.estimateNet, 656);
assert.equal(s.grossMargin.actualNet, 656);
const st = buildAccountingStatement(s);
assert.deepEqual(st.costs.map((l) => l.label), ['Urakkahinta', 'Kulut yhteensä']);
assert.match(st.costs[0].sub, /kumppanille jää 10 %/);
assert.match(st.costs[0].sub, /korvaa tarjouksen kuluarvion 4.?900,00/, 'tarjouksen kuluarvio 4 900 € (työt, tarvikkeet, ajot, majoitus, huoltoauto) näkyy selitteessä');
assert.ok(!st.costs.some((l) => l.label === 'Muut kate-erät'));

// Km ja majoitus laskutettu urakan päälle: ne vertaillaan tarjoukseen (alle arvion → paremmin).
const b = build(true);
assert.equal(b.withUrakka.verdict.tone, 'better');
assert.equal(b.withUrakka.verdict.amountNet, 286.32);
assert.deepEqual(buildAccountingStatement(b.withUrakka).costs.map((l) => l.label), ['Ajokilometrit', 'Majoitus', 'Urakkahinta', 'Kulut yhteensä']);

// Urakan päälle laskutetut kulut yli tarjouksen → huonommin (oikea ylitys tunnistetaan).
const over = build(true, 900);
assert.equal(over.withUrakka.verdict.tone, 'worse');
assert.ok(over.withUrakka.verdict.amountNet < 0);

// Ei urakkaa → käyttäytyminen ennallaan.
const plain = buildQuoteOutcomeSummary({ ...a.input, urakka: null });
assert.equal(plain.verdict.amountNet, -1004);
assert.equal(resolveOutcomeUrakka(null, []), null);
console.log('quote-outcome-urakka: ok');
