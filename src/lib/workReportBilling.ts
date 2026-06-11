import type { WorkReportDailyLog } from '../types';
import { resolveDailyLogAuthorLabel } from '../types';
import type { BillableRatesSource, PartnerBillingRates } from './management';
import { formatRefrigerantLineLabel } from './refrigerantInventory';

export type UserBillingProfile = {
  id: string;
  display_name: string | null;
  bill_hours_enabled: boolean;
  bill_expenses_enabled: boolean;
};

export type BillableLineKind =
  | 'hours_regular'
  | 'hours_overtime'
  | 'hours_on_call'
  | 'fixed_price'
  | 'commission'
  | 'expense'
  | 'refrigerant';

export type BillableLine = {
  logId: string;
  logDate: string;
  kind: BillableLineKind;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
  included: boolean;
  /** Asiakashinta puuttuu — kumppanin täydennettävä. */
  priceMissing?: boolean;
};

export type BillableUserSummary = {
  userId: string;
  userName: string;
  billHoursEnabled: boolean;
  billExpensesEnabled: boolean;
  effectiveBillHoursEnabled: boolean;
  effectiveBillExpensesEnabled: boolean;
  hoursQty: number;
  hoursTotal: number;
  expensesTotal: number;
  fixedTotal: number;
  commissionTotal: number;
  subtotal: number;
  excludedSubtotal: number;
  lines: BillableLine[];
};

export type BillableCalculation = {
  version: 2;
  billToCompanyId: string | null;
  billToCompanyName: string | null;
  ratesUsed: Required<PartnerBillingRates>;
  ratesSource: BillableRatesSource;
  byUser: BillableUserSummary[];
  grandTotal: number;
  excludedTotal: number;
};

export type WorkReportBillableRow = {
  work_report_id: string;
  partner_total: number;
  calculation: BillableCalculation;
  calculated_at: string;
};

const DEFAULT_RATES: Required<PartnerBillingRates> = {
  hourly_regular: 0,
  hourly_overtime: 0,
  hourly_on_call: 0,
};

function lineTotal(qty: number, unitPrice: number) {
  return Math.round(qty * unitPrice * 100) / 100;
}

function resolveHourUnitPrice(
  log: WorkReportDailyLog,
  kind: BillableLineKind,
  rates: Required<PartnerBillingRates>,
): number {
  const override = log.hourly_rate_override != null ? Number(log.hourly_rate_override) : null;
  if (override != null && override > 0) {
    if (kind === 'hours_regular') return override;
    if (kind === 'hours_overtime' && log.entry_type === 'overtime') return override;
    if (kind === 'hours_on_call' && log.entry_type === 'on_call') return override;
  }
  if (kind === 'hours_regular') return rates.hourly_regular;
  if (kind === 'hours_overtime') return rates.hourly_overtime;
  if (kind === 'hours_on_call') return rates.hourly_on_call;
  return 0;
}

function resolveUser(
  userId: string | null,
  users: Map<string, UserBillingProfile>,
  fallbackName: string | null,
): UserBillingProfile {
  if (userId && users.has(userId)) return users.get(userId)!;
  return {
    id: userId ?? 'unknown',
    display_name: fallbackName ?? 'Tuntematon',
    bill_hours_enabled: false,
    bill_expenses_enabled: false,
  };
}

function resolveBillingFlags(user: UserBillingProfile) {
  if (user.bill_hours_enabled || user.bill_expenses_enabled) {
    return {
      hoursEnabled: user.bill_hours_enabled,
      expensesEnabled: user.bill_expenses_enabled,
    };
  }
  return { hoursEnabled: true, expensesEnabled: true };
}

export function hasBillableUserFlags(users: UserBillingProfile[]): boolean {
  return users.some((user) => user.bill_hours_enabled || user.bill_expenses_enabled);
}

export function shouldCalculatePartnerBilling(
  logs: WorkReportDailyLog[],
  users: UserBillingProfile[],
): boolean {
  if (logs.length === 0) return false;
  if (hasBillableUserFlags(users)) return true;
  return logs.some((log) =>
    Number(log.hours_regular) > 0
    || Number(log.hours_overtime) > 0
    || Number(log.hours_on_call) > 0
    || Number(log.fixed_price_amount) > 0
    || Number(log.commission_amount) > 0
    || (log.expense_lines?.length ?? 0) > 0
    || (log.refrigerant_lines?.length ?? 0) > 0,
  );
}

