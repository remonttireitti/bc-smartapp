import { useEffect, useRef, useState } from 'react';
import {
  WORKFLOW_STATUS_ORDER,
  WORK_STATUS_LABELS,
  normalizeWorkflowStatus,
  type WorkStatus,
} from '../types';
import { buildWorkReportStatusPatch } from '../lib/workReportStatusUpdate';
import { supabase } from '../lib/supabase';

type Props = {
  reportId: string;
  status: WorkStatus;
  disabled?: boolean;
  onChanged?: () => void;
  onError?: (message: string) => void;
};

export default function WorkReportStatusMenu({
  reportId,
  status,
  disabled,
  onChanged,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedStatus = normalizeWorkflowStatus(status);

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

  async function chooseStatus(nextStatus: WorkStatus) {
    if (busy || nextStatus === normalizedStatus) {
      setOpen(false);
      return;
    }

    const patch = buildWorkReportStatusPatch(status, nextStatus);
    if (!patch) return;

    setBusy(true);
    const { error } = await supabase.from('work_reports').update(patch).eq('id', reportId);
    setBusy(false);
    setOpen(false);

    if (error) {
      onError?.(error.message);
      return;
    }

    onChanged?.();
  }

  return (
    <div className="toolbar-popover-anchor report-status-menu" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-secondary btn-sm report-status-menu-trigger badge badge-${normalizedStatus}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {WORK_STATUS_LABELS[normalizedStatus]}
        <span aria-hidden="true"> ▾</span>
      </button>
      {open && (
        <div className="toolbar-popover-panel report-status-menu-panel" role="menu">
          <p className="report-status-menu-title">Vaihda tila</p>
          {WORKFLOW_STATUS_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              className={option === normalizedStatus ? 'report-status-menu-item active' : 'report-status-menu-item'}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void chooseStatus(option);
              }}
            >
              {WORK_STATUS_LABELS[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
