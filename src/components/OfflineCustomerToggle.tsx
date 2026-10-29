import { useEffect, useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import { downloadCustomerOffline, removeCustomerOffline } from '../lib/offline/download';
import { listOfflineCustomers, type OfflineCustomer } from '../lib/offline/store';

type Props = { customerId: string; customerName: string };

/** Asiakkaan laitteet ja pöytäkirjat offline-käyttöön (huono kenttäyhteys). */
export default function OfflineCustomerToggle({ customerId, customerName }: Props) {
  const [info, setInfo] = useState<OfflineCustomer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listOfflineCustomers().then((l) => {
      if (alive) setInfo(l.find((c) => c.id === customerId) ?? null);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [customerId]);

  async function download() {
    setError(null);
    setBusy('Ladataan…');
    try {
      setInfo(await downloadCustomerOffline(customerId, customerName, (n, t) => setBusy(`Ladataan… ${n}/${t}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lataus epäonnistui.');
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    setBusy('Poistetaan…');
    try {
      await removeCustomerOffline(customerId);
      setInfo(null);
    } finally {
      setBusy(null);
    }
  }

  if (typeof indexedDB === 'undefined') return null;
  const when = info ? new Date(info.at).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="offline-customer-toggle" data-testid="offline-customer-toggle">
      <ToggleSwitch
        label="Offline-käyttö"
        checked={Boolean(info)}
        disabled={busy !== null}
        onChange={(on) => void (on ? download() : turnOff())}
      />
      {busy ? <span className="muted">{busy}</span> : null}
      {info && !busy ? (
        <>
          <span className="muted" data-testid="offline-customer-info">
            Ladattu {when} · {info.devices} laitetta · {info.reports} pöytäkirjaa
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void download()} disabled={!navigator.onLine}>
            Päivitä
          </button>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
