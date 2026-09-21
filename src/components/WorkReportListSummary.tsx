import {
  WORK_REPORT_LIST_SORT_OPTIONS,
  buildWorkReportListSummary,
  formatWorkReportListSummaryPartnerLine,
  type WorkReportListSortMode,
} from '../lib/workReportListSummary';
import type { WorkReport } from '../types';

type Props = {
  reports: readonly WorkReport[];
  sortMode: WorkReportListSortMode;
  onSortModeChange: (mode: WorkReportListSortMode) => void;
};

/** Compact status → partner → customer summary + sort control above the card grid. */
export default function WorkReportListSummary({
  reports,
  sortMode,
  onSortModeChange,
}: Props) {
  const summary = buildWorkReportListSummary(reports);
  const hasSummary = summary.groups.length > 0;

  return (
    <div className="work-report-list-summary-wrap">
      <div className="work-report-list-sort toolbar-filter">
        <span className="toolbar-filter-prefix" id="work-report-list-sort-label">
          Järjestys
        </span>
        <select
          aria-labelledby="work-report-list-sort-label"
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as WorkReportListSortMode)}
        >
          {WORK_REPORT_LIST_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasSummary ? (
        <div
          className="work-report-list-summary muted"
          aria-label="Yhteenveto tulevista ja käynnissä olevista töistä"
        >
          {summary.groups.map((group) => (
            <div key={group.status} className="work-report-list-summary-group">
              <div className="work-report-list-summary-status">
                {group.statusLabel} ({group.count})
              </div>
              <ul className="work-report-list-summary-partners">
                {group.partners.map((partner) => (
                  <li key={partner.partnerName}>
                    {formatWorkReportListSummaryPartnerLine(partner)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
