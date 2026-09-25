/**
 * Tarjouspyynnön ja siitä luodun työraportin otsikko:
 * asiakas + " – " + "Tarjouksen otsikko" (huolto/korjaus). Tyhjä / oletusteksti → ennallaan.
 */
import assert from 'node:assert/strict';
import {
  quoteCustomTitleText,
  quoteRequestStoredTitle,
  quoteTitleSubject,
  resolveQuoteDisplayTitle,
} from '../src/lib/quoteRequest/title.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import {
  buildWorkReportPayloadFromQuote,
  buildWorkReportTitleFromQuote,
} from '../src/lib/quoteRequest/createWorkReportFromQuote.ts';

const huolto = createEmptyQuoteRequestData('huolto');
// Oletus-introText ei ole oma otsikko
assert.equal(quoteCustomTitleText(huolto), '');
assert.equal(quoteTitleSubject(huolto), 'Tarjous huollosta tai korjauksesta');
assert.equal(
  quoteRequestStoredTitle('Messukeskus', quoteTitleSubject(huolto)),
  'Messukeskus – Tarjous huollosta tai korjauksesta',
);

const custom = { ...huolto, introText: '  Tarkkaamo 406   laitteen korjaus ' };
assert.equal(quoteCustomTitleText(custom), 'Tarkkaamo 406 laitteen korjaus');
assert.equal(
  quoteRequestStoredTitle('Messukeskus', quoteTitleSubject(custom)),
  'Messukeskus – Tarkkaamo 406 laitteen korjaus',
);
// Näyttöotsikko (listat, otsikko, tuloste)
assert.equal(
  resolveQuoteDisplayTitle({ customerName: 'Messukeskus', quoteTypeLabel: quoteTitleSubject(custom) }),
  'Messukeskus – Tarkkaamo 406 laitteen korjaus',
);
// Vanha tallennettu otsikko ilman asiakasrelaatiota → ei ketjuunnu
assert.equal(
  resolveQuoteDisplayTitle({
    storedTitle: 'Messukeskus – Tarjous huollosta tai korjauksesta',
    quoteTypeLabel: quoteTitleSubject(custom),
  }),
  'Messukeskus – Tarkkaamo 406 laitteen korjaus',
);
assert.equal(
  resolveQuoteDisplayTitle({
    storedTitle: 'Messukeskus – Tarkkaamo 406 laitteen korjaus',
    quoteTypeLabel: quoteTitleSubject(custom),
  }),
  'Messukeskus – Tarkkaamo 406 laitteen korjaus',
);
// Ei asiakasnimen toistoa
const prefixed = { ...huolto, introText: 'Messukeskus – Tarkkaamo 406 laitteen korjaus' };
assert.equal(
  quoteRequestStoredTitle('Messukeskus', quoteTitleSubject(prefixed)),
  'Messukeskus – Tarkkaamo 406 laitteen korjaus',
);
assert.equal(
  quoteRequestStoredTitle('Messukeskus', quoteTitleSubject({ ...huolto, introText: 'messukeskus: tarkkaamo' })),
  'messukeskus: tarkkaamo',
);
// "Messukeskuksen ..." ei ole sama nimi → etuliite lisätään
assert.equal(
  quoteRequestStoredTitle('Messukeskus', quoteTitleSubject({ ...huolto, introText: 'Messukeskuksen tarkkaamo' })),
  'Messukeskus – Messukeskuksen tarkkaamo',
);
// Pumpputarjouksissa introText on johdantoteksti → otsikko ennallaan
const pump = { ...createEmptyQuoteRequestData('ilma-ilma'), introText: 'ILK 22A korjaukset' };
assert.equal(quoteTitleSubject(pump), 'Ilmalämpöpumppu');

// --- Työraportti tarjouksesta
const quote = (data, title = 'Messukeskus – Tarjous huollosta tai korjauksesta') => ({
  id: 'q1',
  title,
  data,
  customer_id: 'c1',
  owner_company_id: 'o1',
  created_by_company_id: 'o1',
  branding_company_id: 'o1',
  partnership_id: null,
  subscriber_id: null,
});
const p1 = buildWorkReportPayloadFromQuote({ quote: quote(custom), customer: { name: 'Messukeskus' }, sessionUserId: 'u' });
assert.equal(p1.title, 'Messukeskus – Tarkkaamo 406 laitteen korjaus');
assert.equal(p1.heading, custom.introText.trim(), 'Otsikko-kenttä = Tarjouksen otsikko (tuloste: sama otsikko)');
const p2 = buildWorkReportPayloadFromQuote({ quote: quote(prefixed), customer: { name: 'Messukeskus' }, sessionUserId: 'u' });
assert.equal(p2.title, 'Messukeskus – Tarkkaamo 406 laitteen korjaus');
// Ei asiakasta → pelkkä oma otsikko
assert.equal(
  buildWorkReportTitleFromQuote({ customerName: '', data: custom, heading: null, description: null, quoteTitle: 'x' }),
  'Tarkkaamo 406 laitteen korjaus',
);
// Tyhjä oma otsikko → oletus (asiakas – tarjouksen otsikko)
const p3 = buildWorkReportPayloadFromQuote({ quote: quote(huolto), customer: { name: 'Messukeskus' }, sessionUserId: 'u' });
assert.equal(p3.title, 'Messukeskus – Tarjous huollosta tai korjauksesta');

console.log('test-quote-title-custom: OK');
