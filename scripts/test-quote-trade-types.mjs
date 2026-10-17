import assert from 'node:assert/strict';
import {
  applyQuoteTypeChange,
  createEmptyMaterial,
  createEmptyQuoteRequestData,
  normalizeQuoteRequestData,
} from '../src/lib/quoteRequest/defaults.ts';
import {
  computeKotitalousDeduction,
  computeQuoteInternalTotals,
  computeQuoteTotals,
} from '../src/lib/quoteRequest/calculations.ts';
import { generateQuoteServicePrintHtml } from '../src/lib/quoteRequest/printHtml.ts';
import { installationSuppliesLaborHours } from '../src/lib/quoteRequest/installationSupplies.ts';
import {
  findTradeCatalogItem,
  isTradeRowPriceMissing,
  parseTradeCatalogPrices,
  tradeCatalogDefaultPrice,
  tradeCatalogItems,
  TRADE_CATALOG,
} from '../src/lib/quoteRequest/tradeCatalog.ts';
import { QUOTE_TYPE_LABELS, QUOTE_TYPE_ORDER, isRepairQuoteType } from '../src/lib/quoteRequest/constants.ts';
import { billingQuoteFromQuoteRow } from '../src/lib/workReportBillingQuote.ts';
import { buildWorkReportPayloadFromQuote } from '../src/lib/quoteRequest/createWorkReportFromQuote.ts';
import { parseCompanySettings } from '../src/lib/management.ts';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} != ${b}`);

// Tyyppivalinta: Huolto/korjaus ensin, sitten LVI, IV, Sähkö.
assert.deepEqual(QUOTE_TYPE_ORDER.slice(0, 4), ['huolto', 'lvi', 'iv', 'sahko']);
assert.equal(QUOTE_TYPE_LABELS.iv, 'IV-tarjous');
assert.equal(QUOTE_TYPE_LABELS.lvi, 'LVI-tarjous');
assert.equal(QUOTE_TYPE_LABELS.sahko, 'Sähkötarjous');
for (const t of ['lvi', 'iv', 'sahko']) assert.equal(isRepairQuoteType(t), true);

// Katalogi: avaimet uniikit, jokaisessa tyypissä työt + tarvikkeet + kulut.
const keys = ['lvi', 'iv', 'sahko'].flatMap((t) => tradeCatalogItems(t).map((i) => i.key));
assert.equal(new Set(keys).size, keys.length);
for (const t of ['lvi', 'iv', 'sahko']) {
  const kinds = new Set(tradeCatalogItems(t).map((i) => i.kind));
  for (const k of ['labor', 'supply', 'expense']) assert.ok(kinds.has(k), `${t} ${k}`);
  assert.ok(TRADE_CATALOG[t].length >= 3);
}
assert.equal(findTradeCatalogItem('iv-puhdistus-venttiili').unit, 'kpl');
assert.equal(findTradeCatalogItem('sahko-mmj-3x25').unit, 'm');
assert.equal(findTradeCatalogItem('lvi-huuhtelu').unit, 'kohde');

// Hinnat: oma hinta > tuntihinta (vain h-riveille) > 0 (hinta puuttuu).
const prices = parseTradeCatalogPrices({ 'iv-puhdistus-venttiili': '38', 'iv-saato': 120, bogus: -1, empty: '' });
assert.deepEqual(prices, { 'iv-puhdistus-venttiili': 38, 'iv-saato': 120 });
assert.equal(tradeCatalogDefaultPrice(findTradeCatalogItem('iv-puhdistus-venttiili'), prices, 65), 38);
assert.equal(tradeCatalogDefaultPrice(findTradeCatalogItem('iv-tyo-h'), prices, 65), 65);
assert.equal(tradeCatalogDefaultPrice(findTradeCatalogItem('iv-kanava-125'), prices, 65), 0);
assert.equal(isTradeRowPriceMissing({ catalogKey: 'iv-kanava-125', sellPrice: 0, name: 'x' }), true);
assert.equal(isTradeRowPriceMissing({ catalogKey: 'iv-kanava-125', sellPrice: 12, name: 'x' }), false);
assert.equal(isTradeRowPriceMissing({ sellPrice: 0, name: 'vapaa' }), false);
// Yrityksen asetukset säilyttävät hinnaston.
assert.deepEqual(parseCompanySettings({ quotes: { catalog_prices: { 'iv-saato': 120 } } }).quotes.catalog_prices, { 'iv-saato': 120 });

// Uusi tarjous huolto → IV: koskemattomat huoltorivit (Öljyn vaihto, Kenno pesu) vaihtuvat tyhjiksi, ei piilotyötä.
const fresh = createEmptyQuoteRequestData('huolto');
assert.equal(fresh.workItems.length, 2);
const iv0 = applyQuoteTypeChange(fresh, 'iv');
assert.equal(iv0.type, 'iv');
assert.equal(iv0.workItems.length, 0);
assert.equal(iv0.laborHours, 0);
assert.equal(computeQuoteTotals(iv0).subtotalNet, 0);
// Muokatut rivit säilyvät tyypin vaihdossa.
const edited = { ...fresh, workItems: [{ ...fresh.workItems[0], description: 'Oma työ' }] };
assert.equal(applyQuoteTypeChange(edited, 'lvi').workItems[0].description, 'Oma työ');

// IV-tarjous yksityisasiakkaalle (alv 25,5 %):
//  puhdistus 14 venttiiliä × 38 = 532, mittaus ja säätö 1 × 120 = 120  → työ 652
//  suodatinsarja 1 × 50 = 50, km 40 × 0,60 = 24
//  alv 0: 726,00; alv 25,5 %: 185,13; yhteensä 911,13
//  työn osuus sis. alv 652 × 1,255 = 818,26 → vähennys 818,26 × 40 % − 150 = 177,30
const row = (key, quantity, sellPrice) => {
  const item = findTradeCatalogItem(key);
  return createEmptyMaterial({ name: item.name, unit: item.unit, rowKind: item.kind, quantity, sellPrice, purchasePrice: 0, marginPercent: 0, catalogKey: key });
};
const iv = normalizeQuoteRequestData({
  ...iv0,
  quoteVatProfile: 'consumer',
  vatRate: 25.5,
  introText: 'Kanavien puhdistus',
  installationSupplies: [
    row('iv-puhdistus-venttiili', 14, 38),
    row('iv-saato', 1, 120),
    row('iv-suodattimet', 1, 50),
    row('iv-km', 40, 0.6),
    row('iv-kanava-125', 3, 0),
  ],
});
assert.equal(iv.type, 'iv');
assert.equal(iv.installationSupplies[0].catalogKey, 'iv-puhdistus-venttiili');
const t = computeQuoteTotals(iv);
near(t.workNet, 652, 'workNet');
near(t.materialsNet, 50, 'materialsNet');
near(t.travelNet, 24, 'travelNet');
near(t.subtotalNet, 726, 'subtotal');
near(t.vatAmount, 185.13, 'vat');
near(t.grossTotal, 911.13, 'gross');
assert.equal(installationSuppliesLaborHours(iv.installationSupplies), 0);
const k = computeKotitalousDeduction(iv);
near(k.laborOnlyGross, 818.26, 'labor gross');
assert.equal(k.percent, 0.4);
near(k.onePerson, 177.3, 'deduction');

const html = generateQuoteServicePrintHtml({
  data: iv,
  customer: { name: 'Testi Asiakas', address: 'Katu 1', postal_code: '00100', city: 'Helsinki' },
  meta: { companyName: 'Testi Oy', quoteDate: '2026-10-17' },
  mode: 'enduser',
});
assert.match(html, /<h1>IV-tarjous: Kanavien puhdistus<\/h1>/);
assert.match(html, /IV-kanavien puhdistus \/ venttiili/);
assert.match(html, /14 kpl/);
assert.match(html, /40 km/);
assert.match(html, /Kotitalousvähennykseen oikeuttava työn osuus 818,26[\s\u00a0]€ \(sis\. alv 25,5 %\)/);
assert.doesNotMatch(html, /<td>Tarvikkeet<\/td>/, 'tarvikkeet eriteltyinä, ei summariviä');

// Yritysasiakas (alv 0): ei kotitalousvähennysriviä.
const ivB2B = { ...iv, quoteVatProfile: 'business', vatRate: 0 };
assert.equal(computeKotitalousDeduction(ivB2B).laborOnlyGross, 0);
assert.doesNotMatch(
  generateQuoteServicePrintHtml({ data: ivB2B, customer: { name: 'Yritys' }, meta: { companyName: 'Testi Oy' }, mode: 'enduser' }),
  /Kotitalousvähennykseen/,
);

// 10 % kokonaisalennus pienentää työn osuutta: 652 × 0,9 × 1,255 = 736,43.
near(computeKotitalousDeduction({ ...iv, overallDiscountPercent: 10 }).laborOnlyGross, 736.43, 'discounted labor');

// Lämpöpumppu: 2026 säännöt. Työ 1 000 € alv 0 → 1 255 € → 502 − 150 = 352.
const pump = { ...createEmptyQuoteRequestData('vesi-ilma'), laborHours: 10, laborRate: 100, vatRate: 25.5, workItems: [] };
const kp = computeKotitalousDeduction(pump);
near(kp.laborOnlyGross, 1255, 'pump labor');
near(kp.onePerson, 352, 'pump deduction');
// Katto 2 100 €/hlö; kahdella: 2 × 150 € omavastuu.
const big = computeKotitalousDeduction({ ...pump, laborHours: 79.68, laborRate: 100 });
near(big.laborOnlyGross, 9999.84, 'big labor'); // 7 968 × 1,255
near(big.onePerson, 2100, 'cap');
near(big.withSpouse, 3699.94, 'spouses'); // 9 999,84 × 40 % − 2 × 150
// Öljylämmityksestä luopuminen 60 %: 1 255 × 0,6 − 150 = 603.
near(computeKotitalousDeduction({ ...pump, oilBoilerRemoval: true }).onePerson, 603, 'oil');

// Tarjous → työraportti: sama summa ja otsikko kuin muilla huolto/korjaus-tarjouksilla.
const billing = billingQuoteFromQuoteRow('q1', 'Testi Asiakas – Kanavien puhdistus', iv, { fixedCustomerBilling: true });
near(billing.quote_sale_net, 726, 'billing sale net');
near(billing.customer_invoice_total, 911.13, 'billing customer total');
const internal = computeQuoteInternalTotals(iv, null);
near(internal.discountedSellNet, 726, 'internal sell');
const payload = buildWorkReportPayloadFromQuote({
  quote: { id: 'q1', title: 't', data: iv, owner_company_id: 'c', created_by_company_id: 'c', branding_company_id: 'c', partnership_id: null, customer_id: 'cu', subscriber_id: null, work_report_id: null },
  customer: { name: 'Testi Asiakas' },
  sessionUserId: 'u',
});
assert.equal(payload.title, 'Testi Asiakas – Kanavien puhdistus');

console.log('quote trade types ok');
