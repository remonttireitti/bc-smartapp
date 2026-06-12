export type PartnershipAccessLevel = 'none' | 'read' | 'write';

export type PartnershipPermissions = {
  work_reports: PartnershipAccessLevel;
  maintenance_reports: PartnershipAccessLevel;
  customers: PartnershipAccessLevel;
  inventory: PartnershipAccessLevel;
  tools: PartnershipAccessLevel;
  quotes: PartnershipAccessLevel;
  use_branding: boolean;
};

export const PARTNERSHIP_MODULES = [
  { key: 'work_reports', label: 'Työraportit' },
  { key: 'maintenance_reports', label: 'Huoltoraportit' },
  { key: 'customers', label: 'Asiakkaat' },
  { key: 'inventory', label: 'Varasto' },
  { key: 'tools', label: 'Työkalut' },
  { key: 'quotes', label: 'Tarjouspyynnöt' },
] as const;

export type PartnershipModuleKey = (typeof PARTNERSHIP_MODULES)[number]['key'];

export const ACCESS_LEVEL_OPTIONS = [
  { value: 'none', label: 'Ei oikeutta' },
  { value: 'read', label: 'Lukuoikeus' },
  { value: 'write', label: 'Luonti ja muokkaus' },
] as const;

export const ACCESS_LEVEL_LABELS: Record<PartnershipAccessLevel, string> = {
  none: 'Ei oikeutta',
  read: 'Lukuoikeus',
  write: 'Luonti ja muokkaus',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Ylläpitäjä',
  technician: 'Asentaja',
  manager: 'Esimies',
  customer: 'Asiakas',
  subscriber: 'Tilaaja',
  monitor_viewer: 'Seurannan lukija',
};

export const INVITE_ROLES = [
  { value: 'admin', label: 'Ylläpitäjä (kaikki oikeudet)' },
  { value: 'technician', label: 'Asentaja' },
  { value: 'customer', label: 'Asiakas (yksi kohde, portaali)' },
  { value: 'subscriber', label: 'Tilaaja (moniasiakas-portaali)' },
] as const;

export function isPortalRole(role: string | null | undefined) {
  return role === 'customer' || role === 'subscriber';
}

export function isCompanyAdmin(role: string | null | undefined) {
  return role === 'admin';
}

export function isCompanyManager(role: string | null | undefined) {
  return role === 'manager';
}

export function canManageCompanyLogo(role: string | null | undefined) {
  return isCompanyAdmin(role) || isCompanyManager(role);
}

export function canEditCompanySettings(role: string | null | undefined) {
  return isCompanyAdmin(role);
}

export type PartnerBillingRates = {
  hourly_regular?: number;
  hourly_overtime?: number;
  hourly_on_call?: number;
};

/** Same shape as partner rates — used for customer-facing prices on own reports. */
export type CustomerBillingRates = PartnerBillingRates;

import type { CustomHeatPumpDeviceEntry, DeviceRegistryOverride } from '../data/deviceRegistryTypes';

export type CompanySettings = {
  address?: string;
  postal_code?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  /** Tarjousten allekirjoittajan nimi (esim. Lämpökatsastus-tuloste). */
  quote_signatory_name?: string;
  /** Oma kustannus / kumppanille kirjattava km-hinta (€/km). */
  trip_km_rate?: number;
  /** Asiakkaalle laskutettava km-hinta (€/km). */
  trip_km_customer_rate?: number;
  billing?: {
    business_id?: string;
    vat_id?: string;
    iban?: string;
    billing_address?: string;
    payment_terms?: string;
    invoice_email?: string;
    /**
     * Näytetäänkö yritykselle Laskutus-moduuli (dashboard, /laskutus, kumppanilaskutus).
     * Vain globaali admin voi muuttaa. Oletus false (opt-in).
     */
    module_enabled?: boolean;
    /** Seurataanko työraporttien asiakaslaskutusta (Laskutettu asiakkaalta). */
    track_customer_invoicing?: boolean;
    /** Oletushinnat kumppanille laskutettaessa. */
    partner_rates?: PartnerBillingRates;
    /** Oletustuntihinnat asiakkaalle omissa työraporteissa. */
    customer_rates?: CustomerBillingRates;
  };
  /**
   * Näytetäänkö kumppanuus- ja moniyritystoiminnot (kumppanuudet, toimeksiannot, kumppanilaskutus).
   * Oletus false — yksinyritystila. Yrityksen ylläpitäjä voi kytkeä päälle myöhemmin.
   */
  partnerships_enabled?: boolean;
  /** Kevyt laiterekisteri: brändikohtaiset toimitusmaksut (€/yksikkö, alv 0). */
  device_registry?: {
    brand_delivery_fees_by_category?: Record<
      string,
      { ilmalampopumppu?: number; 'vesi-ilmalampopumppu'?: number }
    >;
    brand_delivery_fee_per_unit?: Record<string, number>;
    /** Tukkurin brändikorotus % katalogilistahintaan. */
    brand_price_bumps?: Record<string, number>;
    /** Mallikohtaiset yliajot (deviceId → override). */
    overrides?: Record<string, DeviceRegistryOverride>;
    /** Yrityksen itse lisäämät laitteet (deviceId → laite). */
    custom_devices?: Record<string, CustomHeatPumpDeviceEntry>;
  };
};

