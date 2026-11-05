import type { WorkReportDailyLog } from '../types';
import {
  parseDailyLogPartnerBilling,
  serializeDailyLogPartnerBilling,
  type DailyLogPartnerBilling,
} from './commissionBillingMode';
import { isLikelyAutoTripKmExpense } from './tripKmExpense';

// Urakka ja Takuu kuuluvat koko työraportille. Tallennus pysyy kirjauskohtaisena (taaksepäin
// yhteensopiva): raportin kytkin päivittää kaikkien kirjausten liput kerralla.

export type ReportFlagLog = Pick<
  WorkReportDailyLog,
  | 'id'
  | 'entry_type'
  | 'hours_regular'
  | 'hours_overtime'
  | 'hours_on_call'
  | 'partner_billing'
  | 'customer_extra_billing'
  | 'expense_lines'
  | 'refrigerant_lines'
>;

export type LogPatch = { id: string; patch: Record<string, unknown> };

export function reportWarrantyOn(logs: Pick<WorkReportDailyLog, 'partner_billing'>[]): boolean {
  return logs.some((log) => parseDailyLogPartnerBilling(log.partner_billing).warranty === true);
}

/** Lisälaskutuskirjaus (tavallinen tuntikirjaus urakan päällä) ei kuulu urakkaan. */
function isExtraBillingLog(log: ReportFlagLog): boolean {
  return log.entry_type !== 'fixed_price' && parseDailyLogPartnerBilling(log.partner_billing).extra_billing === true;
}

function withBilling(log: ReportFlagLog, change: Partial<DailyLogPartnerBilling>) {
  const current = parseDailyLogPartnerBilling(log.partner_billing);
  return serializeDailyLogPartnerBilling({ ...current, ...change });
}

/** Urakka päälle: kaikki kirjaukset (paitsi Lisälaskutus) urakkapäiviksi, tunnit säilyvät kalenterissa. Pois: takaisin tavallisiksi. */
export function buildUrakkaToggleUpdates(logs: ReportFlagLog[], on: boolean): LogPatch[] {
  const out: LogPatch[] = [];
  for (const log of logs) {
    if (on) {
      if (log.entry_type === 'fixed_price' || isExtraBillingLog(log)) continue;
      const hours =
        (Number(log.hours_regular) || 0) + (Number(log.hours_overtime) || 0) + (Number(log.hours_on_call) || 0);
      out.push({
        id: log.id,
        patch: {
          entry_type: 'fixed_price',
          hours_regular: hours,
          hours_overtime: 0,
          hours_on_call: 0,
          hourly_rate_override: null,
          customer_hourly_rate_override: null,
          partner_billing: withBilling(log, { urakka_all_in: true, extra_billing: false }),
        },
      });
    } else {
      if (log.entry_type !== 'fixed_price') continue;
      const flags = parseDailyLogPartnerBilling(log.partner_billing);
      out.push({
        id: log.id,
        patch: {
          entry_type: 'regular',
          fixed_price_amount: null,
          customer_fixed_price_amount: null,
          partner_urakka_margin_percent: null,
          partner_billing: withBilling(log, {
            urakka_all_in: false,
            hours_row_billed: flags.warranty === true ? flags.hours_row_billed : false,
          }),
        },
      });
    }
  }
  return out;
}

function withSupplyWarranty(log: ReportFlagLog, on: boolean): Record<string, unknown> | null | undefined {
  const lines = [...(log.expense_lines ?? [])].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  const flagLines = lines.filter(
    (line) => !isLikelyAutoTripKmExpense({ key: '', expense_type: line.expense_type ?? '', description: String(line.description ?? '') }),
  );
  if (flagLines.length === 0) return undefined;
  const raw =
    log.customer_extra_billing && typeof log.customer_extra_billing === 'object'
      ? { ...(log.customer_extra_billing as Record<string, unknown>) }
      : {};
  const flags: Array<Record<string, unknown>> = Array.isArray(raw.supply_line_flags)
    ? (raw.supply_line_flags as Array<Record<string, unknown>>).map((row) => ({ ...(row ?? {}) }))
    : [];
  for (let i = flags.length; i < flagLines.length; i++) {
    const line = flagLines[i];
    flags.push({ extra_billable: line?.extra_billable === true, extra_billing_allowed: line?.extra_billing_allowed === true });
  }
  for (let i = 0; i < flagLines.length; i++) {
    if (on) flags[i].warranty = true;
    else delete flags[i].warranty;
  }
  raw.supply_line_flags = flags;
  return raw;
}

/** Takuu päälle/pois koko raportille: tunnit, ajomatkat, kulu- ja kylmäainerivit. */
export function buildWarrantyToggleUpdates(logs: ReportFlagLog[], on: boolean): LogPatch[] {
  const out: LogPatch[] = [];
  for (const log of logs) {
    const current = parseDailyLogPartnerBilling(log.partner_billing);
    const refrigerantCount = (log.refrigerant_lines ?? []).length;
    const refrigerantFlags = refrigerantCount
      ? Array.from({ length: refrigerantCount }, (_, i) => {
          const prev = current.refrigerant_flags?.[i] ?? {};
          const next = { ...prev };
          if (on) next.warranty = true;
          else delete next.warranty;
          return next;
        })
      : undefined;
    const billing = withBilling(log, {
      warranty: on,
      trips_warranty: on,
      hours_row_billed:
        on || log.entry_type === 'fixed_price' ? current.hours_row_billed : false,
      ...(refrigerantFlags ? { refrigerant_flags: refrigerantFlags } : {}),
    });
    const patch: Record<string, unknown> = { partner_billing: billing };
    const supply = withSupplyWarranty(log, on);
    if (supply !== undefined) patch.customer_extra_billing = supply;
    out.push({ id: log.id, patch });
  }
  return out;
}
