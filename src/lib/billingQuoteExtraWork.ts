export type BillingQuoteExtraExpenseLine = {
  id: string;
  description: string;
  qty: number;
  customer_unit_price: number;
  purchase_unit_price?: number | null;
  bill_to_partner?: boolean;
};

export type BillingQuoteExtraCustomerWork = {
  id: string;
  work_date?: string | null;
  description: string;
  /** Laskutettavat tunnit — ei sama kuin päiväkirjan kalenteritunnit. */
  hours: number;
  hourly_rate?: number | null;
  expense_lines?: BillingQuoteExtraExpenseLine[];
};

/** @deprecated Käytä extra_customer_work */
export type BillingQuoteExtraCustomerLine = {
  id: string;
  description: string;
  qty?: number | null;
  unit_price?: number | null;
  amount?: number | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseExtraExpenseLines(raw: unknown): BillingQuoteExtraExpenseLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: BillingQuoteExtraExpenseLine[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const description =
      typeof record.description === 'string' && record.description.trim()
        ? record.description.trim()
        : '';
    if (!description) return;
    const num = (key: string) => {
      const value = record[key];
      if (value == null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? roundMoney(parsed) : null;
    };
    const qty = num('qty') ?? 1;
    const customerUnit = num('customer_unit_price') ?? num('unit_price');
    if (customerUnit == null || customerUnit <= 0 || qty <= 0) return;
    const id =
      typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `extra-exp:${index}`;
    const purchase = num('purchase_unit_price');
    lines.push({
      id,
      description,
      qty,
      customer_unit_price: customerUnit,
      purchase_unit_price: purchase != null && purchase > 0 ? purchase : null,
    });
  });
  return lines;
}

export function parseExtraCustomerWork(raw: unknown): BillingQuoteExtraCustomerWork[] {
  if (!Array.isArray(raw)) return [];
  const works: BillingQuoteExtraCustomerWork[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const description =
      typeof record.description === 'string' ? record.description.trim() : '';
    const num = (key: string) => {
      const value = record[key];
      if (value == null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? roundMoney(parsed) : null;
    };
    const hours = num('hours') ?? 0;
    const hourlyRate = num('hourly_rate');
    const expenseLines = parseExtraExpenseLines(record.expense_lines);
    const workDate =
      typeof record.work_date === 'string' && record.work_date.trim()
        ? record.work_date.trim().slice(0, 10)
        : null;
    const id =
      typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `extra-work:${index}`;
    if (!description && hours <= 0 && expenseLines.length === 0) return;
    works.push({
      id,
      work_date: workDate,
      description,
      hours: Math.max(0, hours),
      hourly_rate: hourlyRate != null && hourlyRate > 0 ? hourlyRate : null,
      expense_lines: expenseLines.length > 0 ? expenseLines : undefined,
    });
  });
  return works;
}

function parseLegacyExtraCustomerLines(raw: unknown): BillingQuoteExtraCustomerLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: BillingQuoteExtraCustomerLine[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const description =
      typeof record.description === 'string' && record.description.trim()
        ? record.description.trim()
        : '';
    if (!description) return;
    const num = (key: string) => {
      const value = record[key];
      if (value == null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? roundMoney(parsed) : null;
    };
    const amount = num('amount');
    const qty = num('qty');
    const unitPrice = num('unit_price');
    const resolvedAmount =
      amount != null && amount > 0
        ? amount
        : qty != null && unitPrice != null && qty > 0 && unitPrice > 0
          ? roundMoney(qty * unitPrice)
          : null;
    if (resolvedAmount == null || resolvedAmount <= 0) return;
    const id =
      typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `extra:${index}`;
    lines.push({
      id,
      description,
      qty: qty ?? 1,
      unit_price: unitPrice ?? resolvedAmount,
      amount: resolvedAmount,
    });
  });
  return lines;
}

export function migrateLegacyExtraCustomerLines(
  lines: BillingQuoteExtraCustomerLine[],
): BillingQuoteExtraCustomerWork[] {
  return lines.map((line) => ({
    id: line.id,
    work_date: null,
    description: line.description,
    hours: 0,
    hourly_rate: null,
    expense_lines: [
      {
        id: `${line.id}:legacy`,
        description: line.description,
        qty: 1,
        customer_unit_price: line.amount ?? line.unit_price ?? 0,
      },
    ],
  }));
}

export function resolveExtraCustomerWork(input: {
  extra_customer_work?: unknown;
  extra_customer_lines?: unknown;
}): BillingQuoteExtraCustomerWork[] {
  const works = parseExtraCustomerWork(input.extra_customer_work);
  if (works.length > 0) return normalizeExtraCustomerWork(works);
  const legacy = parseLegacyExtraCustomerLines(input.extra_customer_lines);
  if (legacy.length === 0) return [];
  return normalizeExtraCustomerWork(migrateLegacyExtraCustomerLines(legacy));
}

export function normalizeExtraCustomerWork(
  works: BillingQuoteExtraCustomerWork[],
): BillingQuoteExtraCustomerWork[] {
  const normalized: BillingQuoteExtraCustomerWork[] = [];
  for (const work of works) {
    const description = work.description.trim();
    const hours = roundMoney(Math.max(0, Number(work.hours) || 0));
    const hourlyRate =
      work.hourly_rate != null && work.hourly_rate > 0 ? roundMoney(work.hourly_rate) : null;
    const expenseLines: BillingQuoteExtraExpenseLine[] = [];
    for (const line of work.expense_lines ?? []) {
      const lineDescription = line.description.trim();
      const qty = roundMoney(Math.max(0, Number(line.qty) || 0));
      const customerUnit = roundMoney(Number(line.customer_unit_price) || 0);
      const purchase =
        line.purchase_unit_price != null && line.purchase_unit_price > 0
          ? roundMoney(line.purchase_unit_price)
          : null;
      if (!lineDescription || qty <= 0 || customerUnit <= 0) continue;
      expenseLines.push({
        id: line.id,
        description: lineDescription,
        qty,
        customer_unit_price: customerUnit,
        purchase_unit_price: purchase,
      });
    }
    if (!description && hours <= 0 && expenseLines.length === 0) continue;
    normalized.push({
      id: work.id,
      work_date: work.work_date?.slice(0, 10) ?? null,
      description,
      hours,
      hourly_rate: hourlyRate,
      expense_lines: expenseLines.length > 0 ? expenseLines : undefined,
    });
  }
  return normalized;
}

export function extraCustomerWorkHasBillableData(works: BillingQuoteExtraCustomerWork[]): boolean {
  return works.some(
    (work) =>
      work.hours > 0
      || (work.expense_lines ?? []).some(
        (line) => line.qty > 0 && line.customer_unit_price > 0,
      ),
  );
}

export function newExtraCustomerWork(): BillingQuoteExtraCustomerWork {
  return {
    id: `extra-work:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    work_date: new Date().toISOString().slice(0, 10),
    description: '',
    hours: 0,
    hourly_rate: null,
    expense_lines: [],
  };
}

export function newExtraExpenseLine(): BillingQuoteExtraExpenseLine {
  return {
    id: `extra-exp:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    qty: 1,
    customer_unit_price: 0,
    purchase_unit_price: null,
  };
}