function isAccessLevel(value: unknown): value is PartnershipAccessLevel {
  return value === 'none' || value === 'read' || value === 'write';
}

const ACCESS_LEVEL_RANK: Record<PartnershipAccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
};

export const MODULES_REQUIRING_CUSTOMERS: PartnershipModuleKey[] = [
  'work_reports',
  'maintenance_reports',
  'quotes',
];

/** @deprecated use MODULES_REQUIRING_CUSTOMERS */
export const REPORT_MODULES_REQUIRING_CUSTOMERS = MODULES_REQUIRING_CUSTOMERS;

export function maxAccessLevel(
  a: PartnershipAccessLevel,
  b: PartnershipAccessLevel,
): PartnershipAccessLevel {
  return ACCESS_LEVEL_RANK[a] >= ACCESS_LEVEL_RANK[b] ? a : b;
}

/** Raportit ja tarjouspyynnöt vaativat asiakkaiden lukuoikeuden (laiterekisteri seuraa samaa). */
export function applyPartnershipDependencies(perms: PartnershipPermissions): PartnershipPermissions {
  const next = { ...perms };
  const needsCustomers = MODULES_REQUIRING_CUSTOMERS.some((key) => next[key] === 'write');

  if (needsCustomers) {
    next.customers = maxAccessLevel(next.customers, 'read');
  }

  return next;
}

export function partnershipNeedsCustomersRead(perms: PartnershipPermissions) {
  return MODULES_REQUIRING_CUSTOMERS.some((key) => perms[key] === 'write');
}

export function emptyPartnershipPermissions(): PartnershipPermissions {
  return {
    work_reports: 'none',
    maintenance_reports: 'none',
    customers: 'none',
    inventory: 'none',
    tools: 'none',
    quotes: 'none',
    use_branding: false,
  };
}

function migrateLegacyPermissions(raw: Record<string, unknown>): PartnershipPermissions {
  const base = emptyPartnershipPermissions();

  if (raw.create_work_reports_as_partner) base.work_reports = 'write';
  else if (raw.view_partner_reports) base.work_reports = 'read';

  if (raw.create_maintenance_reports_as_partner) base.maintenance_reports = 'write';
  else if (raw.view_partner_reports) base.maintenance_reports = 'read';

  if (raw.create_customers_as_partner) base.customers = 'write';
  else if (raw.view_customers) base.customers = 'read';

  base.use_branding = !!raw.use_partner_branding;
  return applyPartnershipDependencies(base);
}

export function parsePartnershipPermissions(raw: unknown): PartnershipPermissions {
  const base = emptyPartnershipPermissions();
  if (!raw || typeof raw !== 'object') return base;

  const record = raw as Record<string, unknown>;
  if ('create_work_reports_as_partner' in record || 'view_partner_reports' in record) {
    return migrateLegacyPermissions(record);
  }

  for (const mod of PARTNERSHIP_MODULES) {
    const value = record[mod.key];
    if (isAccessLevel(value)) {
      base[mod.key] = value;
    }
  }

  if (typeof record.use_branding === 'boolean') {
    base.use_branding = record.use_branding;
  }

  return applyPartnershipDependencies(base);
}

export function partnershipPermissionsForUs(p: { company_a_id: string; company_b_id: string }, myCompanyId: string) {
  if (p.company_b_id === myCompanyId) return 'permissions_a_to_b' as const;
  if (p.company_a_id === myCompanyId) return 'permissions_b_to_a' as const;
  return null;
}

export function partnershipPermissionsGrantedToUs(p: { company_a_id: string; company_b_id: string }, myCompanyId: string) {
  if (p.company_a_id === myCompanyId) return 'permissions_a_to_b' as const;
  if (p.company_b_id === myCompanyId) return 'permissions_b_to_a' as const;
  return null;
}

