import { useEffect, useId, useRef, useState } from 'react';
import {
  WORK_REPORT_LIST_SORT_OPTIONS,
  buildWorkReportListSummary,
  formatWorkReportListSummaryPartnerLine,
  type WorkReportListSortMode,
} from '../lib/workReportListSummary';
import type { WorkReport } from '../types';
import { IconList } from './icons';
import Tooltip from './Tooltip';

type Props = {
  reports: readonly WorkReport[];
  sortMode: WorkReportListSortMode;
  onSortModeChange: (mode: WorkReportListSortMode) => void;
};

/**
 * Compact icon button near the list section header.
 * Opens a popover with sort control + status→partner→customer summary.
 */
export default function WorkReportListSummary({
  reports,
  sortMode,
  onSortModeChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const sortLabelId = useId();
  const summary = buildWorkReportListSummary(reports);
  const hasSummary = summary.groups.length > 0;

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="toolbar-popover-anchor work-report-list-summary-anchor" ref={rootRef}>
      <Tooltip side="bottom" label="Yhteenveto ja järjestys" touchHelp={false}>
        <button
          type="button"
          className={`icon-btn${open ? ' icon-btn-active' : ''}`}
          aria-label="Yhteenveto ja järjestys"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={popoverId}
          onClick={() => setOpen((value) => !value)}
        >
          <IconList />
        </button>
      </Tooltip>

      {open ? (
        <div
          id={popoverId}
          className="toolbar-popover-panel toolbar-filter-popover work-report-list-summary-popover"
          role="dialog"
          aria-label="Yhteenveto ja järjestys"
        >
          <p className="toolbar-filter-popover-title">Yhteenveto ja järjestys</p>

          <label>
            <span id={sortLabelId}>Järjestys</span>
            <select
              aria-labelledby={sortLabelId}
              value={sortMode}
              onChange={(event) => onSortModeChange(event.target.value as WorkReportListSortMode)}
            >
              {WORK_REPORT_LIST_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

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
          ) : (
            <p className="muted work-report-list-summary-empty">Ei yhteenvetoa valituilla suodattimilla.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
