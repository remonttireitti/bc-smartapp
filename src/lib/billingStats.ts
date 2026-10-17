/**
 * Laskutus → Tilastot: laskutetut ja avoimet summat aikaväleittäin, keneltä laskutettu,
 * kumppaneittain ja tyypeittäin. Summat tulevat samoista funktioista kuin Laskutus-lista
 * (billingRowBilledAmount / billingRowOpenAmount / billingRowBilledDate / billingRowDate).
 */
import {
  billToCustomerKey,
  billToCustomerName,
  billToPartnerId,
  billToPartnerName,
  billingRowBilledAmount,
  billingRowBilledDate,
  billingRowDate,
  billingRowOpenAmount,
  effectiveBillingRowMode,
  isIncomingPartnerBill,
  type BillingListRow,
  type BillingModuleMode,
} from './workReportBillingCopy';
import { billableLineDisplayTotal, type BillableCalculation } from './workReportBilling';
import { expenseTypeCategory } from './workReportEntryCategories';

export const VAT_RATE = 0.255;

export type StatsPeriodKey = 'this_month' | 'prev_month' | 'last_3' | 'this_year' | 'custom';

export const STATS_PERIOD_LABELS: Record<StatsPeriodKey, string> = {
  this_month: 'Tämä kuukausi',
  prev_month: 'Edellinen kuukausi',
  last_3: '3 kk',
  this_year: 'Tämä vuosi',
  custom: 'Oma aikaväli',
};

export type StatsRange = { from: Date; to: Date };

/** Aikaväli paikallisena aikana: from mukaan, to ei mukaan (puoliavoin). */
export function statsPeriodRange(
  key: StatsPeriodKey,
  now = new Date(),
  customFrom?: string,
  customTo?: string,
): StatsRange | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'this_month') return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
  if (key === 'prev_month') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
  if (key === 'last_3') return { from: new Date(y, m - 2, 1), to: new Date(y, m + 1, 1) };
  if (key === 'this_year') return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
  if (!customFrom || !customTo) return null;
  const [fy, fm, fd] = customFrom.split('-').map(Number);
  const [ty, tm, td] = customTo.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return null;
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td + 1);
  if (to <= from) return null;
  return { from, to };
}

export function inStatsRange(date: Date, range: StatsRange): boolean {
  const t = date.getTime();
  return t >= range.from.getTime() && t < range.to.getTime();
}

export type StatsCategory = 'work' | 'fixed' | 'expenses' | 'supplies' | 'devices' | 'commission';

export const STATS_CATEGORY_ORDER: StatsCategory[] = ['work', 'fixed', 'expenses', 'supplies', 'devices', 'commission'];

export const STATS_CATEGORY_LABELS: Record<StatsCategory, string> = {
  work: 'Työ',
  fixed: 'Urakat',
  expenses: 'Kulut',
  supplies: 'Tarvikkeet',
  devices: 'Laitteet',
  commission: 'Provisio',
};

const HOUR_KINDS = new Set(['hours_regular', 'hours_overtime', 'hours_overtime_50', 'hours_overtime_100', 'hours_on_call']);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyCategories(): Record<StatsCategory, number> {
  return { work: 0, fixed: 0, expenses: 0, supplies: 0, devices: 0, commission: 0 };
}

/** Laskelman rivit tyypeittäin (vain laskutettavat rivit; vähennysrivit eivät ole laskutusta). */
export function calculationCategoryTotals(calc: BillableCalculation | null | undefined): Record<StatsCategory, number> {
  const totals = emptyCategories();
  for (const user of calc?.byUser ?? []) {
    for (const line of user.lines ?? []) {
      if (!line.included) continue;
      const amount = billableLineDisplayTotal(line);
      if (HOUR_KINDS.has(line.kind)) totals.work += amount;
      else if (line.kind === 'fixed_price') totals.fixed += amount;
      else if (line.kind === 'commission') totals.commission += amount;
      else if (line.kind === 'refrigerant') totals.supplies += amount;
      else if (line.kind === 'expense') {
        if (/^Ajomatkat\s*\(/i.test(String(line.description ?? '').trim())) {
          totals.expenses += amount;
          continue;
        }
        const category = expenseTypeCategory(line.expenseType);
        if (category === 'supplies') totals.supplies += amount;
        else if (category === 'device') totals.devices += amount;
        else totals.expenses += amount;
      }
    }
  }
  for (const key of STATS_CATEGORY_ORDER) totals[key] = round2(totals[key]);
  return totals;
}

/**
 * Jakaa summan tyypeille laskelman suhteessa. Tulos summautuu sentilleen summaan
 * (pyöristysero suurimmalle tyypille). Ilman laskelmaa koko summa on työtä
 * (sama kuin Laskutus-listan Työ-rivillä).
 */
export function allocateToCategories(
  amount: number,
  calc: BillableCalculation | null | undefined,
): Record<StatsCategory, number> {
  const result = emptyCategories();
  const cents = Math.round(amount * 100);
  if (cents === 0) return result;
  const base = calculationCategoryTotals(calc);
  const baseSum = STATS_CATEGORY_ORDER.reduce((sum, key) => sum + base[key], 0);
  if (baseSum <= 0.005) {
    result.work = cents / 100;
    return result;
  }
  let allocated = 0;
  let largest: StatsCategory = 'work';
  for (const key of STATS_CATEGORY_ORDER) {
    const part = Math.round((cents * base[key]) / baseSum);
    result[key] = part;
    allocated += part;
    if (base[key] > base[largest]) largest = key;
  }
  result[largest] += cents - allocated;
  for (const key of STATS_CATEGORY_ORDER) result[key] = result[key] / 100;
  return result;
}

/**
 * Prosenttiosuudet yhden desimaalin tarkkuudella, summa tasan 100,0 %
 * (suurimman jäännöksen menetelmä). Nollasumma → kaikki 0.
 */
export function percentShares(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const units = 1000;
  const raw = values.map((v) => (Math.max(0, v) / total) * units);
  const floors = raw.map(Math.floor);
  let remaining = units - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r - floors[i] }))
    .sort((a, b) => b.rem - a.rem || values[b.i] - values[a.i]);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors.map((f) => f / 10);
}

