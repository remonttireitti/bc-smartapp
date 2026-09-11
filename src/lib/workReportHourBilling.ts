export type HourBillingMode = 'manual' | 'daily_overtime' | 'all_regular';

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
