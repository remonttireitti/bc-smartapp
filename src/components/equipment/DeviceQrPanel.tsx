import { useEffect, useState } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import {
  fetchDeviceQrTokens,
  generateDeviceQrToken,
  setDeviceQrToken,
} from '../../lib/devicePublicCard';
import {
  buildDeviceQrLabelsHtml,
  deviceQrLabelFileName,
  downloadBlob,
  renderDeviceQrLabelPdf,
  renderDeviceQrLabelPng,
} from '../../lib/deviceQrLabel';
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

  async function download(kind: 'png' | 'pdf') {
    if (!token) return;
    setError(null);
    try {
      const item = { token, name, tag };
      const blob = kind === 'png' ? await renderDeviceQrLabelPng(item) : await renderDeviceQrLabelPdf(item);
      downloadBlob(blob, deviceQrLabelFileName(item, kind));
    } catch {
      setError('Tiedoston luonti epäonnistui.');
    }
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
            label="QR-tarra käytössä"
            checked={Boolean(token)}
            disabled={busy}
            onChange={(on) => void apply(on ? generateDeviceQrToken() : null)}
          />
        </div>
      ) : null}
      {token ? (
        <>
        <div className="device-qr-actions">
          <button type="button" className="btn btn-primary" onClick={() => void print()}>
            Tulosta QR-tarra
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void download('png')}>
            Lataa PNG
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void download('pdf')}>
            Lataa PDF
          </button>
        </div>
        <p className="muted">Dymo XTL 300, 24 mm teippi · 60 × 24 mm</p>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
