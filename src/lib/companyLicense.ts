export type LicenseModuleKey = 'base' | 'quotes' | 'billing' | 'remote_monitoring' | 'tools';

export type LicenseEffectiveStatus = 'pending_trial' | 'trial' | 'active' | 'expired';

export type LicenseBillingInterval = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export type LicensePaymentStatus = 'none' | 'awaiting_payment' | 'paid' | 'overdue';

export type CompanySubscriptionOrder = {
  submitted_at: string;
  submitted_by?: string;
  base_active: boolean;
  modules: Record<Exclude<LicenseModuleKey, 'base'>, boolean>;
  billing_interval: LicenseBillingInterval;
  estimated_monthly_eur: number;
  estimated_period_eur: number;
};

export type RemoteMonitoringDeviceTypeRow = {
  device_type: string;
  count: number;
  unit_eur: number;
  subtotal_eur: number;
};

export type RemoteMonitoringDevicesPricing = {
  billable_count: number;
  monthly_eur: number;
  by_type: RemoteMonitoringDeviceTypeRow[];
  unit_prices: Record<string, number>;
};

export type CompanyLicenseSnapshot = {
  enrollment: 'subscription' | 'legacy' | string;
  status: string;
  effective_status: LicenseEffectiveStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_days: number;
  billing_interval: LicenseBillingInterval;
  billing_interval_label: string;
  billing_interval_months: number;
  payment_status: LicensePaymentStatus;
  paid_through: string | null;
  next_billing_at: string | null;
  order: CompanySubscriptionOrder | null;
  base_active: boolean;
  modules: Record<Exclude<LicenseModuleKey, 'base'>, boolean>;
  pricing: {
    base_monthly_eur: number;
    module_prices: Record<string, number>;
    temp_device_unit_prices: Record<string, number>;
    remote_monitoring_devices: RemoteMonitoringDevicesPricing;
    estimated_monthly_total_eur: number;
    estimated_period_total_eur: number;
  };
  usage_this_month: Array<{
    module_key: string;
    access_count: number;
    last_accessed_at: string | null;
  }>;
};

export const LICENSE_BILLING_INTERVALS: { value: LicenseBillingInterval; label: string; months: number }[] = [
  { value: 'monthly', label: 'Kuukausittain', months: 1 },
  { value: 'quarterly', label: '3 kk välein', months: 3 },
  { value: 'semi_annual', label: '6 kk välein', months: 6 },
  { value: 'annual', label: 'Kerran vuodessa', months: 12 },
];

export const LICENSE_PAYMENT_STATUS_LABELS: Record<LicensePaymentStatus, string> = {
  none: 'Ei laskutusta',
  awaiting_payment: 'Odottaa maksua',
  paid: 'Maksettu',
  overdue: 'Erääntynyt',
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
  remote_monitoring: 'Lämpötilaseuranta ja etäohjaus. Moduulimaksu + laitemaksu (€/kk per laite, tyypistä riippuen).',
  tools: 'Työkaluinventaario',
};

export const LICENSE_MODULE_HREFS: Record<LicenseModuleKey, string[]> = {
  base: ['/tyoraportit', '/varasto', '/huoltoraportit', '/asiakkaat'],
  quotes: ['/tarjouspyynnot'],
  billing: ['/laskutus', '/hallinta/kumppanilaskutus'],
  remote_monitoring: ['/etaseuranta', '/lampotila'],
  tools: ['/tyokalut'],
};

export const TEMP_DEVICE_TYPE_LABELS: Record<string, string> = {
  jc3248: 'JC3248-näyttölaite',
  esp32_ds18b20: 'ESP32 + DS18B20',
  default: 'Lämpötilalaite',
};

export function tempDeviceTypeLabel(deviceType: string) {
  return TEMP_DEVICE_TYPE_LABELS[deviceType] ?? deviceType;
}

export function remoteMonitoringModuleDisplayPrice(pricing: CompanyLicenseSnapshot['pricing']) {
  const base = pricing.module_prices.remote_monitoring ?? 0;
  const devices = pricing.remote_monitoring_devices?.monthly_eur ?? 0;
  return base + devices;
}

export const PRICED_ADDON_MODULES: Exclude<LicenseModuleKey, 'base'>[] = [
  'quotes',
  'billing',
  'remote_monitoring',
  'tools',
];

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

export function formatLicenseMoney(value: number, suffix = '€/kk') {
  return `${value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${suffix}`;
}

export function formatLicensePeriodMoney(value: number, interval: LicenseBillingInterval) {
  const entry = LICENSE_BILLING_INTERVALS.find((item) => item.value === interval);
  const label = entry && entry.months > 1 ? `€ / ${entry.months} kk` : '€ / jakso';
  return formatLicenseMoney(value, label);
}

export function estimateOrderMonthlyTotal(
  baseActive: boolean,
  modules: Record<Exclude<LicenseModuleKey, 'base'>, boolean>,
  pricing: CompanyLicenseSnapshot['pricing'],
): number {
  let total = 0;
  if (baseActive) total += pricing.base_monthly_eur;
  for (const key of PRICED_ADDON_MODULES) {
    if (!modules[key]) continue;
    if (key === 'remote_monitoring') {
      total += remoteMonitoringModuleDisplayPrice(pricing);
    } else {
      total += pricing.module_prices[key] ?? 0;
    }
  }
  return total;
}

