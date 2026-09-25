/**
 * Tarjouspyynnön kohdistus olemassa olevaan työraporttiin: ehdokkaiden järjestys, linkkisuunnitelma
 * (ei samaa tarjousta kahteen raporttiin / kahta tarjousta raportille), billing_quote-snapshot.
 */
import assert from 'node:assert/strict';
import {
  billingQuoteAfterUnlink,
  billingQuoteForLinkedQuote,
  buildQuoteCandidates,
  buildQuoteReportLinkIndex,
  buildWorkReportCandidates,
  isCustomerAlreadyBilled,
  isOrderedQuoteWithoutReport,
  planQuoteLink,
  quoteLinkConfirmMessage,
} from '../src/lib/quoteWorkReportLinkLogic.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';

const OWNER = 'own-1';
const quotes = [
  { id: 'q-old', title: 'Messukeskus – Tarkkaamo 406', status: 'ordered', customer_id: 'c-messu', owner_company_id: OWNER, work_report_id: null, updated_at: '2026-08-01T10:00:00Z' },
  { id: 'q-linked', title: 'Wärtsilä – Kompressori', status: 'ordered', customer_id: 'c-wart', owner_company_id: OWNER, work_report_id: 'r-wart', updated_at: '2026-09-20T10:00:00Z' },
  { id: 'q-billing-only', title: 'Kesko – Kylmähuolto', status: 'ordered', customer_id: 'c-kesko', owner_company_id: OWNER, work_report_id: null, updated_at: '2026-07-01T10:00:00Z' },
  { id: 'q-sent', title: 'Messukeskus – Lisätyö', status: 'sent', customer_id: 'c-messu', owner_company_id: OWNER, work_report_id: null, updated_at: '2026-09-01T10:00:00Z' },
  { id: 'q-draft', title: 'Messukeskus – Luonnos', status: 'draft', customer_id: 'c-messu', owner_company_id: OWNER, work_report_id: null, updated_at: '2026-09-22T10:00:00Z' },
  { id: 'q-other-company', title: 'Muu – Tarjous', status: 'ordered', customer_id: 'c-messu', owner_company_id: 'own-2', work_report_id: null, updated_at: '2026-09-23T10:00:00Z' },
];
const billingLinks = [
  { work_report_id: 'r-wart', quote_request_id: 'q-linked' },
  { work_report_id: 'r-kesko', quote_request_id: 'q-billing-only' },
];
const index = buildQuoteReportLinkIndex({ quotes, billingLinks });

// --- Linkki-indeksi: molemmat puolet
assert.equal(index.quoteToReport.get('q-linked'), 'r-wart');
assert.equal(index.quoteToReport.get('q-billing-only'), 'r-kesko', 'vanha raportin puolen linkki');
assert.deepEqual(index.reportToQuotes.get('r-wart'), ['q-linked'], 'ei tuplaa, vaikka molemmat puolet');

// --- "Tilattu, ei työraporttia"
assert.equal(isOrderedQuoteWithoutReport(quotes[0], index), true);
assert.equal(isOrderedQuoteWithoutReport(quotes[1], index), false);
assert.equal(isOrderedQuoteWithoutReport(quotes[2], index), false, 'billing_quote-linkki riittää');
assert.equal(isOrderedQuoteWithoutReport(quotes[3], index), false, 'lähetetty ei ole tilattu');

