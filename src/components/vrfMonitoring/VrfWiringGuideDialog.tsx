import { useEffect } from 'react';
import VrfWiringGuide from './VrfWiringGuide';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function VrfWiringGuideDialog({ open, onClose }: Props) {
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
        className="leave-draft-dialog vrf-wiring-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vrf-wiring-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="vrf-wiring-dialog-title">Kytkentäohje (DI / RO1)</h2>
        <VrfWiringGuide />
        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Sulje
          </button>
        </div>
      </div>
    </div>
  );
}
