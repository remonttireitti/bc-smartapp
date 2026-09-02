import type { WorkReportDailyLog } from '../types';
import type { BillingQuoteExtraCustomerWork } from './billingQuoteExtraWork';

export type DailyLogCustomerExtraBilling = {
  hours?: number;
  hourly_rate?: number | null;
  description?: string;
  expense_description?: string;
  expense_qty?: number;
  expense_customer_unit_price?: number;
  expense_purchase_unit_price?: number | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
  return {
    hours: hours > 0 ? hours : 0,
    hourly_rate: hourlyRate != null && hourlyRate > 0 ? hourlyRate : null,
    description,
    expense_description: expenseDescription,
    expense_qty: expenseQty > 0 ? expenseQty : 0,
    expense_customer_unit_price:
      expenseCustomer != null && expenseCustomer > 0 ? expenseCustomer : undefined,
    expense_purchase_unit_price:
      expensePurchase != null && expensePurchase > 0 ? expensePurchase : null,
  };
}

export function normalizeDailyLogCustomerExtraBilling(
  billing: DailyLogCustomerExtraBilling,
): DailyLogCustomerExtraBilling {
  const parsed = parseDailyLogCustomerExtraBilling(billing);
  if (!dailyLogCustomerExtraBillingHasData(parsed)) return {};
  return parsed;
}

export function dailyLogCustomerExtraBillingHasData(
  billing: DailyLogCustomerExtraBilling | null | undefined,
): boolean {
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  return (
    Number(parsed.hours) > 0
    || (
      !!parsed.expense_description
      && Number(parsed.expense_qty) > 0
      && Number(parsed.expense_customer_unit_price) > 0
    )
  );
}

export function serializeDailyLogCustomerExtraBilling(
  billing: DailyLogCustomerExtraBilling,
): Record<string, unknown> | null {
  const normalized = normalizeDailyLogCustomerExtraBilling(billing);
  if (!dailyLogCustomerExtraBillingHasData(normalized)) return null;
  return normalized as Record<string, unknown>;
}

export type DailyLogExtraBillingFormFields = {
  extra_hours: string;
  extra_hourly_rate: string;
  extra_description: string;
  extra_expense_description: string;
  extra_expense_qty: string;
  extra_expense_customer_price: string;
  extra_expense_purchase_price: string;
};

export function emptyDailyLogExtraBillingForm(): DailyLogExtraBillingFormFields {
  return {
    extra_hours: '',
    extra_hourly_rate: '',
    extra_description: '',
    extra_expense_description: '',
    extra_expense_qty: '1',
    extra_expense_customer_price: '',
    extra_expense_purchase_price: '',
  };
}

export function dailyLogExtraBillingToForm(
  billing: DailyLogCustomerExtraBilling | null | undefined,
): DailyLogExtraBillingFormFields {
  const parsed = parseDailyLogCustomerExtraBilling(billing ?? {});
  return {
    extra_hours: parsed.hours != null && parsed.hours > 0 ? String(parsed.hours) : '',
    extra_hourly_rate:
      parsed.hourly_rate != null && parsed.hourly_rate > 0 ? String(parsed.hourly_rate) : '',
    extra_description: parsed.description ?? '',
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
  };
}

export function dailyLogExtraBillingFromForm(
  form: DailyLogExtraBillingFormFields,
): DailyLogCustomerExtraBilling {
  const hours = Number(form.extra_hours || 0);
  const hourlyRate = Number(form.extra_hourly_rate || 0);
  const expenseQty = Number(form.extra_expense_qty || 0);
  const expenseCustomer = Number(form.extra_expense_customer_price || 0);
  const expensePurchase = Number(form.extra_expense_purchase_price || 0);
  return normalizeDailyLogCustomerExtraBilling({
    hours: hours > 0 ? hours : 0,
    hourly_rate: hourlyRate > 0 ? hourlyRate : null,
    description: form.extra_description.trim(),
    expense_description: form.extra_expense_description.trim(),
    expense_qty: expenseQty > 0 ? expenseQty : 0,
    expense_customer_unit_price: expenseCustomer > 0 ? expenseCustomer : undefined,
    expense_purchase_unit_price: expensePurchase > 0 ? expensePurchase : null,
  });
}

export function dailyLogQuoteExtrasSubtitle(form: DailyLogExtraBillingFormFields): string {
  const billing = dailyLogExtraBillingFromForm(form);
  if (!dailyLogCustomerExtraBillingHasData(billing)) return 'Ei lisälaskutusta';
  const parts: string[] = [];
  if (billing.hours != null && billing.hours > 0) {
    parts.push(`${billing.hours} h lisätyö`);
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

export function extraCustomerWorkFromDailyLogs(
  logs: WorkReportDailyLog[],
): BillingQuoteExtraCustomerWork[] {
  const works: BillingQuoteExtraCustomerWork[] = [];
  for (const log of logs) {
    const extra = parseDailyLogCustomerExtraBilling(log.customer_extra_billing);
    if (!dailyLogCustomerExtraBillingHasData(extra)) continue;
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
            },
          ]
        : undefined;
    works.push({
      id: log.id,
      work_date: log.log_date.slice(0, 10),
      description: extra.description ?? '',
      hours: extra.hours ?? 0,
      hourly_rate: extra.hourly_rate ?? null,
      expense_lines: expenseLines,
    });
  }
  return works;
}

export function shouldCalculateCustomerQuoteExtrasFromLogs(logs: WorkReportDailyLog[]): boolean {
  return extraCustomerWorkFromDailyLogs(logs).length > 0;
}
