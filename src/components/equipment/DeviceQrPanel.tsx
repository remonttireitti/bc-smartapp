import { useEffect, useState } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import {
  devicePublicPath,
  fetchDeviceQrTokens,
  generateDeviceQrToken,
  setDeviceQrToken,
} from '../../lib/devicePublicCard';
import { buildDeviceQrLabelsHtml } from '../../lib/deviceQrLabel';
import { openPrintHtml } from '../../lib/openPrintWindow';

type Props = { equipmentId: string; name: string | null; tag: string | null; canWrite: boolean };

/** Laitteen QR-tarra: julkinen vain luku -linkki päälle/pois, uusi koodi mitätöi vanhan. */
export default function DeviceQrPanel({ equipmentId, name, tag, canWrite }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDeviceQrTokens([equipmentId]).then((map) => {
      if (cancelled) return;
      setSupported(map !== undefined);
      setToken(map?.[equipmentId] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [equipmentId]);

  async function apply(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      await setDeviceQrToken(equipmentId, next);
      setToken(next);
    } catch {
      setError('Tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function print() {
    if (!token) return;
    openPrintHtml(await buildDeviceQrLabelsHtml([{ token, name, tag }]), { documentTitle: 'QR-tarra' });
  }

  if (supported === null) return null;
  if (!supported) {
    if (!canWrite) return null;
    return (
      <section className="panel device-qr-panel">
        <h2 className="customer-section-title">QR-tarra</h2>
        <p className="muted">Vaatii tietokantapäivityksen.</p>
      </section>
    );
  }
  if (!canWrite && !token) return null;

  return (
    <section className="panel device-qr-panel" data-testid="device-qr-panel">
      <h2 className="customer-section-title">QR-tarra</h2>
      {canWrite ? (
        <div className="equipment-toggle-row">
          <ToggleSwitch
            label="Julkinen huoltopöytäkirja"
            checked={Boolean(token)}
            disabled={busy}
            onChange={(on) => void apply(on ? generateDeviceQrToken() : null)}
          />
        </div>
      ) : null}
      {token ? (
        <div className="device-qr-actions">
          <button type="button" className="btn btn-primary" onClick={() => void print()}>
            Tulosta QR-tarra
          </button>
          <a className="btn btn-secondary" href={devicePublicPath(token)} target="_blank" rel="noreferrer">
            Avaa
          </a>
          {canWrite ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Uusi koodi mitätöi vanhan tarran. Jatketaanko?')) void apply(generateDeviceQrToken());
              }}
            >
              Uusi koodi
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
