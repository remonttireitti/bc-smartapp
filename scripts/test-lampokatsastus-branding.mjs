import assert from 'node:assert/strict';
import {
  buildLampokatsastusQuoteFooterHtml,
  buildLampokatsastusQuoteHeaderHtml,
  buildLampokatsastusWorkReportHeaderHtml,
  isLampokatsastusCompanyName,
  LAMPOKATSASTUS_SERVICE_TERMS_BODY,
  LAMPOKATSASTUS_SERVICE_TERMS_TITLE_SUFFIX,
} from '../src/lib/lampokatsastusBranding.ts';
import { generateQuoteServicePrintHtml } from '../src/lib/quoteRequest/printHtml.ts';

const esc = (value) => String(value ?? '');
const attrUrl = (url) => String(url).replace(/"/g, '&quot;');

const settings = {
  address: 'Kuismatie 120',
  postal_code: '01390',
  city: 'Vantaa',
  phone: '040 522 5257',
  email: 'info@lampokatsastus.fi',
  website: 'https://www.lampokatsastus.fi/',
  billing: { business_id: '2908079-6' },
};

assert.equal(isLampokatsastusCompanyName('Lämpökatsastus Oy'), true);

const quoteHeader = buildLampokatsastusQuoteHeaderHtml(
  { companyName: 'Lämpökatsastus Oy', logoUrl: 'https://example.com/logo.png', settings },
  { esc, attrUrl, logoSrc: 'https://example.com/logo.png' },
);
assert.match(quoteHeader, /lk-header--quote/);
assert.match(quoteHeader, /lk-tagline/);
assert.match(quoteHeader, /Valitse Lämpökatsastus Oy/);
assert.match(quoteHeader, /logo\.png/);

const quoteFooter = buildLampokatsastusQuoteFooterHtml(
  { companyName: 'Lämpökatsastus Oy', settings },
  {
    esc,
    termsTitleSuffix: LAMPOKATSASTUS_SERVICE_TERMS_TITLE_SUFFIX,
    termsBody: LAMPOKATSASTUS_SERVICE_TERMS_BODY,
  },
);
assert.match(quoteFooter, /lk-footer/);
assert.match(quoteFooter, /Huoltoehdot/);
assert.match(quoteFooter, /Kuismatie 120/);

const html = generateQuoteServicePrintHtml({
  data: {
    type: 'huolto',
    quoteVatProfile: 'business',
    vatRate: 0,
    introText: 'Ilmalämpöpumpun huolto',
    faultDescription: 'Vuosihuolto',
    workItems: [],
    materials: [],
    installationSupplies: [],
    optionalItems: [{ id: 'o1', description: 'Desinfiointi', priceGross: 80, enabled: true }],
    excludedFromQuoteItems: [{ id: 'e1', text: 'Öljynvaihto' }],
    notes: 'Ensimmäinen huomio\nToinen huomio',
    deliveryTermsText: 'Salainen toimitusehto',
    paymentTermsText: 'Salainen maksuehto',
    validUntil: '2026-12-31',
  },
  customer: { name: 'Testi Oy' },
  meta: {
    companyName: 'Lämpökatsastus Oy',
    settings,
  },
  mode: 'enduser',
});

assert.match(html, /quote-print-page-2/);
assert.match(html, /page-break-before:\s*always/);
assert.match(html, /lk-tagline/);
assert.match(html, /Kiitos tarjouspyynnöstänne/);
assert.match(html, /Huoltoehdot/);
assert.match(html, /Ei kuulu tarjoukseen/);
assert.match(html, /Tilattavissa lisänä/);
assert.match(html, /<li>Ensimmäinen huomio<\/li>/);
assert.match(html, /<li>Toinen huomio<\/li>/);
assert.match(html, /Toimitusehdot/);
assert.match(html, /Salainen toimitusehto/);
assert.match(html, /Maksuehdot/);
assert.match(html, /Salainen maksuehto/);
assert.match(html, /--quote-tagline-font-size/);
assert.match(html, /--quote-closing-font-size/);
assert.match(html, /text-align:\s*center/);

const headerMatch = html.match(/<header class="lk-header lk-header--quote">[\s\S]*?<\/header>/);
assert.ok(headerMatch);
assert.match(headerMatch[0], /class="lk-tagline"/);

const page1BeforeBreak = html.split(/quote-print-page-2/)[0] ?? '';
assert.doesNotMatch(page1BeforeBreak, /Kiitos tarjouspyynnöstänne/);

const page2Match = html.match(/quote-print-page-2[\s\S]*lk-footer/);
assert.ok(page2Match);
assert.match(page2Match[0], /Ei kuulu tarjoukseen/);
assert.match(page2Match[0], /Huomautukset/);
assert.match(page2Match[0], /Toimitusehdot/);
assert.match(page2Match[0], /Maksuehdot/);
assert.match(page2Match[0], /Kiitos tarjouspyynnöstänne/);
const notesIdx = page2Match[0].indexOf('Huomautukset');
const thanksIdx = page2Match[0].indexOf('Kiitos tarjouspyynnöstänne');
assert.ok(notesIdx >= 0 && thanksIdx > notesIdx, 'closing should follow notes on page 2');

const workHeader = buildLampokatsastusWorkReportHeaderHtml(
  { companyName: 'Lämpökatsastus Oy', logoUrl: 'https://example.com/logo.png', settings },
  {
    esc,
    attrUrl,
    logoSrc: 'https://example.com/logo.png',
    printHeadline: 'Huolto asiakkaalle',
    printDate: '17.9.2026',
  },
);
assert.match(workHeader, /lk-work-title-row/);

console.log('test-lampokatsastus-branding.mjs: OK');
