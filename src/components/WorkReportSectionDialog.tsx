import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  nested?: boolean;
}

export default function WorkReportSectionDialog({
  open,
  title,
  onClose,
  children,
  wide = false,
  nested = false,
}: Props) {
  // Sulje dialogi reitin vaihtuessa (esim. laitekortti tai pöytäkirja avattu listasta),
  // jotta avattu sivu näkyy heti eikä jää modaalin taakse.
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;
  const openedAtRef = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) {
      openedAtRef.current = null;
      return;
    }
    if (openedAtRef.current === null) {
      openedAtRef.current = routeKey;
    } else if (openedAtRef.current !== routeKey) {
      openedAtRef.current = null;
      onCloseRef.current();
    }
  }, [open, routeKey]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`leave-draft-overlay${nested ? ' leave-draft-overlay--nested' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`leave-draft-dialog work-report-section-dialog panel${wide ? ' work-report-section-dialog--wide' : ''}${nested ? ' work-report-section-dialog--nested' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-report-section-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="work-report-section-dialog-head">
          <h2 id="work-report-section-dialog-title">{title}</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Sulje
          </button>
        </div>
        <div className="work-report-section-dialog-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
