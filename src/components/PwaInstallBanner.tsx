import { useState } from 'react';
import { dismissInstallHint, requestInstall, usePwaInstall } from '../lib/pwaInstall';

export default function PwaInstallBanner() {
  const { showBanner, canPrompt, ios } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  if (!showBanner) return null;

  return (
    <div className="pwa-install-banner" role="region" aria-label="Asenna sovellus" data-testid="pwa-install-banner">
      <div className="pwa-install-banner-text">
        <strong>Asenna sovellus</strong>
        <span className="muted">
          {canPrompt ? (
            'Avautuu omana sovelluksena, toimii myös huonolla yhteydellä.'
          ) : ios ? (
            <>Safari: <strong>Jaa</strong> (neliö ja nuoli) → <strong>Lisää Koti-valikkoon</strong>.</>
          ) : (
            <>Selain: valikko <strong>⋮</strong> → <strong>Asenna sovellus</strong>.</>
          )}
        </span>
      </div>
      <div className="pwa-install-banner-actions">
        {canPrompt ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void requestInstall().finally(() => setBusy(false));
            }}
          >
            Asenna
          </button>
        ) : null}
        <button type="button" className="btn" onClick={dismissInstallHint}>
          {canPrompt ? 'Ei nyt' : 'Selvä'}
        </button>
      </div>
    </div>
  );
}
