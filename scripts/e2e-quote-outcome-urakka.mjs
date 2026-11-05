// Tarjous ja kate, urakka (Wärtsilä 90 %): banneri ei sano "huonommin" kun hinta on sovittu urakka.
// Ei Supabasea, ei kirjoituksia (tiedot kovakoodattu). Ajo: BASE=http://localhost:5321 node scripts/e2e-quote-outcome-urakka.mjs
import { chromium } from '/workspace/pw/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:5321';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 1100 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/login`); await p.waitForTimeout(2500);
let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };
const res = await p.evaluate(async () => {
  const { compareQuoteCategories } = await import('/src/lib/quoteCategoryComparison.ts');
  const { calculateWorkReportBillable, formatEuro, includeUrakkaExpenseLines } = await import('/src/lib/workReportBilling.ts');
  const { mergeActualPurchaseFromWorkReportLogs } = await import('/src/lib/quoteRequestActualPurchaseSync.ts');
  const { parseBillingQuoteSettings, computePartnerNetMargin } = await import('/src/lib/workReportBillingQuote.ts');
  const { buildQuoteOutcomeSummary, resolveOutcomeUrakka } = await import('/src/lib/quoteOutcomeSummary.ts');
  const { extractQuotePurchaseLines } = await import('/src/lib/quotePurchaseLines.ts');
  const View = (await import('/src/components/QuoteOutcomeSummaryView.tsx')).default;
  const React = (await import('/node_modules/.vite/deps/react.js')).default;
  const rd = await import('/node_modules/.vite/deps/react-dom_client.js'); const createRoot = rd.createRoot ?? rd.default.createRoot;
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
  
  const users = [{ id: 'u1', display_name: 'T', bill_hours_enabled: true, bill_expenses_enabled: true }];
  const calc = calculateWorkReportBillable({ logs, users, rates, ratesSource: 'partnership', tripKmRate: 0.53, billToCompanyId: 'c2', billToCompanyName: 'X' });
  const raw = parseBillingQuoteSettings({ quote_request_id: 'q', quote_sale_net: 6560, quote_purchase_net: 4900, actual_purchase_net: 4900, customer_invoice_total: 6560, customer_mode: 'quote_fixed', partner_commission_percent: 0, purchase_lines: extractQuotePurchaseLines(quoteData) });
  const settings = mergeActualPurchaseFromWorkReportLogs(raw, logs, quoteData);
  const pm = computePartnerNetMargin(settings, calc.grandTotal, { logs, partnerRates: calc.ratesUsed, partnerCalculation: calc, quoteData });
  const cmp = compareQuoteCategories({ quoteData, partnerCalculation: includeUrakkaExpenseLines(calc), logs, partnerRates: calc.ratesUsed, tripKmRate: 0.53, billingSettings: settings });
  const summary = buildQuoteOutcomeSummary({ partnerMargin: pm, comparison: cmp, quoteSaleNet: 6560, formatEuro, urakka: resolveOutcomeUrakka(calc, logs) });
  const host = document.createElement('div'); document.body.appendChild(host);
  createRoot(host).render(React.createElement(View, { summary }));
  await new Promise((r) => setTimeout(r, 400));
  return { text: host.textContent.replace(/\s+/g, ' '), rows: [...host.querySelectorAll('table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ')) };
});
console.log(res.rows.join('\n'));
check(!/huonommin/.test(res.text), 'ei "huonommin"-bannerta');
check(/Meni tarjouspyyntöä paremmin \+1\s?386,32/.test(res.text), 'banneri: paremmin +1 386,32 €');
check(!/1004|1\s?004/.test(res.text), 'ei −1004');
check(res.rows.some((r) => /^Kumppanille jää \(10 %\).*656,00/.test(r)), 'Kumppanille jää (10 %) 656,00 €');
check(res.rows.some((r) => /^Laskutettu kumppanilta.*5\s?904,00.*5\s?904,00/.test(r)), 'Laskutettu kumppanilta 5 904,00 €');
check(res.rows.some((r) => /^Tarvikkeet.*750,00.*0,00/.test(r)), 'Tarvikkeet 750 → 0 (ei tarvittu)');
check(res.rows.some((r) => /^Ajokilometrit.*800,00.*733,68/.test(r)) && res.rows.some((r) => /^Majoitus.*500,00.*280,00/.test(r)), 'ajot 733,68 ja majoitus 280,00 omina kuluina');
check(res.rows.some((r) => /^Kulut yhteensä.*2\s?400,00.*1\s?013,68/.test(r)), 'Kulut yhteensä 2 400,00 / 1 013,68');
check(res.rows.some((r) => /^Puhdas kate.*3\s?504,00.*4\s?890,32/.test(r)), 'Puhdas kate 3 504,00 / 4 890,32');
check(!res.rows.some((r) => /^(Muut kate-erät|Työt)/.test(r)), 'ei Muut kate-erät / Työt -riviä');
check(errs.length === 0, `ei sivuvirheitä ${errs.join(';')}`);
await b.close();
process.exit(fails ? 1 : 0);
