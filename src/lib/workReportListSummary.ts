import {
  getWorkStatusLabel,
  reportPartyLabels,
  type WorkReport,
  type WorkStatus,
} from '../types';

/** Same partner/company line as WorkReportListTile default meta (tileSubtitle). */
export const WORK_REPORT_LIST_SUMMARY_NO_PARTNER = 'Ei kumppania';

const SUMMARY_STATUSES: WorkStatus[] = ['scheduled', 'in_progress'];

export type WorkReportListSortMode = 'newest' | 'alpha' | 'partner' | 'customer';

export const WORK_REPORT_LIST_SORT_STORAGE_KEY = 'bc-smartapp.work-reports-list-sort.v1';

export const WORK_REPORT_LIST_SORT_OPTIONS: Array<{
  value: WorkReportListSortMode;
  label: string;
}> = [
  { value: 'newest', label: 'Uusin ensin' },
  { value: 'alpha', label: 'Aakkoset' },
  { value: 'partner', label: 'Kumppanin mukaan' },
  { value: 'customer', label: 'Asiakkaan mukaan' },
];

export const DEFAULT_WORK_REPORT_LIST_SORT: WorkReportListSortMode = 'newest';

export type WorkReportListSummaryPartnerGroup = {
  partnerName: string;
  count: number;
  customerNames: string[];
};

export type WorkReportListSummaryStatusGroup = {
  status: WorkStatus;
  statusLabel: string;
  count: number;
  partners: WorkReportListSummaryPartnerGroup[];
};

export type WorkReportListSummary = {
  groups: WorkReportListSummaryStatusGroup[];
};

function compareFi(a: string, b: string): number {
  return a.localeCompare(b, 'fi', { sensitivity: 'base' });
}

function timeMs(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Partner/company label matching the list card meta line. */
export function workReportListPartnerLabel(report: WorkReport): string {
  const parties = reportPartyLabels(report);
  const raw = parties.onBehalfOf !== '—' ? parties.onBehalfOf : parties.reporterCompany;
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed === '—') return WORK_REPORT_LIST_SUMMARY_NO_PARTNER;
  return trimmed;
}

/** Customer/location line matching the list card. */
export function workReportListCustomerLabel(report: WorkReport): string {
  const name = report.customers?.name?.trim();
  return name && name.length > 0 ? name : '—';
}

export function parseWorkReportListSortMode(raw: string | null | undefined): WorkReportListSortMode {
  if (raw === 'newest' || raw === 'alpha' || raw === 'partner' || raw === 'customer') {
    return raw;
  }
  return DEFAULT_WORK_REPORT_LIST_SORT;
}

export function readWorkReportListSortMode(): WorkReportListSortMode {
  try {
    return parseWorkReportListSortMode(localStorage.getItem(WORK_REPORT_LIST_SORT_STORAGE_KEY));
  } catch {
    return DEFAULT_WORK_REPORT_LIST_SORT;
  }
}

export function writeWorkReportListSortMode(mode: WorkReportListSortMode): void {
  try {
    localStorage.setItem(WORK_REPORT_LIST_SORT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Sort comparator for "Tulevat ja käynnissä olevat työt" cards.
 * Default: uusin ensin (created_at desc, then scheduled_start desc).
 */
export function compareWorkReportsForListSort(
  a: WorkReport,
  b: WorkReport,
  mode: WorkReportListSortMode,
): number {
  if (mode === 'alpha') {
    const byTitle = compareFi(a.title ?? '', b.title ?? '');
    if (byTitle !== 0) return byTitle;
  } else if (mode === 'partner') {
    const byPartner = compareFi(workReportListPartnerLabel(a), workReportListPartnerLabel(b));
    if (byPartner !== 0) return byPartner;
    const byTitle = compareFi(a.title ?? '', b.title ?? '');
    if (byTitle !== 0) return byTitle;
  } else if (mode === 'customer') {
    const byCustomer = compareFi(workReportListCustomerLabel(a), workReportListCustomerLabel(b));
    if (byCustomer !== 0) return byCustomer;
    const byTitle = compareFi(a.title ?? '', b.title ?? '');
    if (byTitle !== 0) return byTitle;
  } else {
    // newest first
    const aCreated = timeMs(a.created_at);
    const bCreated = timeMs(b.created_at);
    if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
      return bCreated - aCreated;
    }
    if (Number.isFinite(aCreated) !== Number.isFinite(bCreated)) {
      return Number.isFinite(aCreated) ? -1 : 1;
    }
    const aStart = timeMs(a.scheduled_start);
    const bStart = timeMs(b.scheduled_start);
    if (Number.isFinite(aStart) && Number.isFinite(bStart) && aStart !== bStart) {
      return bStart - aStart;
    }
    if (Number.isFinite(aStart) !== Number.isFinite(bStart)) {
      return Number.isFinite(aStart) ? -1 : 1;
    }
    const byTitle = compareFi(a.title ?? '', b.title ?? '');
    if (byTitle !== 0) return byTitle;
  }

  return compareFi(a.id, b.id);
}

export function sortWorkReportsForList(
  reports: readonly WorkReport[],
  mode: WorkReportListSortMode,
): WorkReport[] {
  return [...reports].sort((a, b) => compareWorkReportsForListSort(a, b, mode));
}

/**
 * Compact aggregates for "Tulevat ja käynnissä olevat työt" list cards.
 * Groups by status (Tulossa / Työn alla), then by partner, with unique customers.
 * Empty status groups are omitted. Independent of card sort order.
 */
export function buildWorkReportListSummary(
  reports: readonly WorkReport[],
): WorkReportListSummary {
  const byStatus = new Map<WorkStatus, WorkReport[]>();
  for (const status of SUMMARY_STATUSES) {
    byStatus.set(status, []);
  }
  for (const report of reports) {
    if (!SUMMARY_STATUSES.includes(report.status)) continue;
    byStatus.get(report.status)!.push(report);
  }

  const groups: WorkReportListSummaryStatusGroup[] = [];

  for (const status of SUMMARY_STATUSES) {
    const statusReports = byStatus.get(status) ?? [];
    if (statusReports.length === 0) continue;

    const byPartner = new Map<string, WorkReport[]>();
    for (const report of statusReports) {
      const partner = workReportListPartnerLabel(report);
      const list = byPartner.get(partner) ?? [];
      list.push(report);
      byPartner.set(partner, list);
    }

    const partners: WorkReportListSummaryPartnerGroup[] = [...byPartner.entries()]
      .map(([partnerName, partnerReports]) => {
        const customerSet = new Set<string>();
        for (const report of partnerReports) {
          customerSet.add(workReportListCustomerLabel(report));
        }
        const customerNames = [...customerSet].sort(compareFi);
        return {
          partnerName,
          count: partnerReports.length,
          customerNames,
        };
      })
      .sort((a, b) => compareFi(a.partnerName, b.partnerName));

    groups.push({
      status,
      statusLabel: getWorkStatusLabel(status),
      count: statusReports.length,
      partners,
    });
  }

  return { groups };
}

/** One partner line, e.g. "Uudenmaan Kylmähuolto Oy — 2 (ABB, Messukeskus)". */
export function formatWorkReportListSummaryPartnerLine(
  partner: WorkReportListSummaryPartnerGroup,
): string {
  const customers = partner.customerNames.join(', ');
  return `${partner.partnerName} — ${partner.count} (${customers})`;
}
