import { useEffect, useState } from 'react';
import { isIosDevice, isMobileDevice, isStandaloneDisplayMode } from '../hooks/useNetworkStatus';
import { getAppVisitCount } from '../lib/dashboardOnboarding';

const DISMISS_KEY = 'bc-smartapp-pwa-install-dismissed';
const PWA_DEFER_MIN_VISITS = 2;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function shouldDeferInstall() {
  return getAppVisitCount() < PWA_DEFER_MIN_VISITS;
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(
    () => isStandaloneDisplayMode() || isDismissed() || shouldDeferInstall(),
  );
  const [busy, setBusy] = useState(false);
  const mobile = isMobileDevice();
  const ios = isIosDevice();

  useEffect(() => {
    if (hidden || shouldDeferInstall()) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [hidden]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
    setDeferredPrompt(null);
  }

  async function install() {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setHidden(true);
      }
    } finally {
      setDeferredPrompt(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (isStandaloneDisplayMode() || isDismissed()) return;
    if (!shouldDeferInstall()) {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  if (deferredPrompt) {
    return (
      <div className="pwa-install-banner" role="region" aria-label="Asenna sovellus">
        <div className="pwa-install-banner-text">
          <strong>{mobile ? 'Asenna puhelimeen' : 'Asenna työpöydälle'}</strong>
          <span className="muted">
            Avaa BC Smartapp omassa ikkunassaan ja käytä offline-tilassa (välimuistissa).
          </span>
        </div>
        <div className="pwa-install-banner-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void install()}>
            Asenna
          </button>
          <button type="button" className="btn btn-sm" onClick={dismiss}>
            Ei nyt
          </button>
        </div>
      </div>
    );
  }

  if (mobile) {
    return (
      <div className="pwa-install-banner" role="region" aria-label="Asenna sovellus puhelimeen">
        <div className="pwa-install-banner-text">
          <strong>Asenna puhelimeen</strong>
          <span className="muted">
            {ios ? (
              <>
                Safari: paina <strong>Jaa</strong> (neliö ja nuoli) → <strong>Lisää Kotiin</strong>.
              </>
            ) : (
              <>
                Chrome: paina valikkoa <strong>⋮</strong> → <strong>Asenna sovellus</strong> tai{' '}
                <strong>Lisää aloitusnäyttöön</strong>.
              </>
            )}
          </span>
        </div>
        <div className="pwa-install-banner-actions">
          <button type="button" className="btn btn-sm" onClick={dismiss}>
            Selvä
          </button>
        </div>
      </div>
    );
  }

  return null;
}
