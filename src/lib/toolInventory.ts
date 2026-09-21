/** Pure helpers for työkaluinventaario (rates, loanable gate, calendar overlap). */

export type ToolLoanRates = {
  rate_day_eur?: number | null;
  rate_weekend_eur?: number | null;
  rate_week_eur?: number | null;
  rate_month_eur?: number | null;
};

export type ToolLoanRange = {
  loaned_at: string;
  /** Planned or actual end; null/undefined = open-ended */
  ends_at?: string | null;
};

export function formatToolEuro(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('fi-FI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} €`;
}

export function toolRateLabelRows(rates: ToolLoanRates): { key: string; label: string; value: string }[] {
  return [
    { key: 'day', label: '€/päivä', value: formatToolEuro(rates.rate_day_eur) },
    { key: 'weekend', label: '€/viikonloppu', value: formatToolEuro(rates.rate_weekend_eur) },
    { key: 'week', label: '€/viikko', value: formatToolEuro(rates.rate_week_eur) },
    { key: 'month', label: '€/kk', value: formatToolEuro(rates.rate_month_eur) },
  ];
}

export function toolDayRateBadge(rates: ToolLoanRates): string | null {
  if (rates.rate_day_eur == null || Number.isNaN(Number(rates.rate_day_eur))) return null;
  return `${formatToolEuro(rates.rate_day_eur)}/pv`;
}

export function canStartToolLoan(opts: {
  is_loanable: boolean;
  status?: string | null;
  hasOpenLoan: boolean;
}): { ok: boolean; reason: string | null } {
  if (!opts.is_loanable) {
    return { ok: false, reason: 'Työkalu ei ole lainattavissa.' };
  }
  if (opts.status === 'retired' || opts.status === 'service') {
    return { ok: false, reason: 'Työkalu ei ole lainattavissa tässä tilassa.' };
  }
  if (opts.hasOpenLoan || opts.status === 'loaned') {
    return { ok: false, reason: 'Työkalu on jo lainassa.' };
  }
  return { ok: true, reason: null };
}

function toMs(value: string | Date): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/** Inclusive overlap; null/undefined end = open-ended (Infinity). */
export function loanRangesOverlap(
  aStart: string | Date,
  aEnd: string | Date | null | undefined,
  bStart: string | Date,
  bEnd: string | Date | null | undefined,
): boolean {
  const as = toMs(aStart);
  const bs = toMs(bStart);
  if (!Number.isFinite(as) || !Number.isFinite(bs)) return false;
  const ae =
    aEnd == null || aEnd === ''
      ? Number.POSITIVE_INFINITY
      : toMs(aEnd);
  const be =
    bEnd == null || bEnd === ''
      ? Number.POSITIVE_INFINITY
      : toMs(bEnd);
  if (Number.isNaN(ae) || Number.isNaN(be)) return false;
  return as <= be && bs <= ae;
}

export function loanEffectiveEnd(loan: {
  returned_at?: string | null;
  expected_return_at?: string | null;
}): string | null {
  return loan.returned_at ?? loan.expected_return_at ?? null;
}

export function hasOverlappingToolLoan(
  existing: Array<{ loaned_at: string; returned_at?: string | null; expected_return_at?: string | null }>,
  start: string | Date,
  end?: string | Date | null,
  opts?: { ignoreReturned?: boolean },
): boolean {
  const ignoreReturned = opts?.ignoreReturned !== false;
  for (const loan of existing) {
    if (ignoreReturned && loan.returned_at) continue;
    const loanEnd = loanEffectiveEnd(loan);
    if (loanRangesOverlap(loan.loaned_at, loanEnd, start, end ?? null)) return true;
  }
  return false;
}

export function formatLoanRangeFi(startIso: string, endIso: string | null | undefined): string {
  const start = new Date(startIso).toLocaleDateString('fi-FI');
  if (!endIso) return `${start} – (avoin)`;
  const end = new Date(endIso).toLocaleDateString('fi-FI');
  return `${start} – ${end}`;
}

/** Group loan ranges for a simple month calendar / list (YYYY-MM keys). */
export function groupLoansByMonth(
  loans: Array<{ loaned_at: string; returned_at?: string | null; expected_return_at?: string | null }>,
): { monthKey: string; label: string; ranges: ToolLoanRange[] }[] {
  const buckets = new Map<string, ToolLoanRange[]>();
  for (const loan of loans) {
    const d = new Date(loan.loaned_at);
    if (!Number.isFinite(d.getTime())) continue;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = buckets.get(monthKey) ?? [];
    list.push({ loaned_at: loan.loaned_at, ends_at: loanEffectiveEnd(loan) });
    buckets.set(monthKey, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, ranges]) => {
      const [y, m] = monthKey.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' });
      return {
        monthKey,
        label,
        ranges: ranges.sort((a, b) => a.loaned_at.localeCompare(b.loaned_at)),
      };
    });
}

export function parseOptionalEuro(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function dateInputToIsoStart(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  const d = new Date(`${dateStr.trim()}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function dateInputToIsoEnd(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  const d = new Date(`${dateStr.trim()}T23:59:59.999`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
