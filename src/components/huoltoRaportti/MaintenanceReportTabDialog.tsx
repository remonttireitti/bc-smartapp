import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function MaintenanceReportTabDialog({ title, open, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="maintenance-report-tab-overlay leave-draft-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="maintenance-report-tab-dialog leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-report-tab-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="maintenance-report-tab-dialog-header">
          <h2 id="maintenance-report-tab-dialog-title">{title}</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Sulje
          </button>
        </header>
        <div className="maintenance-report-tab-dialog-body">{children}</div>
        {footer ? (
          <footer className="maintenance-report-tab-dialog-footer leave-draft-actions">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
