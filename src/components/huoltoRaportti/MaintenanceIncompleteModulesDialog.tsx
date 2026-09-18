import { useEffect } from 'react';

export type IncompleteModuleRow = {
  key: string;
  title: string;
  statusLabel: string;
};

type Props = {
  open: boolean;
  modules: IncompleteModuleRow[];
  onClose: () => void;
  onOpenModule?: (key: string) => void;
};

export default function MaintenanceIncompleteModulesDialog({
  open,
  modules,
  onClose,
  onOpenModule,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-incomplete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="maintenance-incomplete-title">Pakollisia osioita puuttuu</h2>
        <p className="muted">
          Raporttia ei voi merkitä valmiiksi ennen kuin nämä osiot on täytetty:
        </p>
        <ul className="maintenance-incomplete-module-list">
          {modules.map((module) => (
            <li key={module.key}>
              {onOpenModule ? (
                <button
                  type="button"
                  className="maintenance-incomplete-module-link"
                  onClick={() => onOpenModule(module.key)}
                >
                  <strong>{module.title}</strong>
                  <span className="muted">{module.statusLabel}</span>
                </button>
              ) : (
                <>
                  <strong>{module.title}</strong>
                  <span className="muted"> — {module.statusLabel}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="leave-draft-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Selvä
          </button>
        </div>
      </div>
    </div>
  );
}
