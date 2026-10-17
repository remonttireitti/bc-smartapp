import type { SupabaseClient } from '@supabase/supabase-js';
import { buildWorkReportTitle } from '../types';
import type { HuoltoSettings } from './huoltoCategories';
import { computePartnerUrakkaFromCustomer, DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT, roundUrakkaMoney } from './workReportUrakkaBilling';
import { saveWorkReportEquipmentLinks } from './workReportEquipment';
import { markPartnerBillableRecalcNeeded } from './workReportPartnerBillingPersist';

export type HuoltoTransferReport = {
  id: string;
  owner_company_id: string;
  branding_company_id: string | null;
  partnership_id: string | null;
  customer_id: string | null;
  equipment_id: string | null;
  subscriber_id: string | null;
};

export type HuoltoTransferInput = {
  report: HuoltoTransferReport;
  customerName: string;
  typeLabel: string;
  deviceLabel?: string;
  /** Perushinta €, alv 0 %. */
  price: number;
  /** Lisätunnit ja tuntihinta (alv 0 %). */
  hours: number;
  hourlyRate: number;
  logDate: string;
  done: boolean;
  sessionUserId: string;
  creatorCompanyId: string;
};

export function parseEuroInput(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? roundUrakkaMoney(n) : 0;
}

/** Hinnaston oletukset raporttityypille (perushinta + tuntihinta). */
export function huoltoPriceDefaults(settings: HuoltoSettings | null, typeKey: string): { price: number; hourly: number } {
  const t = settings?.types[typeKey];
  return { price: t?.price ?? 0, hourly: t?.hourly ?? 0 };
}

export function huoltoTransferTotal(input: Pick<HuoltoTransferInput, 'price' | 'hours' | 'hourlyRate'>): number {
  const hoursPart = input.hours > 0 && input.hourlyRate > 0 ? input.hours * input.hourlyRate : 0;
  return roundUrakkaMoney((input.price > 0 ? input.price : 0) + hoursPart);
}

export function buildHuoltoWorkReportPayload(input: HuoltoTransferInput) {
  const snippet = [input.typeLabel, input.deviceLabel].filter(Boolean).join(' ');
  return {
    title: buildWorkReportTitle(input.customerName, snippet),
    heading: snippet || null,
    description: null,
    orderer_name: null,
    subscriber_id: input.report.subscriber_id,
    location_text: null,
    owner_company_id: input.report.owner_company_id,
    created_by_company_id: input.creatorCompanyId,
    branding_company_id: input.report.branding_company_id ?? input.report.owner_company_id,
    partnership_id: input.report.partnership_id,
    customer_id: input.report.customer_id,
    equipment_id: input.report.equipment_id,
    created_by_user_id: input.sessionUserId,
    assigned_user_id: input.sessionUserId,
    scheduled_start: null,
    scheduled_end: null,
    status: (input.done ? 'completed' : 'in_progress') as 'completed' | 'in_progress',
    completed_at: input.done ? new Date().toISOString() : null,
  };
}

/** Päiväkirjaukset: perushinta urakkana ja lisätunnit tuntityönä hinnaston tuntihinnalla. */
export function buildHuoltoDailyLogs(input: HuoltoTransferInput, workReportId: string) {
  const common = {
    work_report_id: workReportId,
    log_date: input.logDate,
    hours_overtime: 0,
    hours_on_call: 0,
    commission_amount: 0,
    commission_note: null,
    created_by: input.sessionUserId,
  };
  const logs: Array<Record<string, unknown>> = [];
  if (input.price > 0) {
    logs.push({
      ...common,
      entry_type: 'fixed_price',
      hours_regular: 0,
      customer_fixed_price_amount: roundUrakkaMoney(input.price),
      // Kumppanin osuus samalla oletuskatteella kuin käsin kirjatussa urakassa.
      fixed_price_amount: computePartnerUrakkaFromCustomer(input.price, DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT),
      partner_urakka_margin_percent: DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT,
      work_done: `${input.typeLabel} huoltoraportin mukaan`,
    });
  }
  if (input.hours > 0) {
    logs.push({
      ...common,
      entry_type: 'regular',
      hours_regular: input.hours,
      customer_hourly_rate_override: input.hourlyRate > 0 ? roundUrakkaMoney(input.hourlyRate) : null,
      work_done: `${input.typeLabel}: lisätyö`,
    });
  }
  return logs;
}

/** Luo työraportin huoltoraportista ja palauttaa sen id:n. */
export async function createWorkReportFromHuolto(supabase: SupabaseClient, input: HuoltoTransferInput): Promise<string> {
  if (!(input.price > 0) && !(input.hours > 0)) throw new Error('Anna perushinta tai lisätunnit.');
  const { data: report, error } = await supabase
    .from('work_reports')
    .insert(buildHuoltoWorkReportPayload(input))
    .select('id')
    .single();
  if (error || !report?.id) throw new Error(error?.message ?? 'Työraportin luonti epäonnistui.');
  const workReportId = report.id as string;
  await supabase.from('work_report_billing').insert({ work_report_id: workReportId });
  if (input.report.equipment_id) {
    await saveWorkReportEquipmentLinks(supabase, workReportId, [input.report.equipment_id]);
  }
  const logs = buildHuoltoDailyLogs(input, workReportId);
  const { error: logError } = await supabase.from('work_report_daily_logs').insert(logs);
  if (logError) throw new Error(`Työraportti luotiin, mutta kirjausten tallennus epäonnistui: ${logError.message}`);
  if (input.creatorCompanyId !== input.report.owner_company_id) {
    await markPartnerBillableRecalcNeeded(supabase, workReportId);
  }
  return workReportId;
}