export type StatsDirection = 'customer' | 'partner_out' | 'partner_in';
export type StatsKind = 'billed' | 'open';

export type BillingStatsEntry = {
  reportId: string;
  direction: StatsDirection;
  kind: StatsKind;
  amount: number;
  date: Date;
  counterpartyKey: string;
  counterpartyName: string;
  categories: Record<StatsCategory, number>;
};

/** Raporttirivit tilastomerkinnöiksi: laskutettu osa laskutuspäivälle, avoin osa raportin päivälle. */
export function collectBillingStatsEntries(
  rows: BillingListRow[],
  viewerCompanyId: string | null | undefined,
  pageMode: BillingModuleMode,
): BillingStatsEntry[] {
  const entries: BillingStatsEntry[] = [];
  for (const row of rows) {
    const mode = effectiveBillingRowMode(pageMode, row);
    const calc = (mode === 'customer' ? row.billable?.customer_calculation : row.billable?.calculation) as
      | BillableCalculation
      | undefined;
    let direction: StatsDirection = 'customer';
    let counterpartyKey = billToCustomerKey(row);
    let counterpartyName = billToCustomerName(row);
    if (mode === 'partner') {
      direction = isIncomingPartnerBill(row, viewerCompanyId) ? 'partner_in' : 'partner_out';
      counterpartyKey = `partner:${billToPartnerId(row, viewerCompanyId)}`;
      counterpartyName = billToPartnerName(row, viewerCompanyId);
    }
    const billed = round2(billingRowBilledAmount(row, mode));
    const open = round2(billingRowOpenAmount(row, mode));
    const common = { reportId: row.id, direction, counterpartyKey, counterpartyName };
    if (billed > 0.005) {
      entries.push({
        ...common,
        kind: 'billed',
        amount: billed,
        date: billingRowBilledDate(row, mode),
        categories: allocateToCategories(billed, calc),
      });
    }
    if (open > 0.005) {
      entries.push({
        ...common,
        kind: 'open',
        amount: open,
        date: billingRowDate(row),
        categories: allocateToCategories(open, calc),
      });
    }
  }
  return entries;
}

export type StatsBasis = 'billed' | 'open' | 'all';

export type StatsShareRow = {
  key: string;
  name: string;
  amount: number;
  count: number;
  percent: number;
  isPartner?: boolean;
};

export type StatsPartnerRow = {
  key: string;
  name: string;
  outAmount: number;
  outCount: number;
  outPercent: number;
  inAmount: number;
  inCount: number;
  inPercent: number;
};

export type StatsMonth = { key: string; label: string; billed: number; open: number };

export type BillingStatsSummary = {
  billed: number;
  billedCount: number;
  open: number;
  openCount: number;
  /** Kumppanien meille laskuttama (kulua meille, ei omaa laskutusta). */
  incoming: number;
  incomingCount: number;
  /** Valitun perusteen (basis) summa: oma laskutus asiakkaille ja kumppaneille. */
  basisTotal: number;
  byCounterparty: StatsShareRow[];
  byPartner: StatsPartnerRow[];
  byCategory: Array<{ key: StatsCategory; label: string; amount: number; percent: number }>;
  months: StatsMonth[];
};

const MONTH_SHORT = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Trendin kuukaudet: valitun välin kuukaudet, vähintään 6 (taaksepäin välin lopusta), enintään 24. */
export function trendMonths(range: StatsRange): Date[] {
  const last = new Date(range.to.getTime() - 1);
  const end = new Date(last.getFullYear(), last.getMonth(), 1);
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  let count = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  count = Math.min(24, Math.max(6, count));
  return Array.from({ length: count }, (_, i) => new Date(end.getFullYear(), end.getMonth() - (count - 1 - i), 1));
}

