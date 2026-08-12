import type { SupabaseClient } from '@supabase/supabase-js';

import type { CompanySettings } from './management';
import { expenseLineTotal, type DailyTripLeg, type WorkReport, type WorkReportDailyLog } from '../types';
import { resolveTripKmBillingLine, tripKmLineTotal } from './tripKmExpense';

export type TripLegDeparture = {
  startLabel: string;
  returnLabel: string;
};

export type TripLegDraft = {
  key: string;
  from_label: string;
  to_label: string;
  distance_km: string;
  bill_to_customer: boolean;
};

export function emptyTripLeg(): TripLegDraft {
  return {
    key: crypto.randomUUID(),
    from_label: '',
    to_label: '',
    distance_km: '',
    bill_to_customer: true,
  };
}

export function tripLegsToDrafts(lines: DailyTripLeg[] | undefined): TripLegDraft[] {
  return (lines ?? []).map((line) => ({
    key: line.id,
    from_label: line.from_label,
    to_label: line.to_label,
    distance_km: Number(line.distance_km) > 0 ? String(line.distance_km) : '',
    bill_to_customer: line.bill_to_customer !== false,
  }));
}

export function formatOfficeTripLabel(settings?: CompanySettings | null, companyName?: string | null): string {
  const parts = [settings?.address, settings?.postal_code, settings?.city].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return companyName?.trim() || 'Toimisto';
}

export function resolveUserDepartureLabel(input: {
  trip_departure_source?: 'workplace' | 'home' | null;
  workplace_address?: string | null;
  home_address?: string | null;
  companySettings?: CompanySettings | null;
  companyName?: string | null;
}): string {
  const preferHome = input.trip_departure_source === 'home';
  const workplace = input.workplace_address?.trim();
  const home = input.home_address?.trim();

  if (preferHome && home) return home;
  if (!preferHome && workplace) return workplace;
  if (workplace) return workplace;
  if (home) return home;
  return formatOfficeTripLabel(input.companySettings, input.companyName);
}

export function resolveWorkReportSiteLabel(
  report: Pick<WorkReport, 'location_text' | 'customers'>,
): string {
  const location = report.location_text?.trim();
  if (location) return location;

  const customer = report.customers;
  if (customer) {
    const parts = [customer.address, customer.city].filter(Boolean);
    if (parts.length) return parts.join(', ');
    if (customer.name?.trim()) return customer.name.trim();
  }

  return 'Kohde';
}

export function tripLegDeparture(startLabel: string, returnLabel?: string): TripLegDeparture {
  const start = startLabel.trim();
  const ret = (returnLabel ?? startLabel).trim();
  return { startLabel: start, returnLabel: ret || start };
}

export function buildDefaultTripLegs(departure: TripLegDeparture, siteLabel: string): TripLegDraft[] {
  return normalizeTripLegDrafts(
    [
      {
        key: crypto.randomUUID(),
        from_label: departure.startLabel,
        to_label: siteLabel,
        distance_km: '',
        bill_to_customer: true,
      },
    ],
    departure,
  );
}

function labelsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function isReturnToDepartureLeg(leg: TripLegDraft, returnLabel: string): boolean {
  return labelsMatch(leg.to_label, returnLabel);
}

export function resolveEffectiveReturnLabel(
  drafts: TripLegDraft[],
  departure: TripLegDeparture,
): string {
  const firstFrom = drafts[0]?.from_label?.trim();
  return firstFrom || departure.returnLabel || departure.startLabel;
}

export function findReturnLegIndex(drafts: TripLegDraft[], departure: TripLegDeparture): number {
  if (drafts.length <= 1) return -1;
  const lastIndex = drafts.length - 1;
  const last = drafts[lastIndex];
  const effectiveReturn = resolveEffectiveReturnLabel(drafts, departure);
  if (
    isReturnToDepartureLeg(last, departure.returnLabel)
    || isReturnToDepartureLeg(last, effectiveReturn)
  ) {
    return lastIndex;
  }
  return -1;
}

