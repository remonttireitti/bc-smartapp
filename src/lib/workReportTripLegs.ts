import type { SupabaseClient } from '@supabase/supabase-js';

import type { CompanySettings } from './management';
import type { DailyTripLeg, WorkReport, WorkReportDailyLog } from '../types';

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

export function resolveWorkReportSiteLabel(report: Pick<WorkReport, 'location_text' | 'customers'>): string {
  const location = report.location_text?.trim();
  if (location) return location;
  const customerName = report.customers?.name?.trim();
  if (customerName) return customerName;
  return 'Kohde';
}

export function buildDefaultTripLegs(
  siteLabel: string,
  officeLabel = 'Toimisto',
): TripLegDraft[] {
  return [
    {
      key: crypto.randomUUID(),
      from_label: officeLabel,
      to_label: siteLabel,
      distance_km: '',
      bill_to_customer: true,
    },
    {
      key: crypto.randomUUID(),
      from_label: siteLabel,
      to_label: officeLabel,
      distance_km: '',
      bill_to_customer: true,
    },
  ];
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
  includeCustomerFields: boolean,
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
      ...(includeCustomerFields ? { bill_to_customer: row.bill_to_customer } : {}),
      sort_order: index,
    })),
  );
  if (insertError) throw insertError;
}