function parseRemoteMonitoringDevicesPricing(raw: unknown): RemoteMonitoringDevicesPricing {
  if (!raw || typeof raw !== 'object') {
    return { billable_count: 0, monthly_eur: 0, by_type: [], unit_prices: {} };
  }
  const row = raw as Record<string, unknown>;
  const unitPricesRaw = (row.unit_prices as Record<string, unknown> | undefined) ?? {};
  const byTypeRaw = Array.isArray(row.by_type) ? row.by_type : [];
  return {
    billable_count: Number(row.billable_count ?? 0),
    monthly_eur: Number(row.monthly_eur ?? 0),
    by_type: byTypeRaw.map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        device_type: String(item.device_type ?? 'default'),
        count: Number(item.count ?? 0),
        unit_eur: Number(item.unit_eur ?? 0),
        subtotal_eur: Number(item.subtotal_eur ?? 0),
      };
    }),
    unit_prices: Object.fromEntries(
      Object.entries(unitPricesRaw).map(([key, value]) => [key, Number(value ?? 0)]),
    ),
  };
}

export function estimateOrderPeriodTotal(monthly: number, interval: LicenseBillingInterval) {
  const months = LICENSE_BILLING_INTERVALS.find((item) => item.value === interval)?.months ?? 1;
  return Math.round(monthly * months * 100) / 100;
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
  const tempDeviceUnitPricesRaw =
    (pricingRaw.temp_device_unit_prices as Record<string, unknown> | undefined) ?? {};
  const orderRaw = row.order;

  let order: CompanySubscriptionOrder | null = null;
  if (orderRaw && typeof orderRaw === 'object') {
    const o = orderRaw as Record<string, unknown>;
    const orderModules = (o.modules as Record<string, unknown> | undefined) ?? {};
    order = {
      submitted_at: String(o.submitted_at ?? ''),
      submitted_by: typeof o.submitted_by === 'string' ? o.submitted_by : undefined,
      base_active: o.base_active === true,
      modules: {
        quotes: orderModules.quotes === true,
        billing: orderModules.billing === true,
        remote_monitoring: orderModules.remote_monitoring === true,
        tools: orderModules.tools === true,
      },
      billing_interval: (o.billing_interval as LicenseBillingInterval) ?? 'monthly',
      estimated_monthly_eur: Number(o.estimated_monthly_eur ?? 0),
      estimated_period_eur: Number(o.estimated_period_eur ?? 0),
    };
  }

  return {
    enrollment: String(row.enrollment ?? 'subscription'),
    status: String(row.status ?? 'pending_trial'),
    effective_status: String(row.effective_status ?? 'pending_trial') as LicenseEffectiveStatus,
    trial_started_at: typeof row.trial_started_at === 'string' ? row.trial_started_at : null,
    trial_ends_at: typeof row.trial_ends_at === 'string' ? row.trial_ends_at : null,
    trial_days: Number(row.trial_days ?? 30),
    billing_interval: (row.billing_interval as LicenseBillingInterval) ?? 'monthly',
    billing_interval_label: String(row.billing_interval_label ?? 'Kuukausittain'),
    billing_interval_months: Number(row.billing_interval_months ?? 1),
    payment_status: (row.payment_status as LicensePaymentStatus) ?? 'none',
    paid_through: typeof row.paid_through === 'string' ? row.paid_through : null,
    next_billing_at: typeof row.next_billing_at === 'string' ? row.next_billing_at : null,
    order,
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
      temp_device_unit_prices: Object.fromEntries(
        Object.entries(tempDeviceUnitPricesRaw).map(([key, value]) => [key, Number(value ?? 0)]),
      ),
      remote_monitoring_devices: parseRemoteMonitoringDevicesPricing(
        pricingRaw.remote_monitoring_devices,
      ),
      estimated_monthly_total_eur: Number(pricingRaw.estimated_monthly_total_eur ?? 0),
      estimated_period_total_eur: Number(pricingRaw.estimated_period_total_eur ?? 0),
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

export type LicenseSettingsStored = {
  enrollment: string;
  status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  base_active: boolean;
  modules: Record<Exclude<LicenseModuleKey, 'base'>, boolean>;
  payment_status?: LicensePaymentStatus;
};

export type LicenseOverviewRow = {
  company_id: string;
  company_name: string;
  company_slug: string | null;
  company_created_at: string | null;
  user_count: number;
  /** Kaikki profiles-rivit yrityksellä (myös muut roolit). */
  account_count: number;
  last_sign_in_at: string | null;
  has_logged_in: boolean;
  license_settings: LicenseSettingsStored | null;
  snapshot: CompanyLicenseSnapshot;
};

function parseLicenseSettingsStored(raw: unknown): LicenseSettingsStored | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const modulesRaw = (row.modules as Record<string, unknown> | undefined) ?? {};
  return {
    enrollment: String(row.enrollment ?? 'subscription'),
    status: String(row.status ?? 'pending_trial'),
    trial_started_at: typeof row.trial_started_at === 'string' ? row.trial_started_at : null,
    trial_ends_at: typeof row.trial_ends_at === 'string' ? row.trial_ends_at : null,
    base_active: row.base_active === true,
    modules: {
      quotes: modulesRaw.quotes === true,
      billing: modulesRaw.billing === true,
      remote_monitoring: modulesRaw.remote_monitoring === true,
      tools: modulesRaw.tools === true,
    },
    payment_status: (row.payment_status as LicensePaymentStatus) ?? undefined,
  };
}

export function parseLicenseOverviewRows(raw: unknown): LicenseOverviewRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const snapshot = parseCompanyLicenseSnapshot(row.snapshot);
      if (!snapshot || !row.company_id) return null;
      return {
        company_id: String(row.company_id),
        company_name: String(row.company_name ?? '—'),
        company_slug: row.company_slug != null ? String(row.company_slug) : null,
        company_created_at:
          typeof row.company_created_at === 'string' ? row.company_created_at : null,
        user_count: Number(row.user_count ?? 0),
        account_count: Number(row.account_count ?? row.user_count ?? 0),
        last_sign_in_at:
          typeof row.last_sign_in_at === 'string' ? row.last_sign_in_at : null,
        has_logged_in: row.has_logged_in === true,
        license_settings: parseLicenseSettingsStored(row.license_settings),
        snapshot,
      };
    })
    .filter((row): row is LicenseOverviewRow => row !== null);
}