function includeKind(kind: StatsKind, basis: StatsBasis): boolean {
  return basis === 'all' || basis === kind;
}

export function summarizeBillingStats(
  entries: BillingStatsEntry[],
  range: StatsRange,
  basis: StatsBasis = 'billed',
): BillingStatsSummary {
  let billedCents = 0;
  let openCents = 0;
  let incomingCents = 0;
  const billedReports = new Set<string>();
  const openReports = new Set<string>();
  const incomingReports = new Set<string>();
  const counterparties = new Map<string, { name: string; cents: number; reports: Set<string>; isPartner: boolean }>();
  const partners = new Map<string, { name: string; outCents: number; out: Set<string>; inCents: number; in: Set<string> }>();
  const categoryCents = emptyCategories();

  for (const entry of entries) {
    if (!inStatsRange(entry.date, range)) continue;
    const cents = Math.round(entry.amount * 100);
    if (entry.direction === 'partner_in') {
      if (entry.kind === 'billed') {
        incomingCents += cents;
        incomingReports.add(entry.reportId);
      }
    } else if (entry.kind === 'billed') {
      billedCents += cents;
      billedReports.add(entry.reportId);
    } else {
      openCents += cents;
      openReports.add(entry.reportId);
    }

    if (!includeKind(entry.kind, basis)) continue;

    if (entry.direction !== 'customer') {
      const p = partners.get(entry.counterpartyKey) ?? {
        name: entry.counterpartyName,
        outCents: 0,
        out: new Set<string>(),
        inCents: 0,
        in: new Set<string>(),
      };
      if (entry.direction === 'partner_out') {
        p.outCents += cents;
        p.out.add(entry.reportId);
      } else {
        p.inCents += cents;
        p.in.add(entry.reportId);
      }
      partners.set(entry.counterpartyKey, p);
    }

    if (entry.direction === 'partner_in') continue;

    const c = counterparties.get(entry.counterpartyKey) ?? {
      name: entry.counterpartyName,
      cents: 0,
      reports: new Set<string>(),
      isPartner: entry.direction === 'partner_out',
    };
    c.cents += cents;
    c.reports.add(entry.reportId);
    counterparties.set(entry.counterpartyKey, c);
    for (const key of STATS_CATEGORY_ORDER) categoryCents[key] += Math.round(entry.categories[key] * 100);
  }

  const cpList = [...counterparties.entries()]
    .map(([key, v]) => ({ key, name: v.name, amount: v.cents / 100, count: v.reports.size, isPartner: v.isPartner }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'fi'));
  const cpPercents = percentShares(cpList.map((r) => r.amount));

  const pList = [...partners.entries()]
    .map(([key, v]) => ({
      key,
      name: v.name,
      outAmount: v.outCents / 100,
      outCount: v.out.size,
      inAmount: v.inCents / 100,
      inCount: v.in.size,
    }))
    .sort((a, b) => b.outAmount + b.inAmount - (a.outAmount + a.inAmount) || a.name.localeCompare(b.name, 'fi'));
  const outPercents = percentShares(pList.map((r) => r.outAmount));
  const inPercents = percentShares(pList.map((r) => r.inAmount));

  const catList = STATS_CATEGORY_ORDER.map((key) => ({ key, label: STATS_CATEGORY_LABELS[key], amount: categoryCents[key] / 100 }));
  const catPercents = percentShares(catList.map((r) => r.amount));

  const monthDates = trendMonths(range);
  const monthMap = new Map<string, StatsMonth>(
    monthDates.map((d) => [
      monthKey(d),
      { key: monthKey(d), label: `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, billed: 0, open: 0 },
    ]),
  );
  for (const entry of entries) {
    if (entry.direction === 'partner_in') continue;
    const m = monthMap.get(monthKey(entry.date));
    if (!m) continue;
    if (entry.kind === 'billed') m.billed = round2(m.billed + entry.amount);
    else m.open = round2(m.open + entry.amount);
  }

  const basisCents = basis === 'billed' ? billedCents : basis === 'open' ? openCents : billedCents + openCents;

  return {
    billed: billedCents / 100,
    billedCount: billedReports.size,
    open: openCents / 100,
    openCount: openReports.size,
    incoming: incomingCents / 100,
    incomingCount: incomingReports.size,
    basisTotal: basisCents / 100,
    byCounterparty: cpList.map((r, i) => ({ ...r, percent: cpPercents[i] })),
    byPartner: pList.map((r, i) => ({ ...r, outPercent: outPercents[i], inPercent: inPercents[i] })),
    byCategory: catList.map((r, i) => ({ ...r, percent: catPercents[i] })).filter((r) => r.amount > 0.005),
    months: [...monthMap.values()],
  };
}

export function withVat(amount: number): number {
  return round2(amount * (1 + VAT_RATE));
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} %`;
}
