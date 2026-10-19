import { clearPortalPreview, getPortalPreviewLabel, takePortalPreviewReturn } from '../lib/portalPreview';
import { usePortalPreview } from '../hooks/usePortalPreview';

export default function PortalPreviewBanner() {
  const preview = usePortalPreview();
  if (!preview) return null;

  const label = getPortalPreviewLabel() ?? '—';
  const kindLabel = preview.kind === 'subscriber' ? 'Tilaajaportaali' : 'Asiakasportaali';

  return (
    <div className="portal-preview-banner" role="status">
      <div>
        <strong>{kindLabel} — esikatselu</strong>
        <span className="muted"> Näet näkymän kuten {label}. Muutokset tallentuvat normaalisti yrityksen tunnuksilla.</span>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => {
          const back = takePortalPreviewReturn();
          clearPortalPreview();
          // Täysi lataus tyhjentää esikatselun välimuistisivut; istunto säilyy.
          window.location.assign(back);
        }}
      >
        Poistu esikatselusta
      </button>
    </div>
  );
}