export function licenseOverviewEnrollmentLabel(enrollment: string) {
  if (enrollment === 'legacy') return 'Vanha sopimus';
  return 'Tilaus ja kokeilu';
}

export function licenseOverviewLoginSummary(row: LicenseOverviewRow) {
  if (row.snapshot.enrollment === 'legacy') {
    if (row.has_logged_in && row.last_sign_in_at) {
      return `Kirjautunut · ${new Date(row.last_sign_in_at).toLocaleDateString('fi-FI')}`;
    }
    if (row.user_count === 0) return 'Ei käyttäjiä';
    return row.has_logged_in ? 'Kirjautunut' : 'Ei kirjautumista tallennettuna';
  }
  if (row.snapshot.effective_status === 'pending_trial') {
    return row.has_logged_in
      ? 'Kirjautunut, kokeilu ei käynnistynyt'
      : 'Ei ensimmäistä kirjautumista';
  }
  if (row.snapshot.trial_started_at) {
    const started = new Date(row.snapshot.trial_started_at).toLocaleDateString('fi-FI');
    return `Kokeilu alkanut ${started}`;
  }
  if (row.has_logged_in && row.last_sign_in_at) {
    return `Viimeisin ${new Date(row.last_sign_in_at).toLocaleDateString('fi-FI')}`;
  }
  return '—';
}

export function licenseOverviewTrialSummary(row: LicenseOverviewRow) {
  if (row.snapshot.enrollment === 'legacy') {
    return 'Ei kokeilua (vanha sopimus, ei laskutusta)';
  }
  if (row.snapshot.effective_status === 'pending_trial') {
    return `Odottaa ensimmäistä kirjautumista · ${row.snapshot.trial_days} pv kokeilua`;
  }
  if (row.snapshot.effective_status === 'trial') {
    const remaining = trialDaysRemaining(row.snapshot);
    const end = row.snapshot.trial_ends_at
      ? new Date(row.snapshot.trial_ends_at).toLocaleDateString('fi-FI')
      : '—';
    return remaining != null
      ? `Päättyy ${end} (${remaining} pv jäljellä)`
      : `Päättyy ${end}`;
  }
  if (row.snapshot.effective_status === 'active') {
    return 'Maksava · moduulit alla';
  }
  if (row.snapshot.order) return 'Tilaus odottaa maksua';
  return 'Kokeilu päättynyt / ei aktiivinen';
}

export function formatStoredModulesSummary(
  stored: LicenseSettingsStored | null,
  snapshot: CompanyLicenseSnapshot,
) {
  if (snapshot.enrollment === 'legacy') {
    return 'Kaikki sallittu (vanha sopimus)';
  }
  if (snapshot.effective_status === 'trial' || snapshot.effective_status === 'pending_trial') {
    return 'Kokeilussa: kaikki moduulit käytössä';
  }
  if (!stored) return '—';
  const parts: string[] = [];
  if (stored.base_active) parts.push('Perus ✓');
  else parts.push('Perus ✗');
  const labels: Record<Exclude<LicenseModuleKey, 'base'>, string> = {
    quotes: 'Tarj.',
    billing: 'Lask.',
    remote_monitoring: 'Etä',
    tools: 'Työkalut',
  };
  for (const key of PRICED_ADDON_MODULES) {
    parts.push(`${labels[key]} ${stored.modules[key] ? '✓' : '✗'}`);
  }
  return parts.join(' · ');
}