export function normalizeTripLegDrafts(drafts: TripLegDraft[], departure: TripLegDeparture): TripLegDraft[] {
  if (drafts.length === 0) return drafts;

  const next = drafts.map((row) => ({ ...row }));
  if (!next[0].from_label.trim()) {
    next[0] = { ...next[0], from_label: departure.startLabel };
  }

  const effectiveReturn = resolveEffectiveReturnLabel(next, departure);
  const returnIndex = findReturnLegIndex(next, departure);
  if (returnIndex > 0) {
    const previous = next[returnIndex - 1];
    next[returnIndex] = {
      ...next[returnIndex],
      to_label: effectiveReturn,
      from_label: previous?.to_label?.trim() ? previous.to_label : next[returnIndex].from_label,
    };
  }

  for (let index = 1; index < next.length; index += 1) {
    if (index === returnIndex) continue;
    const previous = next[index - 1];
    if (previous?.to_label?.trim()) {
      next[index] = { ...next[index], from_label: previous.to_label };
    }
  }

  return next;
}

export function updateTripLegDraft(
  drafts: TripLegDraft[],
  index: number,
  patch: Partial<TripLegDraft>,
  departure: TripLegDeparture,
): TripLegDraft[] {
  const next = drafts.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
  return normalizeTripLegDrafts(next, departure);
}

export function appendReturnTripLeg(
  drafts: TripLegDraft[],
  sourceIndex: number,
  departure: TripLegDeparture,
): { drafts: TripLegDraft[]; newLegIndex: number } {
  const sourceLeg = drafts[sourceIndex];
  if (!sourceLeg?.to_label.trim()) {
    return { drafts, newLegIndex: -1 };
  }

  let next = [...drafts];
  const existingReturnIndex = findReturnLegIndex(next, departure);
  if (existingReturnIndex >= 0) {
    next = next.filter((_, index) => index !== existingReturnIndex);
  }

  const adjustedSourceIndex = next.findIndex((row) => row.key === sourceLeg.key);
  if (adjustedSourceIndex < 0) {
    return { drafts, newLegIndex: -1 };
  }

  const returnLeg: TripLegDraft = {
    key: crypto.randomUUID(),
    from_label: next[adjustedSourceIndex].to_label.trim(),
    to_label: resolveEffectiveReturnLabel(next, departure),
    distance_km: '',
    bill_to_customer: next[adjustedSourceIndex].bill_to_customer,
  };

  next.push(returnLeg);
  next = normalizeTripLegDrafts(next, departure);
  return { drafts: next, newLegIndex: next.length - 1 };
}

export function insertIntermediateTripLeg(drafts: TripLegDraft[], departure: TripLegDeparture): TripLegDraft[] {
  const returnIndex = findReturnLegIndex(drafts, departure);
  const insertAt = returnIndex >= 0 ? returnIndex : drafts.length;
  const previous = insertAt > 0 ? drafts[insertAt - 1] : null;

  const newLeg: TripLegDraft = {
    key: crypto.randomUUID(),
    from_label: previous?.to_label?.trim() || departure.startLabel,
    to_label: '',
    distance_km: '',
    bill_to_customer: true,
  };

  const next = [...drafts];
  next.splice(insertAt, 0, newLeg);
  return normalizeTripLegDrafts(next, departure);
}

export function removeTripLegAt(drafts: TripLegDraft[], index: number, departure: TripLegDeparture): TripLegDraft[] {
  if (index === 0) return drafts;
  return normalizeTripLegDrafts(
    drafts.filter((_, rowIndex) => rowIndex !== index),
    departure,
  );
}

export function sumTripLegDraftKm(drafts: TripLegDraft[]): number {
  return drafts.reduce((sum, row) => {
    const km = Number(row.distance_km);
    return sum + (Number.isFinite(km) && km > 0 ? km : 0);
  }, 0);
}

export function sumDailyTripKm(logs: WorkReportDailyLog[]): number {
  return logs.reduce((sum, log) => {
    const legSum = (log.trip_legs ?? []).reduce((s, leg) => s + Number(leg.distance_km || 0), 0);
    return sum + legSum;
  }, 0);
}