// --- Työraporttiehdokkaat tarjoukselle: sama asiakas, vapaat ensin, uusimmat
const reports = [
  { id: 'r-wart', title: 'Wärtsilä – Kompressori', status: 'completed', customer_id: 'c-wart', owner_company_id: OWNER, created_at: '2026-09-21T08:00:00Z', customer_name: 'Wärtsilä' },
  { id: 'r-messu-old', title: 'Messukeskus – huolto kesä', status: 'billed_partner', customer_id: 'c-messu', owner_company_id: OWNER, created_at: '2026-06-01T08:00:00Z', customer_name: 'Messukeskus' },
  { id: 'r-messu-new', title: 'Messukeskus – Tarkkaamo 406 korjaus', status: 'completed', customer_id: 'c-messu', owner_company_id: OWNER, created_at: '2026-08-10T08:00:00Z', customer_name: 'Messukeskus' },
  { id: 'r-messu-linked', title: 'Messukeskus – toinen', status: 'completed', customer_id: 'c-messu', owner_company_id: OWNER, created_at: '2026-09-10T08:00:00Z', customer_name: 'Messukeskus' },
  { id: 'r-other-owner', title: 'Messukeskus – muu yritys', status: 'completed', customer_id: 'c-messu', owner_company_id: 'own-2', created_at: '2026-09-11T08:00:00Z', customer_name: 'Messukeskus' },
];
const index2 = buildQuoteReportLinkIndex({
  quotes,
  billingLinks: [...billingLinks, { work_report_id: 'r-messu-linked', quote_request_id: 'q-sent' }],
});
const reportCandidates = buildWorkReportCandidates({ reports, quote: quotes[0], index: index2 });
assert.deepEqual(
  reportCandidates.map((r) => r.id),
  ['r-messu-new', 'r-messu-old', 'r-messu-linked', 'r-wart'],
  'sama asiakas → vapaat → uusimmat; toisen yrityksen raportit pois',
);
assert.equal(reportCandidates[0].sameCustomer, true);
assert.equal(reportCandidates[2].linkedQuoteId, 'q-sent');
assert.equal(reportCandidates[3].linkedQuoteId, 'q-linked');
// Haku otsikolla / asiakkaalla, sanat missä järjestyksessä tahansa
assert.deepEqual(
  buildWorkReportCandidates({ reports, quote: quotes[0], index: index2, query: '406 messu' }).map((r) => r.id),
  ['r-messu-new'],
);
assert.deepEqual(
  buildWorkReportCandidates({ reports, quote: quotes[0], index: index2, query: 'wärtsilä' }).map((r) => r.id),
  ['r-wart'],
);
// Nykyinen kohdistus ensimmäisenä
const currentFirst = buildWorkReportCandidates({ reports, quote: quotes[1], index: index2 });
assert.equal(currentFirst[0].id, 'r-wart');
assert.equal(currentFirst[0].isCurrent, true);
assert.equal(currentFirst[0].linkedQuoteId, null);

// --- Tarjousehdokkaat raportille: vain tilatut/lähetetyt, sama asiakas, vapaat, tilatut ensin
const quoteCandidates = buildQuoteCandidates({
  quotes,
  report: { id: 'r-messu-new', customer_id: 'c-messu', owner_company_id: OWNER },
  index,
});
assert.deepEqual(
  quoteCandidates.map((q) => q.id),
  ['q-old', 'q-sent', 'q-linked', 'q-billing-only'],
  'ei luonnoksia, ei toisen yrityksen tarjouksia; tilattu ennen lähetettyä; linkitetyt viimeisenä',
);
assert.equal(quoteCandidates[2].linkedReportId, 'r-wart');
assert.equal(quoteCandidates[3].linkedReportId, 'r-kesko');

// --- Linkkisuunnitelma: vapaa tarjous vapaaseen raporttiin
const planFree = planQuoteLink({ quote: quotes[0], reportId: 'r-messu-new', index });
assert.deepEqual(planFree, {
  quoteId: 'q-old',
  reportId: 'r-messu-new',
  alreadyLinked: false,
  detachQuoteFromReportIds: [],
  detachOtherQuoteIds: [],
  marksOrdered: false,
});
assert.equal(
  quoteLinkConfirmMessage(planFree, { reportTitle: () => '', quoteTitle: () => '' }),
  null,
  'ei ristiriitoja → ei lisävaroitusta',
);

// Tarjous jo toisessa raportissa → siirretään (ei kahteen raporttiin)
const planMove = planQuoteLink({ quote: quotes[1], reportId: 'r-messu-new', index });
assert.deepEqual(planMove.detachQuoteFromReportIds, ['r-wart']);
assert.deepEqual(planMove.detachOtherQuoteIds, []);
// Raportilla jo toinen tarjous → korvataan (raportilla yksi tarjous)
const planReplace = planQuoteLink({ quote: quotes[0], reportId: 'r-wart', index });
assert.deepEqual(planReplace.detachOtherQuoteIds, ['q-linked']);
const msg = quoteLinkConfirmMessage(planReplace, {
  reportTitle: (id) => id,
  quoteTitle: (id) => (id === 'q-linked' ? 'Wärtsilä – Kompressori' : id),
  customerAlreadyBilled: true,
});
assert.match(msg, /Työraportilla on nyt tarjous "Wärtsilä – Kompressori" – se irrotetaan/);
assert.match(msg, /Asiakas on jo laskutettu/);
assert.match(msg, /Laskutettuja summia ei muuteta/);
// Vain raportin puolen linkki → tarjouksen puolen linkki puuttuu → ei "valmiina"
const planRepair = planQuoteLink({ quote: quotes[2], reportId: 'r-kesko', index });
assert.equal(planRepair.alreadyLinked, false, 'puolikas linkki korjataan');
assert.deepEqual(planRepair.detachQuoteFromReportIds, []);
// Molemmat puolet kunnossa → ei muutoksia
assert.equal(planQuoteLink({ quote: quotes[1], reportId: 'r-wart', index }).alreadyLinked, true);
// Lähetetty tarjous merkitään tilatuksi
const planSent = planQuoteLink({ quote: quotes[3], reportId: 'r-messu-new', index });
assert.equal(planSent.marksOrdered, true);
assert.match(quoteLinkConfirmMessage(planSent, { reportTitle: String, quoteTitle: String }), /merkitään tilatuksi/);