export function calculateWorkReportBillable(input: {
  logs: WorkReportDailyLog[];
  users: UserBillingProfile[];
  rates: PartnerBillingRates;
  ratesSource: BillableRatesSource;
  billToCompanyId: string | null;
  billToCompanyName: string | null;
}): BillableCalculation {
  const rates = { ...DEFAULT_RATES, ...input.rates };
  const userMap = new Map(input.users.map((u) => [u.id, u]));
  const byUserId = new Map<string, BillableUserSummary>();

  function ensureUser(user: UserBillingProfile) {
    const flags = resolveBillingFlags(user);
    if (!byUserId.has(user.id)) {
      byUserId.set(user.id, {
        userId: user.id,
        userName: user.display_name ?? user.id,
        billHoursEnabled: user.bill_hours_enabled,
        billExpensesEnabled: user.bill_expenses_enabled,
        effectiveBillHoursEnabled: flags.hoursEnabled,
        effectiveBillExpensesEnabled: flags.expensesEnabled,
        hoursQty: 0,
        hoursTotal: 0,
        expensesTotal: 0,
        fixedTotal: 0,
        commissionTotal: 0,
        subtotal: 0,
        excludedSubtotal: 0,
        lines: [],
      });
    }
    return byUserId.get(user.id)!;
  }

  for (const log of input.logs) {
    const authorLabel = resolveDailyLogAuthorLabel(log);
    const user = resolveUser(
      log.created_by,
      userMap,
      authorLabel.name === '—' ? null : authorLabel.name,
    );
    const summary = ensureUser(user);
    const { hoursEnabled, expensesEnabled } = resolveBillingFlags(user);

    const hourLines: Array<{ kind: BillableLineKind; qty: number; unitPrice: number; label: string }> = [];

    if (log.entry_type === 'regular' || log.entry_type === 'regular_and_overtime') {
      if (Number(log.hours_regular) > 0) {
        hourLines.push({
          kind: 'hours_regular',
          qty: Number(log.hours_regular),
          unitPrice: resolveHourUnitPrice(log, 'hours_regular', rates),
          label: 'Tunnit',
        });
      }
    }
    if (log.entry_type === 'overtime' || log.entry_type === 'regular_and_overtime') {
      if (Number(log.hours_overtime) > 0) {
        hourLines.push({
          kind: 'hours_overtime',
          qty: Number(log.hours_overtime),
          unitPrice: resolveHourUnitPrice(log, 'hours_overtime', rates),
          label: 'Ylitötunnit',
        });
      }
    }
    if (log.entry_type === 'on_call' && Number(log.hours_on_call) > 0) {
      hourLines.push({
        kind: 'hours_on_call',
        qty: Number(log.hours_on_call),
        unitPrice: resolveHourUnitPrice(log, 'hours_on_call', rates),
        label: 'Päivystystunnit',
      });
    }
    if (log.entry_type === 'fixed_price' && Number(log.fixed_price_amount) > 0) {
      const total = Number(log.fixed_price_amount);
      const included = hoursEnabled;
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'fixed_price',
        description: 'Urakkahinta',
        qty: 1,
        unitPrice: total,
        total,
        included,
      });
      if (included) summary.fixedTotal += total;
      else summary.excludedSubtotal += total;
    }

    for (const hl of hourLines) {
      const total = lineTotal(hl.qty, hl.unitPrice);
      const included = hoursEnabled;
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: hl.kind,
        description: hl.label,
        qty: hl.qty,
        unitPrice: hl.unitPrice,
        total,
        included,
      });
      if (included) summary.hoursTotal += total;
      else summary.excludedSubtotal += total;
      if (included) summary.hoursQty += hl.qty;
    }

    for (const expense of log.expense_lines ?? []) {
      const total = lineTotal(Number(expense.qty), Number(expense.unit_price));
      const billToPartner = expense.bill_to_partner !== false;
      const included = expensesEnabled && billToPartner;
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'expense',
        description: expense.description,
        qty: Number(expense.qty),
        unitPrice: Number(expense.unit_price),
        total,
        included,
      });
      if (included) summary.expensesTotal += total;
      else summary.excludedSubtotal += total;
    }

    for (const refLine of log.refrigerant_lines ?? []) {
      const qty = Number(refLine.qty_kg);
      if (qty <= 0) continue;
      const billToPartner = refLine.bill_to_customer;
      const unitPrice = billToPartner ? Number(refLine.unit_price || 0) : 0;
      const fullTotal = lineTotal(qty, unitPrice);
      const billed = billToPartner && expensesEnabled;
      const total = billed ? fullTotal : 0;

      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'refrigerant',
        description: formatRefrigerantLineLabel(refLine),
        qty,
        unitPrice: billToPartner ? unitPrice : 0,
        total,
        included: true,
      });
      if (billed) summary.expensesTotal += total;
      else if (billToPartner) summary.excludedSubtotal += fullTotal;
    }

    if (Number(log.commission_amount) > 0) {
      const total = Number(log.commission_amount);
      const included = hoursEnabled;
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'commission',
        description: log.commission_note?.trim() || 'Myyntiprovisio',
        qty: 1,
        unitPrice: total,
        total,
        included,
      });
      if (included) summary.commissionTotal += total;
      else summary.excludedSubtotal += total;
    }
  }

  const byUser = Array.from(byUserId.values())
    .map((u) => ({
      ...u,
      subtotal: u.hoursTotal + u.expensesTotal + u.fixedTotal + u.commissionTotal,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName, 'fi'));

  const grandTotal = byUser.reduce((sum, u) => sum + u.subtotal, 0);
  const excludedTotal = byUser.reduce((sum, u) => sum + u.excludedSubtotal, 0);

  return {
    version: 2,
    billToCompanyId: input.billToCompanyId,
    billToCompanyName: input.billToCompanyName,
    ratesUsed: rates,
    ratesSource: input.ratesSource,
    byUser,
    grandTotal: Math.round(grandTotal * 100) / 100,
    excludedTotal: Math.round(excludedTotal * 100) / 100,
  };
}

