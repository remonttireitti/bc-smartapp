import { ownCompanyTrialUnlockedKeys } from './moduleTrials';

/** Kumppanuudet-lisenssimoduuli: companies.settings.license.modules.partners (sama avain kuin CompanyModulesEditorissa). */
export const PARTNERS_MODULE_KEY = 'partners' as const;

function rec(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/**
 * Onko Kumppanuudet-moduuli lisensoitu. Vanha sopimus (legacy) tai puuttuva avain = päällä,
 * sama sääntö kuin SQL:n company_partnerships_enabled.
 */
export function partnershipsModuleLicensed(companySettings: unknown): boolean {
  const license = rec(rec(companySettings)?.license);
  if (license?.enrollment === 'legacy') return true;
  // Moduulikokeilu (oma yritys) avaa kuten SQL company_partnerships_enabled.
  if (ownCompanyTrialUnlockedKeys().has(PARTNERS_MODULE_KEY)) return true;
  const v = rec(license?.modules)?.[PARTNERS_MODULE_KEY];
  return v === undefined || v === null ? true : v === true;
}

/** Näkyvätkö kumppanitoiminnot: moduuli lisensoitu JA yrityksen kytkin päällä. */
export function partnershipsFeatureEnabled(companySettings: unknown): boolean {
  return partnershipsModuleLicensed(companySettings) && rec(companySettings)?.partnerships_enabled === true;
}