/** Permissions for acting_company working on owner_company's registry (matches DB partnership_perms_for). */
export function partnershipPermsActingOnOwner(
  p: {
    company_a_id: string;
    company_b_id: string;
    permissions_a_to_b: unknown;
    permissions_b_to_a: unknown;
  },
  actingCompanyId: string,
  ownerCompanyId: string,
): PartnershipPermissions {
  if (actingCompanyId === ownerCompanyId) {
    return parsePartnershipPermissions(null);
  }

  if (p.company_a_id === actingCompanyId && p.company_b_id === ownerCompanyId) {
    return parsePartnershipPermissions(p.permissions_a_to_b);
  }

  if (p.company_b_id === actingCompanyId && p.company_a_id === ownerCompanyId) {
    return parsePartnershipPermissions(p.permissions_b_to_a);
  }

  return emptyPartnershipPermissions();
}

export function partnershipModuleAccess(
  raw: unknown,
  module: PartnershipModuleKey,
  minLevel: 'read' | 'write',
) {
  const perms = parsePartnershipPermissions(raw);
  const level = perms[module];
  if (minLevel === 'read') return level === 'read' || level === 'write';
  return level === 'write';
}

export function formatPartnershipPerms(raw: unknown) {
  const perms = parsePartnershipPermissions(raw);
  const lines: string[] = [];

  for (const mod of PARTNERSHIP_MODULES) {
    const level = perms[mod.key];
    if (level !== 'none') {
      lines.push(`${mod.label}: ${ACCESS_LEVEL_LABELS[level]}`);
    }
  }

  return lines.join(', ') || '—';
}

export function emptyCompanySettings(): CompanySettings {
  return {
    address: '',
    postal_code: '',
    city: '',
    phone: '',
    email: '',
    website: '',
    trip_km_rate: undefined,
    billing: {
      business_id: '',
      vat_id: '',
      iban: '',
      billing_address: '',
      payment_terms: '',
      invoice_email: '',
      track_customer_invoicing: false,
      partner_rates: {
        hourly_regular: 0,
        hourly_overtime: 0,
        hourly_on_call: 0,
      },
      customer_rates: {
        hourly_regular: 0,
        hourly_overtime: 0,
        hourly_on_call: 0,
      },
    },
  };
}

function parseOptionalPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function parseCompanySettings(raw: unknown): CompanySettings {
  const base = emptyCompanySettings();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as CompanySettings;
  return {
    ...base,
    ...s,
    trip_km_rate: parseOptionalPositiveNumber(s.trip_km_rate),
    trip_km_customer_rate: parseOptionalPositiveNumber(s.trip_km_customer_rate),
    partnerships_enabled: s.partnerships_enabled === true,
    billing: {
      ...base.billing,
      ...(s.billing ?? {}),
      module_enabled: s.billing?.module_enabled,
      track_customer_invoicing: s.billing?.track_customer_invoicing ?? false,
      partner_rates: { ...base.billing?.partner_rates, ...(s.billing?.partner_rates ?? {}) },
      customer_rates: { ...base.billing?.customer_rates, ...(s.billing?.customer_rates ?? {}) },
    },
    device_registry: s.device_registry ? { ...s.device_registry } : undefined,
  };
}

export function companyBillingModuleEnabled(settings: CompanySettings | null | undefined): boolean {
  return settings?.billing?.module_enabled === true;
}

export function companyPartnershipsEnabled(settings: CompanySettings | null | undefined): boolean {
  return settings?.partnerships_enabled === true;
}

export async function loadCompanyPartnershipsEnabled(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('company_partnerships_enabled', {
    p_company_id: companyId,
  });
  if (!rpcError) return !!rpcData;

  const { data } = await supabase.from('companies').select('settings').eq('id', companyId).single();
  return companyPartnershipsEnabled(parseCompanySettings((data as { settings: unknown } | null)?.settings));
}

export async function loadCompanyBillingModuleEnabled(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('company_billing_module_enabled', {
    p_company_id: companyId,
  });
  if (!rpcError) return !!rpcData;

  const { data } = await supabase.from('companies').select('settings').eq('id', companyId).single();
  return companyBillingModuleEnabled(parseCompanySettings((data as { settings: unknown } | null)?.settings));
}

export function companyTracksCustomerInvoicing(settings: CompanySettings | null | undefined): boolean {
  return settings?.billing?.track_customer_invoicing === true;
}

export async function loadCompanyTracksCustomerInvoicing(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data } = await supabase.from('companies').select('settings').eq('id', companyId).single();
  return companyTracksCustomerInvoicing(parseCompanySettings((data as { settings: unknown } | null)?.settings));
}

export function emptyPartnerBillingRates(): Required<PartnerBillingRates> {
  return { hourly_regular: 0, hourly_overtime: 0, hourly_on_call: 0 };
}

