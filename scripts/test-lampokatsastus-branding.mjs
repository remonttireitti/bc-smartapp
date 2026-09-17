import assert from 'node:assert/strict';
import {
  buildLampokatsastusQuoteHeaderHtml,
  buildLampokatsastusWorkReportHeaderHtml,
  isLampokatsastusCompanyName,
  LAMPOKATSASTUS_MARKETING_TAGLINE,
} from '../src/lib/lampokatsastusBranding.ts';

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
assert.match(quoteHeader, /lk-header/);
assert.match(quoteHeader, /lk-tagline/);
assert.match(quoteHeader, /Valitse Lämpökatsastus Oy/);
assert.match(quoteHeader, /Kuismatie 120/);
assert.match(quoteHeader, /logo\.png/);

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
assert.match(workHeader, /Huolto asiakkaalle/);
assert.match(workHeader, /lk-tagline/);

console.log('test-lampokatsastus-branding.mjs: OK');
