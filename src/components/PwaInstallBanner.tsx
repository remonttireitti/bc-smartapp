import { useEffect, useState } from 'react';
import { isStandaloneDisplayMode } from '../hooks/useNetworkStatus';

const DISMISS_KEY = 'bc-smartapp-pwa-install-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return isStandaloneDisplayMode() || localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return isStandaloneDisplayMode();
    }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hidden) return;

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

  if (hidden || !deferredPrompt) return null;

  return (
    <div className="pwa-install-banner" role="region" aria-label="Asenna sovellus">
      <div className="pwa-install-banner-text">
        <strong>Asenna työpöydälle</strong>
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