export function parsePartnerBillingRates(raw: unknown): PartnerBillingRates {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const num = (value: unknown) => {
    if (value == null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    hourly_regular: num(r.hourly_regular),
    hourly_overtime: num(r.hourly_overtime),
    hourly_on_call: num(r.hourly_on_call),
  };
}

export function parseCustomerBillingRates(raw: unknown): CustomerBillingRates {
  return parsePartnerBillingRates(raw);
}

export function hasCustomerBillingRates(rates: CustomerBillingRates) {
  return hasPartnerBillingRates(rates);
}

export function hasPartnerBillingRates(rates: PartnerBillingRates) {
  return (
    rates.hourly_regular != null || rates.hourly_overtime != null || rates.hourly_on_call != null
  );
}

export type BillableRatesSource = 'company_default' | 'partnership' | 'report_override';

export function resolveCustomerBillingRates(input: {
  companyDefaults: CustomerBillingRates;
  reportOverride?: CustomerBillingRates;
  useReportRates?: boolean;
}): { rates: Required<CustomerBillingRates>; source: BillableRatesSource } {
  const defaults = { ...emptyPartnerBillingRates(), ...input.companyDefaults };
  if (input.useReportRates && input.reportOverride && hasCustomerBillingRates(input.reportOverride)) {
    return {
      rates: { ...defaults, ...input.reportOverride },
      source: 'report_override',
    };
  }
  return { rates: defaults, source: 'company_default' };
}

export function resolveBillingRates(input: {
  companyDefaults: PartnerBillingRates;
  partnershipRates?: PartnerBillingRates;
  partnershipRatesFallback?: PartnerBillingRates;
  reportOverride?: PartnerBillingRates | null;
  useReportRates?: boolean;
}): { rates: Required<PartnerBillingRates>; source: BillableRatesSource } {
  const base = { ...emptyPartnerBillingRates(), ...parsePartnerBillingRates(input.companyDefaults) };

  if (input.useReportRates && input.reportOverride && hasPartnerBillingRates(input.reportOverride)) {
    return {
      rates: { ...base, ...parsePartnerBillingRates(input.reportOverride) },
      source: 'report_override',
    };
  }

  const partnership = parsePartnerBillingRates(input.partnershipRates);
  if (hasPartnerBillingRates(partnership)) {
    return { rates: { ...base, ...partnership }, source: 'partnership' };
  }

  const partnershipFallback = parsePartnerBillingRates(input.partnershipRatesFallback);
  if (hasPartnerBillingRates(partnershipFallback)) {
    return { rates: { ...base, ...partnershipFallback }, source: 'partnership' };
  }

  return { rates: base, source: 'company_default' };
}

export function readPartnershipBillingRates(
  partnership: {
    company_a_id: string;
    company_b_id: string;
    billing_rates_a_to_b?: unknown;
    billing_rates_b_to_a?: unknown;
  },
  billingCompanyId: string,
  billedCompanyId: string,
): { primary: PartnerBillingRates; fallback: PartnerBillingRates } {
  const primaryField = partnershipBillingRatesFieldForBillingPartner(
    partnership,
    billingCompanyId,
    billedCompanyId,
  );
  const fallbackField = partnershipBillingRatesFieldForBillingPartner(
    partnership,
    billedCompanyId,
    billingCompanyId,
  );

  return {
    primary: primaryField ? parsePartnerBillingRates(partnership[primaryField]) : {},
    fallback: fallbackField ? parsePartnerBillingRates(partnership[fallbackField]) : {},
  };
}

/** Field for rates the partner charges the owner (owner sets in partnership UI). */
export function partnershipBillingRatesFieldPartnerChargesOwner(
  p: { company_a_id: string; company_b_id: string },
  ownerCompanyId: string,
  partnerCompanyId: string,
) {
  return partnershipBillingRatesFieldForBillingPartner(p, partnerCompanyId, ownerCompanyId);
}

/** @deprecated use partnershipBillingRatesFieldPartnerChargesOwner with owner + partner ids */
export function partnershipBillingRatesFieldForUs(
  p: { company_a_id: string; company_b_id: string },
  myCompanyId: string,
) {
  const partnerCompanyId = p.company_a_id === myCompanyId ? p.company_b_id : p.company_a_id;
  return partnershipBillingRatesFieldPartnerChargesOwner(p, myCompanyId, partnerCompanyId);
}

export function partnershipBillingRatesFieldForBillingPartner(
  p: { company_a_id: string; company_b_id: string },
  billingCompanyId: string,
  billedCompanyId: string,
) {
  if (billingCompanyId === p.company_a_id && billedCompanyId === p.company_b_id) {
    return 'billing_rates_a_to_b' as const;
  }
  if (billingCompanyId === p.company_b_id && billedCompanyId === p.company_a_id) {
    return 'billing_rates_b_to_a' as const;
  }
  return null;
}

export const BILLABLE_RATES_SOURCE_LABELS: Record<BillableRatesSource, string> = {
  company_default: 'Yrityksen oletushinnat',
  partnership: 'Kumppanuuden hinnat',
  report_override: 'Raporttikohtaiset hinnat',
};
