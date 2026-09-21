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
  is_blockout?: boolean;
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

/** Rate rows with a real price (hides empty "—" rows for compact UI). */
export function toolFilledRateRows(rates: ToolLoanRates): { key: string; label: string; value: string }[] {
  return toolRateLabelRows(rates).filter((row) => row.value !== '—');
}

export function hasToolPurchaseInfo(tool: {
  purchased_at?: string | null;
  purchased_from?: string | null;
  purchase_price_eur?: number | null;
}): boolean {
  const from = tool.purchased_from?.trim();
  return Boolean(
    tool.purchased_at ||
      from ||
      (tool.purchase_price_eur != null && !Number.isNaN(Number(tool.purchase_price_eur))),
  );
}

export function isToolBlockout(loan: { is_blockout?: boolean | null }): boolean {
  return loan.is_blockout === true;
}

/** Aito avoin lainaus (ei sulku). */
export function isRealOpenLoan(loan: {
  returned_at?: string | null;
  is_blockout?: boolean | null;
}): boolean {
  return !loan.returned_at && !isToolBlockout(loan);
}

/**
 * Näytetäänkö "Lainassa". Ei koskaan kun !is_loanable (Ei lainattavissa).
 * Sulut eivät ole lainoja.
 */
export function toolShowsAsLoaned(opts: {
  is_loanable: boolean;
  status?: string | null;
  hasOpenRealLoan: boolean;
}): boolean {
  if (!opts.is_loanable) return false;
  return opts.hasOpenRealLoan || opts.status === 'loaned';
}

/** Tilamerkki: Lainassa / Suljettu / Vapaa / … — ei Lainassa + Ei lainattavissa yhtä aikaa. */
export function toolStatusBadgeLabel(opts: {
  is_loanable: boolean;
  status?: string | null;
  hasOpenRealLoan: boolean;
  hasOpenBlockout?: boolean;
}): string {
  if (toolShowsAsLoaned(opts)) return 'Lainassa';
  if (opts.hasOpenBlockout) return 'Suljettu';
  if (opts.status === 'loaned') return 'Vapaa';
  if (opts.status === 'service') return 'Huollossa';
  if (opts.status === 'retired') return 'Poistettu';
  return 'Vapaa';
}

export function canStartToolLoan(opts: {
  is_loanable: boolean;
  status?: string | null;
  /** Aito avoin laina TAI sulku — molemmat estävät uuden lainan. */
  hasOpenLoan: boolean;
}): { ok: boolean; reason: string | null } {
  if (!opts.is_loanable) {
    return { ok: false, reason: 'Työkalu ei ole lainattavissa.' };
  }
  if (opts.status === 'retired' || opts.status === 'service') {
    return { ok: false, reason: 'Työkalu ei ole lainattavissa tässä tilassa.' };
  }
  if (opts.hasOpenLoan || opts.status === 'loaned') {
    return { ok: false, reason: 'Työkalu on jo lainassa tai suljettu.' };
  }
  return { ok: true, reason: null };
}

/** Omistaja voi sulkea lainausaikoja myös kun työkalu ei ole lainattavissa. */
export function canStartToolBlockout(opts: {
  status?: string | null;
  hasOpenBlockingPeriod: boolean;
}): { ok: boolean; reason: string | null } {
  if (opts.status === 'retired') {
    return { ok: false, reason: 'Poistetulle työkalulle ei voi asettaa sulkua.' };
  }
  if (opts.hasOpenBlockingPeriod) {
    return { ok: false, reason: 'Työkalulla on jo avoin laina tai sulku.' };
  }
  return { ok: true, reason: null };
}

/** Itselle merkitty jakso = sulku, ei laina (omistaja ei lainaa itselleen). */
export function shouldTreatAsOwnerBlockout(opts: {
  borrowerUserId: string;
  sessionUserId: string;
  explicitBlockout?: boolean;
}): boolean {
  if (opts.explicitBlockout) return true;
  return opts.borrowerUserId === opts.sessionUserId;
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
  loans: Array<{
    loaned_at: string;
    returned_at?: string | null;
    expected_return_at?: string | null;
    is_blockout?: boolean | null;
  }>,
): { monthKey: string; label: string; ranges: ToolLoanRange[] }[] {
  const buckets = new Map<string, ToolLoanRange[]>();
  for (const loan of loans) {
    const d = new Date(loan.loaned_at);
    if (!Number.isFinite(d.getTime())) continue;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = buckets.get(monthKey) ?? [];
    list.push({
      loaned_at: loan.loaned_at,
      ends_at: loanEffectiveEnd(loan),
      is_blockout: isToolBlockout(loan),
    });
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

/** Yrityksen kuljetushinnoittelu: lyhyt matka = minFee (rajaan asti), yli rajan = minFee + excess * perKm. */
export type DeliveryFeeInput = {
  distanceKm: number;
  minFeeEur: number;
  limitKm: number;
  perKmEur: number;
};

/**
 * Laskee kuljetusmaksun.
 * - distanceKm <= limitKm → minFeeEur
 * - distanceKm > limitKm → minFeeEur + (distanceKm - limitKm) * perKmEur
 * Negatiiviset etäisyydet käsitellään nollana. Ei-numeroiset arvot → NaN.
 */
export function computeDeliveryFee(input: DeliveryFeeInput): number {
  const distanceKm = Number(input.distanceKm);
  const minFeeEur = Number(input.minFeeEur);
  const limitKm = Number(input.limitKm);
  const perKmEur = Number(input.perKmEur);
  if (![distanceKm, minFeeEur, limitKm, perKmEur].every((n) => Number.isFinite(n))) {
    return Number.NaN;
  }
  const dist = Math.max(0, distanceKm);
  const limit = Math.max(0, limitKm);
  if (dist <= limit) return minFeeEur;
  return minFeeEur + (dist - limit) * perKmEur;
}

export type BusyRange = {
  tool_id: string;
  starts_at: string;
  ends_at?: string | null;
  source?: string;
  status?: string;
};

/** ISO → YYYY-MM-DD in UTC (stable across host timezones). */
function isoToYmdUtc(iso: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Onko kalenteripäivä (YYYY-MM-DD) varattu busy-jaksolle (UTC-päivärajoilla). */
export function dateYmdOverlapsBusy(ymd: string, ranges: BusyRange[], toolId?: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  for (const range of ranges) {
    if (toolId && range.tool_id !== toolId) continue;
    const startYmd = isoToYmdUtc(range.starts_at);
    if (!startYmd) continue;
    const endYmd = range.ends_at ? isoToYmdUtc(range.ends_at) : null;
    if (ymd < startYmd) continue;
    if (endYmd != null && ymd > endYmd) continue;
    return true;
  }
  return false;
}

/** Kuukauden päivät (ma–su rivit) paikallisessa kalenterissa. */
export function buildMonthGrid(year: number, monthIndex0: number): { ymd: string; inMonth: boolean; date: Date }[] {
  const first = new Date(year, monthIndex0, 1);
  const startDow = (first.getDay() + 6) % 7; // ma=0
  const gridStart = new Date(year, monthIndex0, 1 - startDow);
  const cells: { ymd: string; inMonth: boolean; date: Date }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    cells.push({
      ymd: `${y}-${m}-${day}`,
      inMonth: d.getMonth() === monthIndex0,
      date: d,
    });
  }
  return cells;
}

export function shiftMonth(year: number, monthIndex0: number, delta: number): { year: number; monthIndex0: number } {
  const d = new Date(year, monthIndex0 + delta, 1);
  return { year: d.getFullYear(), monthIndex0: d.getMonth() };
}
