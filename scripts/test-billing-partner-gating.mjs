import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHallintaGroups, hallintaNavChildren } from '../src/lib/hallintaNav.ts';
import {
  BILLING_MODULE_DESCRIPTION,
  LICENSE_MODULE_DESCRIPTIONS,
  PARTNER_BILLING_REQUIRES_PARTNERS,
} from '../src/lib/companyLicense.ts';

// Lyhyt kuvaus: ei laskujen lähetystä, sama teksti kaikkialla.
assert.equal(LICENSE_MODULE_DESCRIPTIONS.billing, BILLING_MODULE_DESCRIPTION);
assert.match(BILLING_MODULE_DESCRIPTION, /ei laskujen lähetystä/);
assert.ok(BILLING_MODULE_DESCRIPTION.length <= 80);
assert.match(PARTNER_BILLING_REQUIRES_PARTNERS, /Kumppanuudet/);

// Kumppanilaskutus vain, kun Kumppanuudet on varmasti päällä (ei latauksen aikana).
const base = { role: 'admin', isGlobalAdmin: false, globalAdminMode: false, billingModuleEnabled: true };
const has = (p) => buildHallintaGroups({ ...base, partnershipsEnabled: p }).flatMap((g) => g.tiles).some((t) => t.href === '/hallinta/kumppanilaskutus');
assert.equal(has(true), true);
assert.equal(has(false), false);
assert.equal(has(null), false);
const child = (p) => hallintaNavChildren({ ...base, partnershipsEnabled: p }).some((c) => c.href === '/hallinta/kumppanilaskutus');
assert.equal(child(false), false);
assert.equal(child(null), false);

// Tarjoamispaikat käyttävät yhteistä kuvausta.
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
for (const p of ['components/CompanySignupForm.tsx', 'pages/globalAdmin/CompanyModulesEditor.tsx', 'lib/priceListAdmin.ts', 'pages/BillingPage.tsx']) {
  assert.match(src(p), /BILLING_MODULE_DESCRIPTION/, p);
}
assert.match(src('components/CompanySignupForm.tsx'), /!form\.modules\.partners && .*PARTNER_BILLING_REQUIRES_PARTNERS/);
// Työraportti, lista, yhteenveto ja tuloste tarkistavat Kumppanuudet-moduulin.
assert.match(src('pages/WorkReportDetailPage.tsx'), /const partnerBillingOn = partnershipsEnabled === true;/);
assert.match(src('components/ReportListItem.tsx'), /&& partnershipsEnabled\n/);
assert.match(src('pages/WorkReportBillingSummaryPage.tsx'), /partnershipsEnabled !== true/);
assert.match(src('lib/workReportPrintAction.ts'), /loadCompanyPartnershipsEnabled/);
assert.match(src('routes/authenticatedRoutes.tsx'), /<PartnershipsModuleGate session=\{session\}>/);
console.log('billing-partner-gating: ok');
