// Renderöi huoltopöytäkirjan esimerkkituloste (PDF + PNG) mock-datalla: npx tsx scripts/print-sample.mjs [out.pdf] [rich]
import { chromium } from '/workspace/pw/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { buildG426Report, buildTypeReport } from './print-sample-data.ts';
import { generateMaintenanceReportPrintDocument } from '../src/lib/huoltoRaportti/maintenanceReportPrintHtml.ts';

const out = process.argv[2] || '/workspace/print_sample_new.pdf';
const rich = process.argv[3] === 'rich';
const typeArg = process.argv[3]?.startsWith('type:') ? process.argv[3].slice(5) : '';
const data = typeArg ? buildTypeReport(typeArg) : buildG426Report(rich);
// 1x1 px logo + brändiväri (oikeassa tulosteessa tulee yrityksen logosta)
const logo = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="48"><rect width="48" height="48" rx="8" fill="#0b6e8a"/><path d="M24 8v32M10 16l28 16M38 16L10 32" stroke="#fff" stroke-width="3"/><text x="58" y="31" font-family="Arial" font-weight="700" font-size="22" fill="#0b6e8a">UKH</text></svg>');
const html = generateMaintenanceReportPrintDocument(data, { companyName: 'Uudenmaan Kylmähuolto Oy', logoUrl: logo, brandColor: '#0b6e8a', imageUrls: {} });
const doc = html; // sama täysi dokumentti kuin oikeassa tulostuksessa (ensurePrintHtmlDocumentTitle)
writeFileSync(out.replace(/\.pdf$/, '.html'), doc);
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(doc);
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close();
console.log('ok', out);