function normalizeBillableUserName(name: string) {
  const trimmed = name.trim().replace(/\*+\s*$/, '').trim();
  if (!trimmed || trimmed === '—') return '';
  return trimmed.toLocaleLowerCase('fi');
}

function billableUserAggregateKey(userId: string, userName: string) {
  const normalizedName = normalizeBillableUserName(userName);
  if (normalizedName) return `name:${normalizedName}`;
  return `id:${userId || 'unknown'}`;
}

export function aggregateBillableByUser(
  rows: Array<{ calculation: BillableCalculation; reportId: string; reportTitle: string }>,
) {
  const totals = new Map<
    string,
    {
      aggregateKey: string;
      userId: string;
      userName: string;
      total: number;
      reportIds: Set<string>;
    }
  >();

  for (const row of rows) {
    for (const user of row.calculation.byUser) {
      const aggregateKey = billableUserAggregateKey(user.userId, user.userName);
      const prev = totals.get(aggregateKey) ?? {
        aggregateKey,
        userId: user.userId,
        userName: user.userName,
        total: 0,
        reportIds: new Set<string>(),
      };

      if (prev.userId === 'unknown' && user.userId !== 'unknown') {
        prev.userId = user.userId;
        prev.userName = user.userName;
      } else if (
        normalizeBillableUserName(user.userName).length
        > normalizeBillableUserName(prev.userName).length
      ) {
        prev.userName = user.userName;
      }

      prev.total += user.subtotal;
      if (user.subtotal > 0) prev.reportIds.add(row.reportId);
      totals.set(aggregateKey, prev);
    }
  }

  const users = Array.from(totals.values())
    .map(({ aggregateKey, userId, userName, total, reportIds }) => ({
      aggregateKey,
      userId,
      userName,
      total,
      reportCount: reportIds.size,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName, 'fi'));
  const grandTotal = users.reduce((sum, u) => sum + u.total, 0);
  return { users, grandTotal: Math.round(grandTotal * 100) / 100, reportCount: rows.length };
}

export function formatEuro(amount: number) {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

export function billableHoursQty(calculation: BillableCalculation) {
  return calculation.byUser.reduce((sum, user) => sum + user.hoursQty, 0);
}

export function hasZeroHourlyRates(calculation: BillableCalculation) {
  return (
    calculation.ratesUsed.hourly_regular === 0
    && calculation.ratesUsed.hourly_overtime === 0
    && calculation.ratesUsed.hourly_on_call === 0
  );
}