// --- Asiakas jo laskutettu
assert.equal(isCustomerAlreadyBilled({ reportStatus: 'billed_customer' }), true);
assert.equal(isCustomerAlreadyBilled({ customerInvoiceStatus: 'paid' }), true);
assert.equal(isCustomerAlreadyBilled({ customerInvoiceStatus: 'none', reportStatus: 'completed' }), false);

// --- billing_quote-snapshot kohdistuksessa (sama kuin tarjouksesta luodulla raportilla)
const quoteData = {
  ...createEmptyQuoteRequestData('huolto'),
  workItems: [{ id: 'w1', description: 'Huolto', hours: 8, pricePerHour: 65, materials: [] }],
  installationSupplies: [
    { id: 'dev-1', name: 'Laite', quantity: 1, purchasePrice: 1260, marginPercent: 30, sellPrice: 1638, rowKind: 'device' },
  ],
};
const fresh = billingQuoteForLinkedQuote({
  quote: { id: 'q-old', title: 'Messukeskus – Tarkkaamo 406', data: quoteData },
  previous: {},
  customerAlreadyBilled: false,
});
assert.equal(fresh.quote_request_id, 'q-old');
assert.equal(fresh.quote_title, 'Messukeskus – Tarkkaamo 406');
assert.equal(fresh.customer_mode, 'quote_fixed');
assert.equal(fresh.partner_commission_percent, 50, 'oletusprovisio kuten luonnissa');
assert.ok(fresh.quote_sale_net > 0);
assert.ok((fresh.purchase_lines ?? []).some((line) => /Laite/.test(line.label ?? line.description ?? line.name ?? JSON.stringify(line))));

// Vanha käsin syötetty tarjoushinta + provisio 40 % + huomio → hinnat tarjouksesta, provisio ja huomio säilyvät
const manual = billingQuoteForLinkedQuote({
  quote: { id: 'q-old', title: 'Messukeskus – Tarkkaamo 406', data: quoteData },
  previous: { quote_sale_net: 999, partner_commission_percent: 40, notes: 'hankintakorjaus', customer_mode: 'daily_log' },
  customerAlreadyBilled: false,
});
assert.equal(manual.quote_sale_net, fresh.quote_sale_net);
assert.equal(manual.partner_commission_percent, 40);
assert.equal(manual.notes, 'hankintakorjaus');
assert.equal(manual.customer_mode, 'quote_fixed');

// Asiakas jo laskutettu → asiakaslaskutus jää päiväkirjan mukaiseksi
const billed = billingQuoteForLinkedQuote({
  quote: { id: 'q-old', title: 'X', data: quoteData },
  previous: {},
  customerAlreadyBilled: true,
});
assert.equal(billed.customer_mode, 'daily_log');

// Sama tarjous uudelleen → lisätyöt säilyvät
const extra = [{ id: 'e1', description: 'Lisätyö', hours: 2, lines: [] }];
const relinked = billingQuoteForLinkedQuote({
  quote: { id: 'q-old', title: 'X', data: quoteData },
  previous: { ...fresh, extra_customer_work: extra },
  customerAlreadyBilled: false,
});
assert.equal(relinked.extra_customer_work?.length, 1);
assert.equal(relinked.extra_customer_work[0].id, 'e1');
assert.equal(relinked.extra_customer_work[0].hours, 2);

// --- Irrotus: tyhjennetään vain, jos raportti viittaa juuri tähän tarjoukseen
assert.deepEqual(billingQuoteAfterUnlink({ quote_request_id: 'q-old', quote_sale_net: 1 }, 'q-old'), {});
assert.equal(billingQuoteAfterUnlink({ quote_request_id: 'q-linked' }, 'q-old'), null);
assert.equal(billingQuoteAfterUnlink({}, 'q-old'), null);

console.log('test-quote-work-report-link: OK');
