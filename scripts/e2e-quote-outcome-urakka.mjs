// Tarjous ja kate, urakka (Wärtsilä 90 %): banneri ei sano "huonommin" kun hinta on sovittu urakka.
// Ei Supabasea, ei kirjoituksia (tiedot kovakoodattu). Ajo: BASE=http://localhost:5321 node scripts/e2e-quote-outcome-urakka.mjs
import { chromium } from '/workspace/pw/node_modules/playwright/index.mjs';
// Supabase mockattu (VITE_SUPABASE_URL=https://mock.supabase.co): tallennus tallentuu vain muistiin, ei oikeaa kantaa.
const BASE = process.env.BASE || 'http://localhost:5321';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 1100 }, serviceWorkers: 'block' });
const writes = []; let storedQuote = { quote_request_id: null, customer_mode: 'quote_fixed', quote_sale_net: 6560, quote_purchase_net: 4900, actual_purchase_net: 4900, customer_invoice_total: 6560 };
await ctx.route('https://mock.supabase.co/**', async (route) => {
  const req = route.request(); const u = new URL(req.url());
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
  if (u.pathname.endsWith('/work_report_billable')) {
    if (req.method() === 'GET') return json({ billing_quote: storedQuote });
    if (req.method() === 'PATCH') { const d = req.postDataJSON(); storedQuote = d.billing_quote; writes.push(d.billing_quote); return json([{ work_report_id: 'wr' }]); }
  }
  if (u.pathname.endsWith('/quote_requests')) return json({ data: await p.evaluate(() => window.__quoteData) });
  return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
});
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
  window.__quoteData = quoteData;
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
  const rowsOf = (el) => [...el.querySelectorAll('table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  // 50 €/h
  const summary50 = buildQuoteOutcomeSummary({ partnerMargin: pm, comparison: cmp, quoteSaleNet: 6560, formatEuro, urakka: resolveOutcomeUrakka(calc, logs, 50) });
  const host50 = document.createElement('div'); document.body.appendChild(host50);
  createRoot(host50).render(React.createElement(View, { summary: summary50 }));
  // Paneeli: kenttä + tallennus
  const Panel = (await import('/src/components/WorkReportBillingQuotePanel.tsx')).default;
  const hostP = document.createElement('div'); hostP.id = 'panelhost'; document.body.appendChild(hostP);
  createRoot(hostP).render(React.createElement(Panel, { workReportId: 'wr', customerId: 'c', ownerCompanyId: 'o', installationCostNet: calc.grandTotal, initialSettings: settings, dailyLogs: logs, partnerCalculation: calc, showPartnerMargin: true, onSaved: () => {} }));
  // Toimintorivi: Laskutettava-kytkin piilossa urakan tarvikkeelta
  const Sec = (await import('/src/components/DailyLogExpenseLinesSection.tsx')).default;
  const { emptyExpense } = await import('/src/lib/dailyLogExpenseDraft.ts');
  const seeded = { ...emptyExpense(), expense_type: 'material', description: 'Huoltotarvikkeet', qty: '30', unit_price: '0', bill_to_partner: false, bill_to_customer: false };
  const extra = { ...emptyExpense(), expense_type: 'material', description: 'Lisätarvike', qty: '1', unit_price: '10', bill_to_partner: true, bill_to_customer: true };
  const hostS = document.createElement('div'); hostS.id = 'sechost'; document.body.appendChild(hostS);
  const Wrap = () => { const [d, setD] = React.useState([seeded, extra]); return React.createElement(Sec, { expenseDrafts: d, setExpenseDrafts: setD, showPartnerPrices: true, showCustomerPrices: false, linkedQuoteRequest: true, rowBillMode: 'urakka', categoryFilter: 'supplies' }); };
  createRoot(hostS).render(React.createElement(Wrap));
  await new Promise((r) => setTimeout(r, 800));
  return { text: host.textContent.replace(/\s+/g, ' '), rows: rowsOf(host), rows50: rowsOf(host50), titles: [...hostS.querySelectorAll('.expense-line-list-item-title')].map((e) => e.textContent), toggles: [...hostS.querySelectorAll('li')].map((li) => /Laskutettava/.test(li.textContent)) };
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
check(!res.rows.some((r) => /^(Muut kate-erät|Työt)/.test(r)), 'ei Muut kate-erät / Työt -riviä');
check(res.rows.some((r) => /^Työn palkka.*3\s?504,00.*4\s?890,32/.test(r)), 'Työn palkka 3 504,00 / 4 890,32');
check(res.rows.some((r) => /^Työn palkka.*195,61 €\/h \(25 h\)/.test(r)), '195,61 €/h (25 h) palkan alla');
check(!res.rows.some((r) => /^Puhdas kate/.test(r)) && !/palkka tulee lisäksi/.test(res.text), 'ei "puhdas kate" / "palkka tulee lisäksi"');
check(!res.rows.some((r) => /^(Työn osuus|Myynnin tuotto)/.test(r)), 'ilman tuntihintaa ei jakoa');
console.log(res.rows50.join('\n'));
check(res.rows50.some((r) => /^Työn palkka.*4\s?890,32/.test(r)) && res.rows50.some((r) => /^Työn osuus.*25 h × 50,00 €\/h.*1\s?250,00/.test(r)) && res.rows50.some((r) => /^Myynnin tuotto.*3\s?640,32/.test(r)), '50 €/h: palkka 4 890,32, työn osuus − 1 250,00, myynnin tuotto 3 640,32');
// Kenttä: 48 px / 16 px, tallennus blurilla
const inp = p.locator('#panelhost .billing-notional-rate input');
check(await inp.count() === 1, 'tuntihintakenttä näkyy urakkaraportissa');
const box = await inp.evaluate((e) => ({ h: e.getBoundingClientRect().height, f: getComputedStyle(e).fontSize }));
check(box.h >= 47.5 && box.f === '16px', `kenttä 48 px / 16 px (${box.h}/${box.f})`);
await inp.fill('50'); await inp.blur(); await p.waitForTimeout(800);
check(writes.length === 1 && writes[0].notional_hourly_rate === 50, `tallentui billing_quote.notional_hourly_rate = 50 (${JSON.stringify(writes.map((w) => w.notional_hourly_rate))})`);
await inp.fill(''); await inp.blur(); await p.waitForTimeout(800);
check(writes.length === 2 && writes[1].notional_hourly_rate == null, 'tyhjennys poistaa tuntihinnan');
await inp.fill('abc'); await inp.blur(); await p.waitForTimeout(500);
check(writes.length === 2 && (await p.locator('#panelhost .billing-notional-rate .error').count()) === 1, 'virheellinen arvo ei tallennu, näyttää virheen');
// Tarvikerivi
check(res.titles.length === 2 && res.titles.every((t) => (t.match(/kuuluu urakkaan · suora kulu/g) ?? []).length <= 1), `rivin teksti ei toistu: ${res.titles.join(' || ')}`);
check(res.toggles[0] === false && res.toggles[1] === true, `Laskutettava-kytkin piilossa tarjouksen tarvikkeelta, näkyy lisätarvikkeella (${res.toggles})`);
check(errs.length === 0, `ei sivuvirheitä ${errs.join(';')}`);
await b.close();
process.exit(fails ? 1 : 0);
