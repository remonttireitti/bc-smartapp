import assert from 'node:assert/strict';
import {
  buildLampokatsastusQuoteFooterHtml,
  buildLampokatsastusQuoteHeaderHtml,
  buildLampokatsastusQuoteTaglineHtml,
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
assert.equal(isLampokatsastusCompanyName('Muu Oy'), false);

const quoteHeader = buildLampokatsastusQuoteHeaderHtml(
  { companyName: 'Lämpökatsastus Oy', logoUrl: 'https://example.com/logo.png', settings },
  { esc, attrUrl, logoSrc: 'https://example.com/logo.png' },
);
assert.match(quoteHeader, /lk-header--quote/);
assert.match(quoteHeader, /logo\.png/);
assert.doesNotMatch(quoteHeader, /lk-tagline/);
assert.doesNotMatch(quoteHeader, /Kuismatie 120/);

const tagline = buildLampokatsastusQuoteTaglineHtml({ esc });
assert.match(tagline, /lk-tagline/);
assert.match(tagline, /Valitse Lämpökatsastus Oy/);

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
    optionalItems: [],
    notes: '',
    validUntil: '2026-12-31',
  },
  customer: { name: 'Testi Oy' },
  meta: {
    companyName: 'Lämpökatsastus Oy',
    settings,
  },
  mode: 'enduser',
});

assert.match(html, /quote-print-end-block/);
assert.match(html, /page-break-inside:\s*avoid/);
assert.match(html, /break-inside:\s*avoid/);
assert.match(html, /lk-tagline/);
assert.match(html, /Kiitos tarjouspyynnöstänne/);
assert.match(html, /Huoltoehdot/);
assert.match(html, /quote-print-end-block[\s\S]*class="lk-tagline"/);
const headerMatch = html.match(/<header class="lk-header lk-header--quote">[\s\S]*?<\/header>/);
assert.ok(headerMatch);
assert.doesNotMatch(headerMatch[0], /class="lk-tagline"/);

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
assert.match(workHeader, /lk-tagline/);

console.log('test-lampokatsastus-branding.mjs: OK');
