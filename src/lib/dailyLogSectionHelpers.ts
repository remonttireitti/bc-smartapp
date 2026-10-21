import type { DailyHourEntryType } from '../types';
import { HOUR_ENTRY_LABELS } from '../types';
import { sumTripLegDraftKm, type TripLegDraft } from './workReportTripLegs';

function truncate(text: string, max = 52): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function formatShortDate(isoDate: string): string {
  if (!isoDate) return 'Valitse päivä';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  if (!year || !month || !day) return isoDate;
  return `${Number(day)}.${Number(month)}.${year}`;
}

type DailyLogHoursForm = {
  entry_type: DailyHourEntryType;
  hours_regular: string;
  hours_overtime: string;
  hours_on_call: string;
  customer_fixed_price_amount: string;
  fixed_price_amount: string;
};

export const DAILY_LOG_SECTION_COLORS = {
  trips: '#1976D2',
  day: '#0D9488',
  work: '#388E3C',
  hours: '#7C3AED',
  commission: '#64748B',
  expenses: '#D97706',
  device: '#BE185D',
  refrigerant: '#0891B2',
  partnerPurchase: '#B45309',
  images: '#6366F1',
} as const;

export function dailyLogTripsSubtitle(tripDrafts: TripLegDraft[], warranty = false): string {
  const totalKm = sumTripLegDraftKm(tripDrafts);
  if (tripDrafts.length === 0) return 'Ei ajomatkoja';
  const base = totalKm > 0 ? `${totalKm.toFixed(1)} km · ${tripDrafts.length} reittiä` : `${tripDrafts.length} reittiä`;
  return warranty ? `${base} · Takuu` : base;
}

export function dailyLogDaySubtitle(form: {
  log_date: string;
  log_start_time: string;
  entry_type: DailyHourEntryType;
}): string {
  const date = formatShortDate(form.log_date);
  const type = HOUR_ENTRY_LABELS[form.entry_type] ?? form.entry_type;
  const time = form.log_start_time ? form.log_start_time.slice(0, 5) : '';
  return time ? `${date} · ${time} · ${type}` : `${date} · ${type}`;
}

export function dailyLogWorkSubtitle(workDone: string): string {
  const summary = truncate(workDone, 56);
  return summary || 'Kuvaile päivän työt';
}

export function dailyLogHoursSubtitle(
  form: DailyLogHoursForm & {
    hours_extra_billable?: boolean;
    hours_extra_billing_allowed?: boolean;
    hours_extra_hours?: string;
    partner_warranty?: boolean;
  },
): string {
  if (form.entry_type === 'fixed_price') {
    const customer = Number(form.customer_fixed_price_amount);
    if (customer > 0) return `Urakka ${customer.toFixed(2)} €`;
    const partner = Number(form.fixed_price_amount);
    if (partner > 0) return `Urakka ${partner.toFixed(2)} €`;
    const hours = Number(form.hours_regular);
    return hours > 0 ? `${form.hours_regular} h · ei laskuteta` : 'Ei laskuteta';
  }

  const parts: string[] = [];
  if (Number(form.hours_regular) > 0) parts.push(`${form.hours_regular} h`);
  if (Number(form.hours_overtime) > 0) parts.push(`ylityö ${form.hours_overtime} h`);
  if (Number(form.hours_on_call) > 0) parts.push(`päivystys ${form.hours_on_call} h`);
  if (form.hours_extra_billable) {
    const extraHours = Number(form.hours_extra_hours) || 0;
    const status = form.hours_extra_billing_allowed
      ? 'Lisälaskutettava'
      : 'lisälaskutettavissa · ei lupaa';
    parts.push(extraHours > 0 ? `${extraHours} h lisälask. · ${status}` : status);
  }
  if (form.partner_warranty && parts.length > 0) parts.push('Takuu');
  return parts.length > 0 ? parts.join(' · ') : 'Ei tunteja';
}

export function dailyLogCommissionSubtitle(amount: string, note: string): string {
  const value = Number(amount);
  if (value > 0) {
    const summary = truncate(note, 36);
    return summary ? `${value.toFixed(2)} € · ${summary}` : `${value.toFixed(2)} €`;
  }
  return note.trim() ? truncate(note, 48) : 'Ei provisiota';
}

export function dailyLogExpensesSubtitle(manualCount: number, hasAutoTripKm: boolean, warrantyCount = 0): string {
  const total = manualCount + (hasAutoTripKm ? 1 : 0);
  if (total === 0) return 'Ei kuluja';
  const base = total === 1 ? '1 rivi' : `${total} riviä`;
  return warrantyCount > 0 ? `${base} · Takuu ${warrantyCount}` : base;
}

export function dailyLogRefrigerantSubtitle(count: number, warrantyCount = 0): string {
  if (count === 0) return 'Ei kylmäainerivejä';
  const base = count === 1 ? '1 rivi' : `${count} riviä`;
  return warrantyCount > 0 ? `${base} · Takuu` : base;
}

export function dailyLogImagesSubtitle(savedCount: number, pendingCount: number): string {
  const total = savedCount + pendingCount;
  if (total === 0) return 'Ei kuvia';
  return total === 1 ? '1 kuva' : `${total} kuvaa`;
}
