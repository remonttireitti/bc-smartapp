import { useEffect } from 'react';
import { refreshStaleOfflineCustomers } from '../lib/offline/download';
import { clearConflicts } from '../lib/offline/store';
import { refreshOfflineStatus, retryFailed, startOfflineSync, useOfflineStatus } from '../lib/offline/sync';

/** Pieni tilarivi: Offline – X tallentamatta / Synkronoidaan / Synkronoitu / virhe / ristiriita. */
export default function OfflineBanner() {
  const s = useOfflineStatus();

  useEffect(() => {
    startOfflineSync();
  }, []);

  useEffect(() => {
    if (s.online && s.pending === 0 && !s.flushing) void refreshStaleOfflineCustomers();
  }, [s.online, s.pending, s.flushing]);

  let text: string | null = null;
  let tone: 'warn' | 'ok' | 'error' = 'warn';
  let action: { label: string; run: () => void } | null = null;

  if (!s.online) {
    text = s.pending > 0 ? `Offline – ${s.pending} tallentamatta` : 'Offline';
  } else if (s.authNeeded) {
    text = `Kirjaudu uudelleen – ${s.pending} tallentamatta`;
    tone = 'error';
  } else if (s.failed > 0) {
    text = `${s.failed} ei synkronoitunut`;
    tone = 'error';
    action = { label: 'Yritä uudelleen', run: () => void retryFailed() };
  } else if (s.conflicts > 0) {
    text = 'Ristiriita: kopio luotu';
    action = { label: 'Selvä', run: () => void clearConflicts().then(refreshOfflineStatus) };
  } else if (s.pending > 0 || s.flushing) {
    text = `Synkronoidaan… ${s.pending}`;
  } else if (s.justSynced) {
    text = 'Synkronoitu';
    tone = 'ok';
  }
  if (!text) return null;

  return (
    <div className={`offline-banner offline-banner-${tone}`} role="status" data-testid="offline-status">
      <strong>{text}</strong>
      {action ? (
        <button type="button" className="btn btn-sm" onClick={action.run}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
