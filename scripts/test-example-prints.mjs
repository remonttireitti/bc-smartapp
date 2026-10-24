import '../src/lib/workReportBilling.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChecklistExampleDocument } from '../src/lib/huoltoChecklist/exampleDocument.ts';
const buildExamplePrintDocument = (k, now) => buildChecklistExampleDocument(k, now);
import { EXAMPLE_PRINTS, examplePrintHref, isExamplePrintKey } from '../src/lib/examplePrints.ts';
import { buildChecklistExampleReport } from '../src/lib/huoltoChecklist/examples.ts';
import { checklistSummary, checklistFindings } from '../src/lib/huoltoChecklist/logic.ts';
import { extractPrintableHtmlFragment } from '../src/lib/printDocumentShell.ts';
import { routeHidesSidebar } from '../src/lib/mainNav.ts';

const now = new Date('2026-10-17T10:00:00');
assert.deepEqual(EXAMPLE_PRINTS.map((p) => p.key), ['konvektori', 'lvi', 'iv', 'sahko']);
assert.equal(isExamplePrintKey('lvi'), true);
assert.equal(isExamplePrintKey('x'), false);
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
assert.ok(!sitemap.includes('/login'), 'login ei sitemapissa');

for (const p of EXAMPLE_PRINTS) {
  // Esimerkkisivujen canonical = etusivu → ei sitemapissa.
  assert.ok(!sitemap.includes(`https://bestcool.eu${examplePrintHref(p.key)}`), `${p.key}: ei sitemapissa`);
  assert.equal(routeHidesSidebar(examplePrintHref(p.key)), true);
  if (p.key === 'konvektori') continue; // konvektoridata: test:konvektori-example-print
  const { html, documentTitle } = buildExamplePrintDocument(p.key, now);
  const fragment = extractPrintableHtmlFragment(html);
  assert.match(fragment, /<style/, `${p.key}: tyylit säilyvät tulostesivulla`);
  assert.match(documentTitle, /^Esimerkki/);
  assert.ok(!/undefined|NaN|\[object/.test(fragment), `${p.key}: ei rikkinäisiä arvoja`);
  // Esimerkkisivujen canonical = etusivu → ei sitemapissa.
  assert.ok(!sitemap.includes(`https://bestcool.eu${examplePrintHref(p.key)}`), `${p.key}: ei sitemapissa`);
  assert.equal(routeHidesSidebar(examplePrintHref(p.key)), true);
}

// Tarkastuslistat: keksitty asiakas, realistinen tulos.
const expect = { lvi: 'huom', iv: 'huom', sahko: 'vika' };
for (const [cat, overall] of Object.entries(expect)) {
  const data = buildChecklistExampleReport(cat, now);
  assert.equal(data.asiakas, 'As Oy Esimerkkipuisto');
  assert.equal(checklistSummary(data).overall, overall, cat);
  assert.equal(data.seuraavaHuolto, '2027-10-17');
  const html = buildExamplePrintDocument(cat, now).html;
  assert.match(html, /As Oy Esimerkkipuisto/);
  assert.match(html, /Esimerkki asentaja/);
  for (const f of checklistFindings(data)) {
    if (f.comment && !f.itemId.startsWith('circuit:')) assert.ok(html.includes(f.comment.split(' · ')[0].replace(/&/g, '&amp;')), `${cat}: ${f.label}`);
  }
}
// LVI: kierron paluu 48 °C < 50 °C nousee huomautukseksi mittauksesta.
assert.ok(checklistFindings(buildChecklistExampleReport('lvi', now)).some((f) => f.itemId === 'lkv_kierto' && f.status === 'huom'));
// Sähkö: ryhmä RK1/5 riso 0,6 MΩ → vika ryhmätaulukossa.
assert.ok(checklistFindings(buildChecklistExampleReport('sahko', now)).some((f) => f.itemId === 'circuit:c3:riso'));
assert.match(buildExamplePrintDocument('sahko', now).html, /SFS 6000/);
assert.match(buildExamplePrintDocument('iv', now).html, /Lämpötilasuhde 74 %/);
console.log('example-prints: ok');
