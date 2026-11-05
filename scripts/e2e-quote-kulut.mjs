// Tarjous ja kate -yhteenveto: km ei tuplaannu, Kulut eroteltu (ajot / majoitus / huoltoauto).
// Ei Supabasea, ei kirjoituksia (Wärtsilä-raportin tiedot kovakoodattu). Ajo: BASE=http://localhost:5321 node scripts/e2e-quote-kulut.mjs
import { chromium } from '/workspace/pw/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:5321';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 1100 }, serviceWorkers: 'block' });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}/login`); await p.waitForTimeout(2500);
let fails = 0; const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) fails++; };

const res = await p.evaluate(async () => {
  const cmpMod = await import('/src/lib/quoteCategoryComparison.ts');
  const sumMod = await import('/src/lib/quoteOutcomeSummary.ts');
  const billing = await import('/src/lib/workReportBilling.ts');
  const sync = await import('/src/lib/quoteRequestActualPurchaseSync.ts');
  const pl = await import('/src/lib/quotePurchaseLines.ts');
  const View = (await import('/src/components/QuoteOutcomeSummaryView.tsx')).default;
  const React = (await import('/node_modules/.vite/deps/react.js')).default;
  const rd = await import('/node_modules/.vite/deps/react-dom_client.js'); const createRoot = rd.createRoot ?? rd.default.createRoot;
  const rates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
  const quoteData = {
    type: 'huolto', workItems: [{ id: 'a', hours: 10, materials: [], description: 'Ajoaika', pricePerHour: 65 }, { id: 'b', hours: 40, materials: [], description: 'Huolto', pricePerHour: 65 }],
    laborHours: 2, travelKmRate: 0.53, installationLaborHours: 50, installationLaborPurchaseRate: 50, installationVehicleAllowance: 50, installationVehicleHoursPerBlock: 8,
    installationSupplies: [
      { id: '1', name: 'Huoltotarvikkeet', rowKind: 'supply', quantity: 30, sellPrice: 45, marginPercent: 80, purchasePrice: 25 },
      { id: '2', name: 'Majoitus', rowKind: 'expense', quantity: 5, sellPrice: 200, marginPercent: 100, purchasePrice: 100 },
      { id: '3', name: 'Km korvaus', unit: 'km', rowKind: 'expense', quantity: 800, sellPrice: 1.2, marginPercent: 20, purchasePrice: 1 },
    ],
  };
  const mk = (id, date, h, legs, exp) => ({ id, work_report_id: 'wr', log_date: date, entry_type: 'regular', hours_regular: h, hours_overtime: 0, hours_on_call: 0, trip_legs: legs, expense_lines: exp, created_by: 'u1', created_at: date + 'T10:00:00Z', customer_extra_billing: {} });
  const km = (d) => ({ expense_type: 'km', description: `Ajomatkat (${d} km)`, qty: d, unit_price: 0.9, customer_unit_price: 1, bill_to_partner: true, bill_to_customer: true });
  const logs = [
    mk('l1', '2026-11-01', 5, [{ distance_km: 408.3 }], [km(408.3)]),
    mk('l2', '2026-11-03', 10, [], [{ expense_type: 'material', description: 'Huoltotarvikkeet', qty: 30, unit_price: 0, bill_to_partner: false, bill_to_customer: false }, { expense_type: 'other', description: 'Majoitus', qty: 5, unit_price: 56, bill_to_partner: true, bill_to_customer: true }]),
    mk('l3', '2026-11-04', 5, [], []),
    mk('l4', '2026-11-05', 5, [{ distance_km: 406.9 }], [km(406.9)]),
  ];
  const users = [{ id: 'u1', display_name: 'T', bill_hours_enabled: true, bill_expenses_enabled: true }];
  const calc = billing.calculateWorkReportBillable({ logs, users, rates, ratesSource: 'company_default', tripKmRate: 0.53 });
  const settings = sync.mergeActualPurchaseFromWorkReportLogs({ purchase_lines: pl.extractQuotePurchaseLines(quoteData) }, logs, quoteData);
  const cmp = cmpMod.compareQuoteCategories({ quoteData, partnerCalculation: calc, logs, partnerRates: rates, tripKmRate: 0.53, billingSettings: settings });
  const summary = sumMod.buildQuoteOutcomeSummary({ partnerMargin: null, comparison: cmp, quoteSaleNet: 6560, formatEuro: billing.formatEuro });
  const host = document.createElement('div'); document.body.appendChild(host);
  createRoot(host).render(React.createElement(View, { summary }));
  await new Promise((r) => setTimeout(r, 400));
  const rows = [...host.querySelectorAll('table.quote-outcome-table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
  const printHtml = sumMod.renderQuoteOutcomeSummaryHtml(summary, { escapeHtml: (v) => v, formatEuro: billing.formatEuro });
  return { rows, printHtml };
});

const flat = res.rows.map((r) => r.join(' | '));
console.log(flat.join('\n'));
const find = (re) => flat.find((l) => re.test(l)) ?? '';
check(!flat.some((l) => /1\s?600\s?km/.test(l)), 'ei "1 600 km" (km ei tuplaannu)');
check(/Ajokilometrit.*800 km \/ 815,2 km · oma kulu · laskutetaan kumppanilta.*800,00.*733,68/.test(find(/^Ajokilometrit/)), 'Ajokilometrit: km-korvaus laskutetaan kumppanilta');
check(/^Majoitus.*oma kulu · laskutetaan kumppanilta.*500,00.*280,00/.test(find(/^Majoitus/)), 'Majoitus omana rivinään: oma kulu · laskutetaan kumppanilta');
check(/^Huoltoautokorvaus.*vain tarjouksessa.*350,00/.test(find(/^Huoltoautokorvaus/)), 'Huoltoautokorvaus omana rivinään');
check(!flat.some((l) => /^Kulut \(ajot ja muut\)/.test(l)), 'ei sekavaa yhdistettyä riviä');
check(/^Kulut yhteensä.*4\s?900,00.*2\s?263,68/.test(find(/^Kulut yhteensä/)), 'Kulut yhteensä 4 900,00 € / 2 263,68 €');
check(/Majoitus/.test(res.printHtml) && /800 km \/ 815,2 km/.test(res.printHtml) && !/1\s?600 km/.test(res.printHtml), 'tuloste käyttää samaa erittelyä');
check(errs.length === 0, `ei sivuvirheitä ${errs.join(';')}`);
await p.screenshot({ path: '/tmp/qk.png' }).catch(() => {});
await b.close();
process.exit(fails ? 1 : 0);
