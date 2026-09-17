import { computeQuoteTotals } from './calculations';
import { normalizeQuoteRequestData } from './defaults';
import type { QuoteRequestRow, QuoteRequestStatus } from './types';
import { addDays, startOfWeek } from '../../types';

export type QuoteStatsPeriod = 'this_week' | 'this_month' | 'this_year';

export type QuoteStatsCompanyRow = {
  companyId: string;
  companyName: string;
  sentCount: number;
  sentTotal: number;
  orderedCount: number;
  orderedTotal: number;
};

export type QuoteRequestStatsSummary = {
  sentCount: number;
  sentTotal: number;
  orderedCount: number;
  orderedTotal: number;
  totalCount: number;
  totalAmount: number;
  conversionRate: number | null;
  byOwner: QuoteStatsCompanyRow[];
  byBranding: QuoteStatsCompanyRow[];
};

const STATS_STATUSES: QuoteRequestStatus[] = ['sent', 'ordered'];

export function quoteStatsPeriodLabel(period: QuoteStatsPeriod): string {
  if (period === 'this_week') return 'Tämä viikko';
  if (period === 'this_month') return 'Tämä kuukausi';
  return 'Tämä vuosi';
}

export function isQuoteStatsPeriod(date: Date, period: QuoteStatsPeriod, anchor = new Date()): boolean {
  if (period === 'this_year') {
    return date.getFullYear() === anchor.getFullYear();
  }
  if (period === 'this_month') {
    return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
  }
  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 7);
  return date >= weekStart && date < weekEnd;
}

export function quoteRowStatsDate(row: QuoteRequestRow): Date {
  return new Date(row.updated_at || row.created_at);
}

export function quoteRowGrossTotal(row: QuoteRequestRow): number {
  return computeQuoteTotals(normalizeQuoteRequestData(row.data)).grossTotal;
}

function emptyCompanyRow(companyId: string, companyName: string): QuoteStatsCompanyRow {
  return {
    companyId,
    companyName,
    sentCount: 0,
    sentTotal: 0,
    orderedCount: 0,
    orderedTotal: 0,
  };
}

function bumpCompanyRow(
  map: Map<string, QuoteStatsCompanyRow>,
  companyId: string,
  companyName: string,
  status: QuoteRequestStatus,
  amount: number,
) {
  const key = companyId || 'unknown';
  const existing = map.get(key) ?? emptyCompanyRow(key, companyName || '—');
  if (status === 'sent') {
    existing.sentCount += 1;
    existing.sentTotal += amount;
  } else if (status === 'ordered') {
    existing.orderedCount += 1;
    existing.orderedTotal += amount;
  }
  map.set(key, existing);
}

function sortCompanyRows(rows: QuoteStatsCompanyRow[]): QuoteStatsCompanyRow[] {
  return [...rows].sort((a, b) => {
    const totalA = a.sentTotal + a.orderedTotal;
    const totalB = b.sentTotal + b.orderedTotal;
    if (totalB !== totalA) return totalB - totalA;
    return a.companyName.localeCompare(b.companyName, 'fi');
  });
}

export function aggregateQuoteRequestStats(
  rows: QuoteRequestRow[],
  period: QuoteStatsPeriod,
  anchor = new Date(),
): QuoteRequestStatsSummary {
  let sentCount = 0;
  let sentTotal = 0;
  let orderedCount = 0;
  let orderedTotal = 0;
  const byOwner = new Map<string, QuoteStatsCompanyRow>();
  const byBranding = new Map<string, QuoteStatsCompanyRow>();

  for (const row of rows) {
    if (!STATS_STATUSES.includes(row.status)) continue;
    if (!isQuoteStatsPeriod(quoteRowStatsDate(row), period, anchor)) continue;

    const amount = quoteRowGrossTotal(row);
    if (row.status === 'sent') {
      sentCount += 1;
      sentTotal += amount;
    } else {
      orderedCount += 1;
      orderedTotal += amount;
    }

    bumpCompanyRow(
      byOwner,
      row.owner_company_id,
      row.owner_company?.name ?? '—',
      row.status,
      amount,
    );
    bumpCompanyRow(
      byBranding,
      row.branding_company_id,
      row.branding_company?.name ?? '—',
      row.status,
      amount,
    );
  }

  const totalCount = sentCount + orderedCount;
  const totalAmount = sentTotal + orderedTotal;
  const conversionRate =
    totalCount > 0 ? Math.round((orderedCount / totalCount) * 1000) / 10 : null;

  return {
    sentCount,
    sentTotal,
    orderedCount,
    orderedTotal,
    totalCount,
    totalAmount,
    conversionRate,
    byOwner: sortCompanyRows([...byOwner.values()]),
    byBranding: sortCompanyRows([...byBranding.values()]),
  };
}
