import type { WorkReportDailyLog } from '../types';
import type { BillingQuoteExtraCustomerWork, BillingQuoteExtraExpenseLine } from './billingQuoteExtraWork';
import {
  buildSupplyLineFlagsFromExpenseDrafts,
  computeSupplyCustomerUnitPrice,
  expenseExtraBillable,
  expenseExtraBillingAllowed,
  resolveExpenseBillingMode,
  resolveExpensePurchaseUnitPrice,
  resolveSupplyMarginPercent,
  type SupplyLineExtraBillingFlag,
} from './workReportExpenseBilling';

export type DailyLogCustomerExtraBilling = {
  hours?: number;
  hourly_rate?: number | null;
  description?: string;
  /** Tunnit voivat olla lisälaskutettavissa tarjouksen päälle. */
  hours_extra_billable?: boolean;
  /** Lupa lisälaskutukseen on saatu — tunnit laskutetaan asiakkaalta. */
  hours_extra_billing_allowed?: boolean;
  expense_description?: string;
  expense_qty?: number;
  expense_customer_unit_price?: number;
  expense_purchase_unit_price?: number | null;
  /** false = kumppanin piikki, ei välihankintalaskutusta */
  expense_bill_to_partner?: boolean;
  /** Tarvike/kulu-rivien lisälaskutus (indeksi = tallennetun rivin järjestys). */
  supply_line_flags?: SupplyLineExtraBillingFlag[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function lineTotal(qty: number, unitPrice: number): number {
  return roundMoney(qty * unitPrice);
}

export function parseDailyLogCustomerExtraBilling(raw: unknown): DailyLogCustomerExtraBilling {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  const num = (key: string) => {
    const value = record[key];
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? roundMoney(parsed) : null;
  };
  const description =
    typeof record.description === 'string' ? record.description.trim() : '';
  const expenseDescription =
    typeof record.expense_description === 'string' ? record.expense_description.trim() : '';
  const hours = num('hours') ?? 0;
  const hourlyRate = num('hourly_rate');
  const expenseQty = num('expense_qty') ?? 0;
  const expenseCustomer = num('expense_customer_unit_price');
  const expensePurchase = num('expense_purchase_unit_price');
  const billToPartner = record.expense_bill_to_partner;
  const hoursExtraBillable = record.hours_extra_billable === true;
  const hoursExtraBillingAllowed = record.hours_extra_billing_allowed === true;
  const supplyLineFlags = parseSupplyLineFlags(record.supply_line_flags);
  return {
    hours: hours > 0 ? hours : 0,
    hourly_rate: hourlyRate != null && hourlyRate > 0 ? hourlyRate : null,
    description,
    hours_extra_billable: hoursExtraBillable,
    hours_extra_billing_allowed: hoursExtraBillingAllowed,
    expense_description: expenseDescription,
    expense_qty: expenseQty > 0 ? expenseQty : 0,
    expense_customer_unit_price:
      expenseCustomer != null && expenseCustomer > 0 ? expenseCustomer : undefined,
    expense_purchase_unit_price:
      expensePurchase != null && expensePurchase > 0 ? expensePurchase : null,
    expense_bill_to_partner: billToPartner === false ? false : billToPartner === true ? true : undefined,
    supply_line_flags: supplyLineFlags.length > 0 ? supplyLineFlags : undefined,
  };
}

function parseSupplyLineFlags(raw: unknown): SupplyLineExtraBillingFlag[] {
  if (!Array.isArray(raw)) return [];
  const parsed: SupplyLineExtraBillingFlag[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const marginRaw = row.customer_margin_percent;
    const margin =
      marginRaw != null && String(marginRaw).trim() !== '' && Number.isFinite(Number(marginRaw))
        ? Number(marginRaw)
        : null;
    parsed.push({
      extra_billable: row.extra_billable === true,
      extra_billing_allowed: row.extra_billing_allowed === true,
      ...(margin != null && margin >= 0 && margin < 100
        ? { customer_margin_percent: margin }
        : {}),
    });
  }
  return parsed;
}

export function normalizeDailyLogCustomerExtraBilling(
  billing: DailyLogCustomerExtraBilling,
): DailyLogCustomerExtraBilling {
  const parsed = parseDailyLogCustomerExtraBilling(billing);
  if (!dailyLogCustomerExtraBillingHasData(parsed)) return {};
  return parsed;
}

function dailyLogCustomerExtraBillingHasExpenseData(
  billing: DailyLogCustomerExtraBilling,
): boolean {
  return (
    !!billing.expense_description
    && Number(billing.expense_qty) > 0
    && Number(billing.expense_customer_unit_price) > 0
  );
}

export function dailyLogCustomerExtraBillingHasData(
  billing: DailyLogCustomerExtraBilling | null | undefined,
): boolean {
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  return (
    hoursExtraBillable(parsed)
    || dailyLogCustomerExtraBillingHasExpenseData(parsed)
    || (parsed.supply_line_flags?.length ?? 0) > 0
  );
}

export function serializeDailyLogCustomerExtraBilling(
  billing: DailyLogCustomerExtraBilling,
): Record<string, unknown> {
  if (!dailyLogCustomerExtraBillingHasData(billing)) return {};

  const out: Record<string, unknown> = {};

  if (hoursExtraBillable(billing)) {
    out.hours_extra_billable = true;
    out.hours_extra_billing_allowed = hoursExtraBillingApproved(billing);
    const hours = resolveExtraBillableHours(billing);
    if (hours > 0) {
      out.hours = hours;
      if (hoursExtraBillingApproved(billing)) {
        out.hourly_rate =
          billing.hourly_rate != null && billing.hourly_rate > 0 ? billing.hourly_rate : null;
        const description =
          typeof billing.description === 'string' ? billing.description.trim() : '';
        if (description) out.description = description;
      }
    }
  }

  const expenseDescription =
    typeof billing.expense_description === 'string' ? billing.expense_description.trim() : '';
  const expenseQty = Number(billing.expense_qty) || 0;
  const expenseCustomer = Number(billing.expense_customer_unit_price) || 0;
  if (expenseDescription && expenseQty > 0 && expenseCustomer > 0) {
    out.expense_description = expenseDescription;
    out.expense_qty = expenseQty;
    out.expense_customer_unit_price = expenseCustomer;
    const purchase = billing.expense_purchase_unit_price;
    out.expense_purchase_unit_price =
      purchase != null && purchase > 0 ? purchase : null;
    if (billing.expense_bill_to_partner === false) out.expense_bill_to_partner = false;
    else if (billing.expense_bill_to_partner === true) out.expense_bill_to_partner = true;
  }

  if (billing.supply_line_flags?.length) {
    out.supply_line_flags = billing.supply_line_flags.map((row) => ({
      extra_billable: row.extra_billable === true,
      extra_billing_allowed: row.extra_billing_allowed === true,
      ...(row.customer_margin_percent != null
        ? { customer_margin_percent: row.customer_margin_percent }
        : {}),
    }));
  }

  return out;
}

export type DailyLogExtraBillingFormFields = {
  hours_extra_billable: boolean;
  hours_extra_billing_allowed: boolean;
  /** Montako tuntia voi olla lisälaskutettavissa (≤ päivän tuntimäärä). */
  hours_extra_hours: string;
  extra_expense_description: string;
  extra_expense_qty: string;
  extra_expense_customer_price: string;
  extra_expense_purchase_price: string;
  extra_expense_partner_billing: 'charge' | 'piikki';
};

export type DailyLogExtraBillingLogForm = DailyLogExtraBillingFormFields & {
  entry_type: string;
  hours_regular: string;
  hours_overtime: string;
  hours_on_call: string;
  work_done: string;
  customer_hourly_rate_override: string;
};

export function emptyDailyLogExtraBillingForm(): DailyLogExtraBillingFormFields {
  return {
    hours_extra_billable: false,
    hours_extra_billing_allowed: false,
    hours_extra_hours: '',
    extra_expense_description: '',
    extra_expense_qty: '1',
    extra_expense_customer_price: '',
    extra_expense_purchase_price: '',
    extra_expense_partner_billing: 'charge',
  };
}

export function billableHoursFromLogEntry(entry: {
  entry_type: string;
  hours_regular: number | string;
  hours_overtime: number | string;
  hours_on_call: number | string;
}): number {
  switch (entry.entry_type) {
    case 'on_call':
      return Number(entry.hours_on_call) || 0;
    case 'overtime':
      return Number(entry.hours_overtime) || 0;
    case 'regular_and_overtime':
      return (Number(entry.hours_regular) || 0) + (Number(entry.hours_overtime) || 0);
    case 'regular':
    case 'fixed_price':
      return Number(entry.hours_regular) || 0;
    default:
      return Number(entry.hours_regular) || 0;
  }
}

export function hoursExtraBillable(billing: DailyLogCustomerExtraBilling | null | undefined): boolean {
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  if (parsed.hours_extra_billable === true) return true;
  if (parsed.hours_extra_billable === false) return false;
  return Number(parsed.hours) > 0;
}

export function hoursExtraBillingApproved(
  billing: DailyLogCustomerExtraBilling | null | undefined,
): boolean {
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  if (parsed.hours_extra_billable === true) {
    return parsed.hours_extra_billing_allowed === true;
  }
  if (parsed.hours_extra_billable === false) return false;
  return Number(parsed.hours) > 0;
}

export function resolveExtraBillableHours(
  billing: DailyLogCustomerExtraBilling | null | undefined,
): number {
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  if (!hoursExtraBillable(parsed)) return 0;
  return Math.max(0, Number(parsed.hours) || 0);
}

export function hoursExtraBillingLabel(
  billing: DailyLogCustomerExtraBilling | null | undefined,
): string | null {
  if (!hoursExtraBillable(billing)) return 'kuuluu tarjoukseen';
  const extraHours = resolveExtraBillableHours(billing);
  const hoursPart = extraHours > 0 ? `${extraHours} h · ` : '';
  if (!hoursExtraBillingApproved(billing)) return `${hoursPart}lisälaskutettavissa · ei lupaa`;
  return `${hoursPart}Lisälaskutettava`;
}

export type HoursExtraBillingMarginImpact = {
  currentMarginImpactNet: number;
  marginIfApprovedNet: number;
};

export function hoursExtraBillingMarginImpact(
  billing: DailyLogCustomerExtraBilling | null | undefined,
  partnerHourly: number,
  customerHourly: number,
): HoursExtraBillingMarginImpact | null {
  if (!hoursExtraBillable(billing)) return null;
  const hours = resolveExtraBillableHours(billing);
  if (!(hours > 0)) return null;
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  const customerRate =
    parsed.hourly_rate != null && parsed.hourly_rate > 0 ? parsed.hourly_rate : customerHourly;
  const customerNet = lineTotal(hours, customerRate);
  const partnerNet = lineTotal(hours, partnerHourly);
  const marginIfApprovedNet = roundMoney(customerNet - partnerNet);
  if (hoursExtraBillingApproved(billing)) {
    return { currentMarginImpactNet: marginIfApprovedNet, marginIfApprovedNet };
  }
  return { currentMarginImpactNet: 0, marginIfApprovedNet };
}

export function formatHoursExtraBillingMarginNote(
  billing: DailyLogCustomerExtraBilling | null | undefined,
  partnerHourly: number,
  customerHourly: number,
  formatMoney: (value: number) => string,
): string | null {
  const label = hoursExtraBillingLabel(billing);
  const impact = hoursExtraBillingMarginImpact(billing, partnerHourly, customerHourly);
  if (!label || !impact) return label;
  if (hoursExtraBillingApproved(billing)) {
    const sign = impact.currentMarginImpactNet >= 0 ? '+' : '−';
    return `${label} · kate ${sign} ${formatMoney(Math.abs(impact.currentMarginImpactNet))}`;
  }
  const approvedSign = impact.marginIfApprovedNet >= 0 ? '+' : '−';
  return `${label} · jos lupa: ${approvedSign} ${formatMoney(Math.abs(impact.marginIfApprovedNet))} kate`;
}

export function dailyLogExtraBillingToForm(
  billing: DailyLogCustomerExtraBilling | null | undefined,
): DailyLogExtraBillingFormFields {
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  const legacyHours = Number(parsed.hours) > 0;
  return {
    hours_extra_billable: parsed.hours_extra_billable === true || (parsed.hours_extra_billable !== false && legacyHours),
    hours_extra_billing_allowed: parsed.hours_extra_billing_allowed === true || (parsed.hours_extra_billable !== false && legacyHours),
    hours_extra_hours:
      parsed.hours != null && parsed.hours > 0 ? String(parsed.hours) : '',
    extra_expense_description: parsed.expense_description ?? '',
    extra_expense_qty:
      parsed.expense_qty != null && parsed.expense_qty > 0 ? String(parsed.expense_qty) : '1',
    extra_expense_customer_price:
      parsed.expense_customer_unit_price != null && parsed.expense_customer_unit_price > 0
        ? String(parsed.expense_customer_unit_price)
        : '',
    extra_expense_purchase_price:
      parsed.expense_purchase_unit_price != null && parsed.expense_purchase_unit_price > 0
        ? String(parsed.expense_purchase_unit_price)
        : '',
    extra_expense_partner_billing:
      parsed.expense_bill_to_partner === false ? 'piikki' : 'charge',
  };
}

export function buildCustomerExtraBillingFromLogForm(
  form: DailyLogExtraBillingLogForm,
  expenseDrafts?: Array<{
    expense_type: string;
    description: string;
    extra_billable: boolean;
    extra_billing_allowed: boolean;
    customer_margin_percent: string;
    bill_to_partner: boolean;
    bill_to_customer: boolean;
    qty: string;
    unit_price: string;
  }>,
): DailyLogCustomerExtraBilling {
  const expenseQty = Number(form.extra_expense_qty || 0);
  const expenseCustomer = Number(form.extra_expense_customer_price || 0);
  const expensePurchase = Number(form.extra_expense_purchase_price || 0);
  const totalHours = billableHoursFromLogEntry(form);
  const extraHours = Math.min(
    Math.max(0, Number(form.hours_extra_hours) || 0),
    totalHours > 0 ? totalHours : Number.POSITIVE_INFINITY,
  );
  const customerHourlyOverride = Number(form.customer_hourly_rate_override || 0);
  const payload: DailyLogCustomerExtraBilling = {};

  if (form.hours_extra_billable) {
    payload.hours_extra_billable = true;
    payload.hours_extra_billing_allowed = form.hours_extra_billing_allowed;
    if (extraHours > 0) {
      payload.hours = extraHours;
      if (form.hours_extra_billing_allowed) {
        payload.hourly_rate = customerHourlyOverride > 0 ? customerHourlyOverride : null;
        payload.description = form.work_done.trim() || 'Lisätyö';
      }
    }
  }

  const expenseDescription = form.extra_expense_description.trim();
  if (expenseDescription && expenseQty > 0 && expenseCustomer > 0) {
    payload.expense_description = expenseDescription;
    payload.expense_qty = expenseQty;
    payload.expense_customer_unit_price = expenseCustomer;
    payload.expense_purchase_unit_price = expensePurchase > 0 ? expensePurchase : null;
    payload.expense_bill_to_partner =
      form.extra_expense_partner_billing === 'piikki' ? false : expensePurchase > 0 ? true : undefined;
  }

  const supplyFlags = expenseDrafts ? buildSupplyLineFlagsFromExpenseDrafts(expenseDrafts) : [];
  if (supplyFlags.length > 0) {
    payload.supply_line_flags = supplyFlags;
  }

  return payload;
}

/** @deprecated Käytä buildCustomerExtraBillingFromLogForm */
export function dailyLogExtraBillingFromForm(
  form: DailyLogExtraBillingFormFields,
): DailyLogCustomerExtraBilling {
  return buildCustomerExtraBillingFromLogForm({
    ...form,
    entry_type: 'regular',
    hours_regular: '0',
    hours_overtime: '0',
    hours_on_call: '0',
    work_done: '',
    customer_hourly_rate_override: '',
  });
}

export function dailyLogQuoteExtrasSubtitle(form: DailyLogExtraBillingLogForm): string {
  const billing = buildCustomerExtraBillingFromLogForm(form);
  if (!dailyLogCustomerExtraBillingHasData(billing)) return 'Ei lisälaskutusta';
  const parts: string[] = [];
  const hourLabel = hoursExtraBillingLabel(billing);
  if (hourLabel && hoursExtraBillable(billing)) {
    const extraHours = resolveExtraBillableHours(billing);
    if (extraHours > 0) parts.push(`${extraHours} h · ${hourLabel}`);
    else parts.push(hourLabel);
  }
  if (
    billing.expense_description
    && billing.expense_qty
    && billing.expense_customer_unit_price
  ) {
    parts.push('kulu/tarvike');
  }
  if (billing.description) {
    const short =
      billing.description.length > 40
        ? `${billing.description.slice(0, 39).trimEnd()}…`
        : billing.description;
    parts.push(short);
  }
  return parts.join(' · ') || 'Täytetty';
}

function extraExpenseLinesFromLogExpenseRows(log: WorkReportDailyLog): BillingQuoteExtraExpenseLine[] {
  const lines: BillingQuoteExtraExpenseLine[] = [];
  for (const expense of log.expense_lines ?? []) {
    if (resolveExpenseBillingMode(expense) !== 'customer_only') continue;
    if (!expenseExtraBillingAllowed(expense)) continue;
    const qty = Number(expense.qty) || 0;
    const purchase = resolveExpensePurchaseUnitPrice(expense);
    if (!(qty > 0) || purchase == null || !(purchase > 0)) continue;
    const customerRaw = expense.customer_unit_price != null ? Number(expense.customer_unit_price) : null;
    const customerUnit =
      customerRaw != null && customerRaw > 0
        ? customerRaw
        : computeSupplyCustomerUnitPrice(purchase, resolveSupplyMarginPercent(expense));
    if (!(customerUnit > 0)) continue;
    lines.push({
      id: `${log.id}:expense:${expense.id}`,
      description: String(expense.description ?? '').trim() || 'Tarvike',
      qty,
      customer_unit_price: customerUnit,
      purchase_unit_price: purchase,
      bill_to_partner: false,
    });
  }
  return lines;
}

export function extraCustomerWorkFromDailyLogs(
  logs: WorkReportDailyLog[],
): BillingQuoteExtraCustomerWork[] {
  const works: BillingQuoteExtraCustomerWork[] = [];
  for (const log of logs) {
    const extra = parseDailyLogCustomerExtraBilling(log.customer_extra_billing);
    if (!dailyLogCustomerExtraBillingHasData(extra)) continue;
    const approvedHours = hoursExtraBillingApproved(extra) ? Number(extra.hours) || 0 : 0;
    const expenseLines =
      extra.expense_description
      && extra.expense_qty
      && extra.expense_qty > 0
      && extra.expense_customer_unit_price
      && extra.expense_customer_unit_price > 0
        ? [
            {
              id: `${log.id}:extra-expense`,
              description: extra.expense_description,
              qty: extra.expense_qty,
              customer_unit_price: extra.expense_customer_unit_price,
              purchase_unit_price: extra.expense_purchase_unit_price ?? null,
              bill_to_partner: extra.expense_bill_to_partner,
            },
          ]
        : undefined;
    const expenseLineExtras = extraExpenseLinesFromLogExpenseRows(log);
    const mergedExpenseLines = expenseLines
      ? [...expenseLines, ...expenseLineExtras]
      : expenseLineExtras.length > 0
        ? expenseLineExtras
        : undefined;
    if (approvedHours <= 0 && !mergedExpenseLines?.length) continue;

    works.push({
      id: log.id,
      work_date: log.log_date.slice(0, 10),
      description: extra.description ?? log.work_done?.trim() ?? '',
      hours: approvedHours,
      hourly_rate: extra.hourly_rate ?? null,
      expense_lines: mergedExpenseLines,
    });
  }

  for (const log of logs) {
    const extra = parseDailyLogCustomerExtraBilling(log.customer_extra_billing);
    if (dailyLogCustomerExtraBillingHasData(extra)) continue;
    const expenseLineExtras = extraExpenseLinesFromLogExpenseRows(log);
    if (expenseLineExtras.length === 0) continue;
    works.push({
      id: `${log.id}:supply-extras`,
      work_date: log.log_date.slice(0, 10),
      description: 'Lisätarvikkeet',
      hours: 0,
      hourly_rate: null,
      expense_lines: expenseLineExtras,
    });
  }

  return works;
}

export function shouldCalculateCustomerQuoteExtrasFromLogs(logs: WorkReportDailyLog[]): boolean {
  return extraCustomerWorkFromDailyLogs(logs).length > 0;
}

export type QuoteExtrasMarginLine = {
  logId: string;
  logDate: string;
  kind: 'extra_work' | 'extra_supply';
  description: string;
  customerNet: number;
  partnerNet: number;
  piikkiCostNet: number;
  marginNet: number;
};

/** Lisälaskutuksen vaikutus katteeseen (asiakas − kumppanilasku − piikki-hankinta). */
export function computeQuoteExtrasMarginFromLogs(
  logs: WorkReportDailyLog[],
  partnerRates: { hourly_regular?: number | null },
  customerRates?: { hourly_regular?: number | null },
): {
  customerExtrasNet: number;
  partnerBilledExtrasNet: number;
  piikkiMaterialCostNet: number;
  extrasMarginNet: number;
  lines: QuoteExtrasMarginLine[];
} {
  const partnerHourly = Number(partnerRates.hourly_regular) || 0;
  const customerHourlyDefault = Number(customerRates?.hourly_regular) || 0;
  const lines: QuoteExtrasMarginLine[] = [];
  let customerExtrasNet = 0;
  let partnerBilledExtrasNet = 0;
  let piikkiMaterialCostNet = 0;

  for (const log of logs) {
    const logDate = log.log_date.slice(0, 10);

    for (const expense of log.expense_lines ?? []) {
      if (resolveExpenseBillingMode(expense) !== 'customer_only') continue;
      if (!expenseExtraBillingAllowed(expense)) continue;
      const qty = Number(expense.qty) || 0;
      const purchase = resolveExpensePurchaseUnitPrice(expense);
      if (!(qty > 0) || purchase == null || !(purchase > 0)) continue;
      const customerRaw = expense.customer_unit_price != null ? Number(expense.customer_unit_price) : null;
      const customerRate =
        customerRaw != null && customerRaw > 0
          ? customerRaw
          : computeSupplyCustomerUnitPrice(purchase, resolveSupplyMarginPercent(expense));
      const customerNet = lineTotal(qty, customerRate);
      const partnerNet = 0;
      const piikkiCostNet = lineTotal(qty, purchase);
      const marginNet = roundMoney(customerNet - piikkiCostNet);
      customerExtrasNet += customerNet;
      piikkiMaterialCostNet += piikkiCostNet;
      lines.push({
        logId: log.id,
        logDate,
        kind: 'extra_supply',
        description: String(expense.description ?? '').trim() || 'Tarvike',
        customerNet,
        partnerNet,
        piikkiCostNet,
        marginNet,
      });
    }

    const extra = parseDailyLogCustomerExtraBilling(log.customer_extra_billing);
    if (!dailyLogCustomerExtraBillingHasData(extra)) continue;

    if (!hoursExtraBillingApproved(extra)) continue;

    const hours = Number(extra.hours) || 0;
    if (hours > 0) {
      const customerRate =
        extra.hourly_rate != null && extra.hourly_rate > 0 ? extra.hourly_rate : customerHourlyDefault;
      const customerNet = lineTotal(hours, customerRate);
      const partnerNet = lineTotal(hours, partnerHourly);
      const marginNet = roundMoney(customerNet - partnerNet);
      customerExtrasNet += customerNet;
      partnerBilledExtrasNet += partnerNet;
      lines.push({
        logId: log.id,
        logDate,
        kind: 'extra_work',
        description: extra.description?.trim() || 'Lisätyö',
        customerNet,
        partnerNet,
        piikkiCostNet: 0,
        marginNet,
      });
    }

    if (
      extra.expense_description
      && Number(extra.expense_qty) > 0
      && Number(extra.expense_customer_unit_price) > 0
    ) {
      const qty = Number(extra.expense_qty);
      const customerNet = lineTotal(qty, Number(extra.expense_customer_unit_price));
      const purchase = Number(extra.expense_purchase_unit_price) || 0;
      const billToPartner = extra.expense_bill_to_partner !== false && purchase > 0;
      const partnerNet = billToPartner ? lineTotal(qty, purchase) : 0;
      const piikkiCostNet = !billToPartner && purchase > 0 ? lineTotal(qty, purchase) : 0;
      const marginNet = roundMoney(customerNet - partnerNet - piikkiCostNet);
      customerExtrasNet += customerNet;
      partnerBilledExtrasNet += partnerNet;
      piikkiMaterialCostNet += piikkiCostNet;
      lines.push({
        logId: log.id,
        logDate,
        kind: 'extra_supply',
        description: extra.expense_description,
        customerNet,
        partnerNet,
        piikkiCostNet,
        marginNet,
      });
    }
  }

  return {
    customerExtrasNet: roundMoney(customerExtrasNet),
    partnerBilledExtrasNet: roundMoney(partnerBilledExtrasNet),
    piikkiMaterialCostNet: roundMoney(piikkiMaterialCostNet),
    extrasMarginNet: roundMoney(customerExtrasNet - partnerBilledExtrasNet - piikkiMaterialCostNet),
    lines,
  };
}

export type ExtraBillingMarginImpactStatus = 'pending' | 'approved';

export type ExtraBillingMarginImpactLine = {
  logId: string;
  logDate: string;
  kind: 'extra_work' | 'extra_supply';
  description: string;
  status: ExtraBillingMarginImpactStatus;
  customerNet: number;
  partnerNet: number;
  piikkiCostNet: number;
  currentMarginImpactNet: number;
  marginIfApprovedNet: number;
};

/** Kaikki lisälaskutusrivit katevaikutuksineen — sekä odottavat että hyväksytyt. */
export function collectExtraBillingMarginImpactLines(
  logs: WorkReportDailyLog[],
  partnerRates: { hourly_regular?: number | null },
  customerRates?: { hourly_regular?: number | null },
): ExtraBillingMarginImpactLine[] {
  const partnerHourly = Number(partnerRates.hourly_regular) || 0;
  const customerHourlyDefault = Number(customerRates?.hourly_regular) || 0;
  const lines: ExtraBillingMarginImpactLine[] = [];

  for (const log of logs) {
    const logDate = log.log_date.slice(0, 10);

    for (const expense of log.expense_lines ?? []) {
      if (resolveExpenseBillingMode(expense) !== 'customer_only') continue;
      const qty = Number(expense.qty) || 0;
      const purchase = resolveExpensePurchaseUnitPrice(expense);
      if (!(qty > 0) || purchase == null || !(purchase > 0)) continue;

      const customerRaw =
        expense.customer_unit_price != null ? Number(expense.customer_unit_price) : null;
      const customerRate =
        customerRaw != null && customerRaw > 0
          ? customerRaw
          : computeSupplyCustomerUnitPrice(purchase, resolveSupplyMarginPercent(expense));
      const customerNet = lineTotal(qty, customerRate);
      const piikkiCostNet = lineTotal(qty, purchase);
      const marginIfApprovedNet = roundMoney(customerNet - piikkiCostNet);

      if (expenseExtraBillingAllowed(expense)) {
        lines.push({
          logId: log.id,
          logDate,
          kind: 'extra_supply',
          description: String(expense.description ?? '').trim() || 'Tarvike',
          status: 'approved',
          customerNet,
          partnerNet: 0,
          piikkiCostNet,
          currentMarginImpactNet: marginIfApprovedNet,
          marginIfApprovedNet,
        });
        continue;
      }

      if (!expenseExtraBillable(expense)) continue;

      lines.push({
        logId: log.id,
        logDate,
        kind: 'extra_supply',
        description: String(expense.description ?? '').trim() || 'Tarvike',
        status: 'pending',
        customerNet,
        partnerNet: 0,
        piikkiCostNet,
        currentMarginImpactNet: -piikkiCostNet,
        marginIfApprovedNet,
      });
    }

    const extra = parseDailyLogCustomerExtraBilling(log.customer_extra_billing);
    if (!dailyLogCustomerExtraBillingHasData(extra)) continue;

    const hours = resolveExtraBillableHours(extra);
    if (hours > 0 && hoursExtraBillable(extra)) {
      const customerRate =
        extra.hourly_rate != null && extra.hourly_rate > 0 ? extra.hourly_rate : customerHourlyDefault;
      const customerNet = lineTotal(hours, customerRate);
      const partnerNet = lineTotal(hours, partnerHourly);
      const marginIfApprovedNet = roundMoney(customerNet - partnerNet);

      if (hoursExtraBillingApproved(extra)) {
        lines.push({
          logId: log.id,
          logDate,
          kind: 'extra_work',
          description: extra.description?.trim() || 'Lisätyö',
          status: 'approved',
          customerNet,
          partnerNet,
          piikkiCostNet: 0,
          currentMarginImpactNet: marginIfApprovedNet,
          marginIfApprovedNet,
        });
      } else {
        lines.push({
          logId: log.id,
          logDate,
          kind: 'extra_work',
          description: extra.description?.trim() || 'Lisätyö',
          status: 'pending',
          customerNet,
          partnerNet,
          piikkiCostNet: 0,
          currentMarginImpactNet: 0,
          marginIfApprovedNet,
        });
      }
    }

    if (
      extra.expense_description
      && Number(extra.expense_qty) > 0
      && Number(extra.expense_customer_unit_price) > 0
    ) {
      const qty = Number(extra.expense_qty);
      const customerNet = lineTotal(qty, Number(extra.expense_customer_unit_price));
      const purchase = Number(extra.expense_purchase_unit_price) || 0;
      const billToPartner = extra.expense_bill_to_partner !== false && purchase > 0;
      const partnerNet = billToPartner ? lineTotal(qty, purchase) : 0;
      const piikkiCostNet = !billToPartner && purchase > 0 ? lineTotal(qty, purchase) : 0;
      const marginIfApprovedNet = roundMoney(customerNet - partnerNet - piikkiCostNet);
      lines.push({
        logId: log.id,
        logDate,
        kind: 'extra_supply',
        description: extra.expense_description,
        status: 'approved',
        customerNet,
        partnerNet,
        piikkiCostNet,
        currentMarginImpactNet: marginIfApprovedNet,
        marginIfApprovedNet,
      });
    }
  }

  return lines;
}

export function formatExtraBillingMarginImpactNote(
  line: ExtraBillingMarginImpactLine,
  formatMoney: (value: number) => string,
): string {
  if (line.status === 'approved') {
    const sign = line.currentMarginImpactNet >= 0 ? '+' : '−';
    return `Lisälaskutettava · kate ${sign} ${formatMoney(Math.abs(line.currentMarginImpactNet))}`;
  }
  const parts = ['Lisälaskutettavissa · ei lupaa'];
  if (line.currentMarginImpactNet < -0.005) {
    parts.push(`nyt − ${formatMoney(Math.abs(line.currentMarginImpactNet))} kate`);
  }
  const approvedSign = line.marginIfApprovedNet >= 0 ? '+' : '−';
  parts.push(`jos lupa: ${approvedSign} ${formatMoney(Math.abs(line.marginIfApprovedNet))} kate`);
  return parts.join(' · ');
}
