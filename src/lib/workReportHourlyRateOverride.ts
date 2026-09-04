/** Tyhjä kenttä = käytä oletushintaa. Nolla = ei veloitusta (esim. takuutyö). */
export function parseOptionalHourlyRateOverride(raw: string | null | undefined): number | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function formatHourlyRateOverrideForForm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return String(value);
}

export function resolveStoredHourlyRateOverride(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function hasStoredHourlyRateOverride(value: number | null | undefined): boolean {
  return resolveStoredHourlyRateOverride(value) != null;
}
