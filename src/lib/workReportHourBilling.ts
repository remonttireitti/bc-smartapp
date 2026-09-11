import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export type HourBillingMode = 'manual' | 'daily_overtime' | 'all_regular';

export function isMissingHourBillingColumn(error: PostgrestError | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('hour_billing') &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  );
}

export type HourBillingSettings = {
  partner_mode: HourBillingMode;
  customer_mode: HourBillingMode;
};

export const HOUR_BILLING_MODE_LABELS: Record<HourBillingMode, string> = {
  manual: 'Manuaalinen (syötetyt tuntityypit)',
  daily_overtime: 'Päivittäinen ylityölaskenta (8 h + porrastus)',
  all_regular: 'Kaikki normaalihintaisina',
};

const DEFAULT_SETTINGS: HourBillingSettings = {
  partner_mode: 'manual',
  customer_mode: 'manual',
};

function parseMode(value: unknown): HourBillingMode {
  if (value === 'daily_overtime' || value === 'all_regular' || value === 'manual') {
    return value;
  }
  return 'manual';
}

export function parseHourBillingSettings(raw: unknown): HourBillingSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const record = raw as Record<string, unknown>;
  return {
    partner_mode: parseMode(record.partner_mode),
    customer_mode: parseMode(record.customer_mode),
  };
}

export function hourBillingModeForSide(
  settings: HourBillingSettings,
  side: 'partner' | 'customer',
): HourBillingMode {
  return side === 'partner' ? settings.partner_mode : settings.customer_mode;
}

export async function fetchBillableRowWithHourBillingFallback(
  supabase: SupabaseClient,
  workReportId: string,
  extraFields = '',
): Promise<{ data: Record<string, unknown> | null; hourBillingSupported: boolean; error: PostgrestError | null }> {
  const baseFields = extraFields.trim();
  const withHourBilling = baseFields
    ? `${baseFields}, hour_billing`
    : 'hour_billing';
  const full = await supabase
    .from('work_report_billable')
    .select(withHourBilling)
    .eq('work_report_id', workReportId)
    .maybeSingle();
  if (!isMissingHourBillingColumn(full.error)) {
    return {
      data: (full.data as Record<string, unknown> | null) ?? null,
      hourBillingSupported: true,
      error: full.error,
    };
  }
  if (!baseFields) {
    return { data: null, hourBillingSupported: false, error: full.error };
  }
  const legacy = await supabase
    .from('work_report_billable')
    .select(baseFields)
    .eq('work_report_id', workReportId)
    .maybeSingle();
  return {
    data: (legacy.data as Record<string, unknown> | null) ?? null,
    hourBillingSupported: false,
    error: legacy.error,
  };
}
