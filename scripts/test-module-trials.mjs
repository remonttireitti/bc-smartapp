import assert from 'node:assert/strict';
import { huoltoAccess, parseHuoltoSettings } from '../src/lib/huoltoCategories.ts';
import {
  formatTrialEnd,
  moduleTrialUnlocks,
  ownCompanyTrialUnlockedKeys,
  parseModuleTrials,
  setOwnCompanyModuleTrials,
} from '../src/lib/moduleTrials.ts';
import { partnershipsModuleLicensed } from '../src/lib/partnershipsModule.ts';
import { parseCompanyLicenseSnapshot, isLicenseModuleAccessible } from '../src/lib/companyLicense.ts';

const day = 86400000;
const future = new Date(Date.now() + 5 * day).toISOString();
const past = new Date(Date.now() - day).toISOString();

const trials = parseModuleTrials([
  { module_key: 'quotes', starts_at: past, ends_at: future, active: true, keep_after: false },
  { module_key: 'lvi', starts_at: past, ends_at: future, active: true, keep_after: false },
  { module_key: 'tools', starts_at: past, ends_at: past, active: false, keep_after: false },
  { module_key: 'partners', starts_at: past, ends_at: past, active: false, keep_after: true },
  { module_key: 'bogus', starts_at: past, ends_at: future },
]);
assert.equal(trials.length, 4);
assert.deepEqual(trials.filter(moduleTrialUnlocks).map((t) => t.module_key), ['quotes', 'lvi', 'partners']);

// Huolto: LVI-kokeilu avaa lajin, vaikka asetuksissa pois.
const settings = parseHuoltoSettings({ huolto: { enabled: true, types: { pakastin: { enabled: true } } } });
assert.equal(huoltoAccess(settings).isCategoryEnabled('lvi'), false);
setOwnCompanyModuleTrials(trials);
assert.ok(ownCompanyTrialUnlockedKeys().has('lvi'));
const withTrial = huoltoAccess(settings, ownCompanyTrialUnlockedKeys());
assert.equal(withTrial.isCategoryEnabled('lvi'), true);
assert.equal(withTrial.isCategoryEnabled('iv'), false);
assert.equal(withTrial.isTypeEnabled('pakastin'), true);

// Kumppanuudet: jatkoon tilattu kokeilu avaa, vaikka lisenssissä pois.
assert.equal(partnershipsModuleLicensed({ license: { modules: { partners: false } } }), true);
setOwnCompanyModuleTrials([]);
assert.equal(partnershipsModuleLicensed({ license: { modules: { partners: false } } }), false);

// Snapshot: module_trials jäsentyy, puuttuva = [] (ennen SQL-ajoa).
const snap = parseCompanyLicenseSnapshot({ enrollment: 'subscription', base_active: true, modules: { quotes: true }, module_trials: trials });
assert.equal(snap.module_trials.length, 4);
assert.equal(isLicenseModuleAccessible(snap, 'quotes'), true);
assert.deepEqual(parseCompanyLicenseSnapshot({ base_active: true }).module_trials, []);

assert.equal(formatTrialEnd('2026-11-07T18:00:00Z'), '07.11.2026');
assert.equal(formatTrialEnd('2026-10-31T22:30:00Z'), '01.11.2026'); // Suomen aika
console.log('module trials ok');
