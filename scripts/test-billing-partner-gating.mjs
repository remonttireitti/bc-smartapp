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

// Erillinen Kumppanilaskutus-sivu poistettu: ei ruutua eikä valikkokohtaa, reitti ohjaa Laskutukseen.
const base = { role: 'admin', isGlobalAdmin: false, globalAdminMode: false, billingModuleEnabled: true };
for (const p of [true, false, null]) {
  assert.ok(!buildHallintaGroups({ ...base, partnershipsEnabled: p }).flatMap((g) => g.tiles).some((t) => t.href.includes('kumppanilaskutus')));
  assert.ok(!hallintaNavChildren({ ...base, partnershipsEnabled: p }).some((c) => c.href.includes('kumppanilaskutus')));
}

// Tarjoamispaikat käyttävät yhteistä kuvausta.
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
for (const p of ['components/CompanySignupForm.tsx', 'pages/globalAdmin/CompanyModulesEditor.tsx', 'lib/priceListAdmin.ts', 'pages/BillingPage.tsx']) {
  assert.match(src(p), /BILLING_MODULE_DESCRIPTION|MODULE_DESCRIPTIONS/, p);
}
// Riippuvuushuomautus (MODULE_NOTES.billing) piiloutuu, kun Kumppanuudet on valittu.
assert.match(src('components/CompanySignupForm.tsx'), /k === 'billing' && form\.modules\.partners \? null : MODULE_NOTES\[k\]/);
// Työraportti, lista, yhteenveto ja tuloste tarkistavat Kumppanuudet-moduulin.
assert.match(src('pages/WorkReportDetailPage.tsx'), /const partnerBillingOn = partnershipsEnabled === true;/);
assert.match(src('components/ReportListItem.tsx'), /&& partnershipsEnabled\n/);
assert.match(src('routes/authenticatedRoutes.tsx'), /path: 'kumppanilaskutus', element: <Navigate to="\/laskutus" replace \/>/);
assert.match(src('pages/BillingPage.tsx'), /partnershipsEnabled=\{partnershipsEnabled === true\}/);
assert.match(src('lib/workReportPrintAction.ts'), /loadCompanyPartnershipsEnabled/);
assert.match(src('routes/authenticatedRoutes.tsx'), /<PartnershipsModuleGate session=\{session\}>/);
console.log('billing-partner-gating: ok');
