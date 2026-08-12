import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function MaintenanceReportSectionSettingsDialog({ title, open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="maintenance-report-tab-overlay leave-draft-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="maintenance-report-tab-dialog maintenance-section-settings-dialog leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-section-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="maintenance-report-tab-dialog-header">
          <h2 id="maintenance-section-settings-title">{title}</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Sulje
          </button>
        </header>
        <div className="maintenance-report-tab-dialog-body maintenance-section-settings-body">
          <p className="muted maintenance-section-settings-hint">
            Nämä asetukset vaikuttavat tulosteeseen, mutta eivät näy tulosteella sellaisenaan.
          </p>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
