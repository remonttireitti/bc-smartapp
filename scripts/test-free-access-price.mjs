import assert from 'node:assert/strict';
import { parseBreakdown, isFreeAccessSettings } from '../src/lib/companyMonthlyPrice.ts';
import { parseCompanyLicenseSnapshot, LICENSE_MODULE_LABELS } from '../src/lib/companyLicense.ts';
import { ADDON_MODULE_LABELS } from '../supabase/functions/_shared/companySignupCore.ts';

// Ilmainen käyttöoikeus: vanha SQL palauttaa listahinnan 189 € → näytetään 0 €.
const legacy = parseBreakdown({
  basis: 'legacy',
  lines: [{ key: 'base', label: 'Peruspaketti', qty: 1, unit: 49, total: 49 }, { key: 'module:quotes', label: 'Tarjoukset', qty: 1, unit: 10, total: 10 }],
  net: 189, vat: 48.2, gross: 237.2,
});
assert.equal(legacy.net, 0);
assert.equal(legacy.vat, 0);
assert.equal(legacy.gross, 0);
assert.deepEqual(legacy.lines.map((l) => [l.label, l.total]), [['Ilmainen käyttöoikeus (toistaiseksi)', 0]]);

// Muut ennallaan (Uudenmaan Kylmähuolto 104 €), vanha nimi vaihtuu uuteen.
const sub = parseBreakdown({
  basis: 'selection',
  lines: [
    { key: 'base', label: 'Peruspaketti', qty: 1, unit: 49, total: 49 },
    { key: 'module:quotes', label: 'Tarjoukset', qty: 1, unit: 10, total: 10 },
    { key: 'trial:quotes', label: 'Tarjoukset — kokeilu päättyy 31.10.2026', qty: 1, unit: 0, total: 0 },
    { key: 'module:billing', label: 'Laskutus', qty: 1, unit: 10, total: 10 },
  ],
  net: 104, vat: 26.52, gross: 130.52,
});
assert.equal(sub.net, 104);
assert.equal(sub.gross, 130.52);
assert.equal(sub.lines[1].label, 'Tarjouspyynnöt ja laskennat');
assert.equal(sub.lines[2].label, 'Tarjouspyynnöt ja laskennat — kokeilu päättyy 31.10.2026');
assert.equal(sub.lines[3].label, 'Laskutus');

assert.equal(isFreeAccessSettings({ license: { enrollment: 'legacy' } }), true);
assert.equal(isFreeAccessSettings({ license: { enrollment: 'subscription' } }), false);
assert.equal(isFreeAccessSettings(null), false);

const snapLegacy = parseCompanyLicenseSnapshot({ enrollment: 'legacy', effective_status: 'active', pricing: { estimated_monthly_total_eur: 189, estimated_period_total_eur: 189 } });
assert.equal(snapLegacy.pricing.estimated_monthly_total_eur, 0);
assert.equal(snapLegacy.pricing.estimated_period_total_eur, 0);
const snapSub = parseCompanyLicenseSnapshot({ enrollment: 'subscription', effective_status: 'active', pricing: { estimated_monthly_total_eur: 104, estimated_period_total_eur: 593.82 } });
assert.equal(snapSub.pricing.estimated_monthly_total_eur, 104);
assert.equal(snapSub.pricing.estimated_period_total_eur, 593.82);

assert.equal(ADDON_MODULE_LABELS.quotes, 'Tarjouspyynnöt ja laskennat');
assert.equal(LICENSE_MODULE_LABELS.quotes, 'Tarjouspyynnöt ja laskennat');
console.log('free-access-price ok');