function logHasKmExpenseLine(log: WorkReportDailyLog): boolean {
  return (log.expense_lines ?? []).some(
    (line) =>
      line.expense_type === 'km'
      && Number(line.qty) > 0
      && (Number(line.unit_price) > 0 || /^Ajomatkat\s*\(/i.test(line.description.trim())),
  );
}

/** Km-korvaus ajomatkoista, jos erillistä km-kuluriviä ei ole vielä tallennettu. */
export function dailyLogTripKmExpenseTotal(
  log: WorkReportDailyLog,
  tripKmRate: number | null | undefined,
): number {
  if (logHasKmExpenseLine(log)) return 0;
  const tripKm = (log.trip_legs ?? []).reduce(
    (sum, leg) => sum + (Number(leg.distance_km) > 0 ? Number(leg.distance_km) : 0),
    0,
  );
  if (!(tripKm > 0) || tripKmRate == null || !(tripKmRate > 0)) return 0;
  const billing = resolveTripKmBillingLine(tripKm, tripKmRate);
  return tripKmLineTotal(billing.qty, billing.unitPrice, billing.usesMinimum);
}

export function dailyLogExpensesTotal(
  log: WorkReportDailyLog,
  tripKmRate?: number | null,
): number {
  const expenseTotal = (log.expense_lines ?? []).reduce(
    (sum, line) => sum + expenseLineTotal(line),
    0,
  );
  return Math.round((expenseTotal + dailyLogTripKmExpenseTotal(log, tripKmRate)) * 100) / 100;
}

export function sumDailyExpensesWithTrips(
  logs: WorkReportDailyLog[],
  tripKmRate?: number | null,
): number {
  return logs.reduce((sum, log) => sum + dailyLogExpensesTotal(log, tripKmRate), 0);
}

export function formatTripLegSummary(leg: DailyTripLeg): string {
  const km = Number(leg.distance_km);
  const kmLabel = Number.isFinite(km) && km > 0 ? `${km.toFixed(1)} km` : '— km';
  return `${leg.from_label} → ${leg.to_label} · ${kmLabel}`;
}

function isDraftRowFilled(row: TripLegDraft): boolean {
  return (
    row.from_label.trim().length > 0 ||
    row.to_label.trim().length > 0 ||
    (Number(row.distance_km) > 0 && Number.isFinite(Number(row.distance_km)))
  );
}

function isDraftRowValid(row: TripLegDraft): boolean {
  const km = Number(row.distance_km);
  if (!Number.isFinite(km) || km <= 0) return false;
  return row.from_label.trim().length > 0 && row.to_label.trim().length > 0;
}

export function validateTripLegDrafts(drafts: TripLegDraft[]): string | null {
  const attempted = drafts.filter(isDraftRowFilled);
  const valid = drafts.filter(isDraftRowValid);
  if (attempted.length > 0 && valid.length === 0) {
    return 'Täytä ajomatkoihin lähtö, kohde ja kilometrit (km).';
  }
  for (const row of attempted) {
    if (!row.from_label.trim() || !row.to_label.trim()) {
      return 'Jokaisella ajomatkalla pitää olla lähtö ja kohde.';
    }
    const km = Number(row.distance_km);
    if (!Number.isFinite(km) || km <= 0) {
      return 'Anna ajomatkan pituus kilometreinä.';
    }
  }
  return null;
}

export async function saveTripLegs(
  supabase: SupabaseClient,
  dailyLogId: string,
  drafts: TripLegDraft[],
) {
  const validationError = validateTripLegDrafts(drafts);
  if (validationError) throw new Error(validationError);

  const valid = drafts.filter(isDraftRowValid);

  const { error: deleteError } = await supabase
    .from('work_report_daily_trip_legs')
    .delete()
    .eq('daily_log_id', dailyLogId);
  if (deleteError) throw deleteError;

  if (valid.length === 0) return;

  const { error: insertError } = await supabase.from('work_report_daily_trip_legs').insert(
    valid.map((row, index) => ({
      daily_log_id: dailyLogId,
      from_label: row.from_label.trim(),
      to_label: row.to_label.trim(),
      distance_km: Number(row.distance_km),
      bill_to_customer: row.bill_to_customer,
      sort_order: index,
    })),
  );
  if (insertError) throw insertError;
}
