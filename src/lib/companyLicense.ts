export type LicenseModuleKey = 'base' | 'quotes' | 'billing' | 'remote_monitoring' | 'tools';

export type LicenseEffectiveStatus = 'pending_trial' | 'trial' | 'active' | 'expired';

export type CompanyLicenseSnapshot = {
  enrollment: 'subscription' | 'legacy' | string;
  status: string;
  effective_status: LicenseEffectiveStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_days: number;
  base_active: boolean;
  modules: Record<Exclude<LicenseModuleKey, 'base'>, boolean>;
  pricing: {
    base_monthly_eur: number;
    module_prices: Record<string, number>;
    estimated_monthly_total_eur: number;
  };
  usage_this_month: Array<{
    module_key: string;
    access_count: number;
    last_accessed_at: string | null;
  }>;
};

export const LICENSE_MODULE_LABELS: Record<LicenseModuleKey, string> = {
  base: 'Peruspaketti',
  quotes: 'Tarjoukset',
  billing: 'Laskutus',
  remote_monitoring: 'Etäseuranta',
  tools: 'Työkalut',
};

export const LICENSE_MODULE_DESCRIPTIONS: Record<LicenseModuleKey, string> = {
  base: 'Työraportit, varasto, huoltoraportit, asiakas- ja laiterekisteri',
  quotes: 'Tarjouspyynnöt, laskelmat ja tulosteet',
  billing: 'Laskutettavat summat ja kumppanilaskutus',
  remote_monitoring: 'Lämpötilaseuranta ja etäohjaus',
  tools: 'Työkaluinventaario',
};

export const LICENSE_MODULE_HREFS: Record<LicenseModuleKey, string[]> = {
  base: ['/tyoraportit', '/varasto', '/huoltoraportit', '/asiakkaat'],
  quotes: ['/tarjouspyynnot'],
  billing: ['/laskutus', '/hallinta/kumppanilaskutus'],
  remote_monitoring: ['/etaseuranta', '/lampotila'],
  tools: ['/tyokalut'],
};

const MODULE_BY_PATH_PREFIX: Array<{ prefix: string; module: LicenseModuleKey }> = [
  { prefix: '/laskutus', module: 'billing' },
  { prefix: '/hallinta/kumppanilaskutus', module: 'billing' },
  { prefix: '/tarjouspyynnot', module: 'quotes' },
  { prefix: '/etaseuranta', module: 'remote_monitoring' },
  { prefix: '/lampotila', module: 'remote_monitoring' },
  { prefix: '/tyokalut', module: 'tools' },
  { prefix: '/tyoraportit', module: 'base' },
  { prefix: '/varasto', module: 'base' },
  { prefix: '/huoltoraportit', module: 'base' },
  { prefix: '/asiakkaat', module: 'base' },
];

export function licenseModuleForPath(pathname: string): LicenseModuleKey | null {
  for (const entry of MODULE_BY_PATH_PREFIX) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      return entry.module;
    }
  }
  return null;
}

export function isLicenseModuleAccessible(
  snapshot: CompanyLicenseSnapshot | null,
  moduleKey: LicenseModuleKey,
): boolean {
  if (!snapshot) return true;
  if (snapshot.enrollment === 'legacy') return true;
  if (moduleKey === 'base') return snapshot.base_active;
  return !!snapshot.modules[moduleKey];
}

export function formatLicenseMoney(value: number) {
  return `${value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kk`;
}

export function trialDaysRemaining(snapshot: CompanyLicenseSnapshot | null): number | null {
  if (!snapshot || snapshot.effective_status !== 'trial' || !snapshot.trial_ends_at) return null;
  const ends = new Date(snapshot.trial_ends_at).getTime();
  const diff = Math.ceil((ends - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 0);
}

export function parseCompanyLicenseSnapshot(raw: unknown): CompanyLicenseSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const modulesRaw = (row.modules as Record<string, unknown> | undefined) ?? {};
  const pricingRaw = (row.pricing as Record<string, unknown> | undefined) ?? {};
  const modulePricesRaw = (pricingRaw.module_prices as Record<string, unknown> | undefined) ?? {};

  return {
    enrollment: String(row.enrollment ?? 'subscription'),
    status: String(row.status ?? 'pending_trial'),
    effective_status: String(row.effective_status ?? 'pending_trial') as LicenseEffectiveStatus,
    trial_started_at: typeof row.trial_started_at === 'string' ? row.trial_started_at : null,
    trial_ends_at: typeof row.trial_ends_at === 'string' ? row.trial_ends_at : null,
    trial_days: Number(row.trial_days ?? 30),
    base_active: row.base_active === true,
    modules: {
      quotes: modulesRaw.quotes === true,
      billing: modulesRaw.billing === true,
      remote_monitoring: modulesRaw.remote_monitoring === true,
      tools: modulesRaw.tools === true,
    },
    pricing: {
      base_monthly_eur: Number(pricingRaw.base_monthly_eur ?? 0),
      module_prices: Object.fromEntries(
        Object.entries(modulePricesRaw).map(([key, value]) => [key, Number(value ?? 0)]),
      ),
      estimated_monthly_total_eur: Number(pricingRaw.estimated_monthly_total_eur ?? 0),
    },
    usage_this_month: Array.isArray(row.usage_this_month)
      ? row.usage_this_month.map((entry) => {
          const item = entry as Record<string, unknown>;
          return {
            module_key: String(item.module_key ?? ''),
            access_count: Number(item.access_count ?? 0),
            last_accessed_at:
              typeof item.last_accessed_at === 'string' ? item.last_accessed_at : null,
          };
        })
      : [],
  };
}
