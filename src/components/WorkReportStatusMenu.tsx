import { useEffect, useRef, useState } from 'react';
import {
  WORK_STATUS_LABELS,
  getWorkStatusLabel,
  normalizeWorkflowStatus,
  type WorkStatus,
} from '../types';
import {
  buildWorkReportStatusPatch,
  canChangeWorkflowStatus,
  workflowStatusChangedNotice,
  workflowStatusMenuOptions,
} from '../lib/workReportStatusUpdate';
import { supabase } from '../lib/supabase';
import WorkStatusBadge, { StatusIcon } from './WorkStatusBadge';

type Props = {
  reportId: string;
  status: WorkStatus;
  disabled?: boolean;
  /** 'pill' = raporttinäkymän otsikon tilapilleri, 'compact' = listan pieni badge. */
  variant?: 'pill' | 'compact';
  onChanged?: (nextStatus: WorkStatus) => void;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;
};

export default function WorkReportStatusMenu({
  reportId,
  status,
  disabled,
  variant = 'compact',
  onChanged,
  onError,
  onNotice,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Näytetään valittu tila heti, kunnes tallennus on valmis. */
  const [pendingStatus, setPendingStatus] = useState<WorkStatus | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedStatus = normalizeWorkflowStatus(pendingStatus ?? status);
  const options = workflowStatusMenuOptions(pendingStatus ?? status);

  useEffect(() => {
    setPendingStatus(null);
  }, [status]);

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

  if (!canChangeWorkflowStatus(status)) {
    return variant === 'pill' ? (
      <WorkStatusBadge status={status} />
    ) : (
      <span className={`badge badge-${normalizedStatus}`}>{getWorkStatusLabel(status)}</span>
    );
  }

  async function chooseStatus(nextStatus: WorkStatus) {
    if (busy || nextStatus === normalizeWorkflowStatus(status)) {
      setOpen(false);
      return;
    }

    const patch = buildWorkReportStatusPatch(status, nextStatus);
    if (!patch) return;

    setBusy(true);
    setPendingStatus(nextStatus);
    setOpen(false);
    const { error } = await supabase.from('work_reports').update(patch).eq('id', reportId);
    setBusy(false);

    if (error) {
      setPendingStatus(null);
      onError?.(`Tilan vaihto epäonnistui: ${error.message}`);
      return;
    }

    onNotice?.(workflowStatusChangedNotice(nextStatus));
    onChanged?.(nextStatus);
  }

  const triggerClass =
    variant === 'pill'
      ? `status-badge status-badge-${normalizedStatus} report-status-pill-trigger`
      : `btn btn-secondary btn-sm report-status-menu-trigger badge badge-${normalizedStatus}`;

  return (
    <div className="toolbar-popover-anchor report-status-menu" ref={rootRef}>
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Työn tila: ${WORK_STATUS_LABELS[normalizedStatus]}. Vaihda tila`}
        title="Vaihda työn tila"
        disabled={disabled || busy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {variant === 'pill' ? <StatusIcon status={normalizedStatus} /> : null}
        {busy ? 'Tallennetaan…' : WORK_STATUS_LABELS[normalizedStatus]}
        <span aria-hidden="true" className="report-status-caret">▾</span>
      </button>
      {open && (
        <div className="toolbar-popover-panel report-status-menu-panel" role="menu">
          <p className="report-status-menu-title">Työn tila</p>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.active}
              className={option.active ? 'report-status-menu-item active' : 'report-status-menu-item'}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void chooseStatus(option.value);
              }}
            >
              <span className="report-status-menu-check" aria-hidden="true">
                {option.active ? '✓' : ''}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
