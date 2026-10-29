import { useEffect, useState } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import {
  assignNewDeviceQrCode,
  devicePublicUrl,
  fetchDeviceQrTokens,
  isShortDeviceQrCode,
  setDeviceQrToken,
} from '../../lib/devicePublicCard';
import { copyText } from '../../lib/copyText';
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
  const [copied, setCopied] = useState(false);

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

  /** next: 'new' = uusi lyhyt koodi (mitätöi vanhan), null = pois käytöstä. */
  async function apply(next: 'new' | null) {
    setBusy(true);
    setError(null);
    try {
      if (next === 'new') setToken(await assignNewDeviceQrCode(equipmentId));
      else {
        await setDeviceQrToken(equipmentId, null);
        setToken(null);
      }
    } catch {
      setError('Tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!token) return;
    setError(null);
    try {
      await copyText(devicePublicUrl(token));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Kopiointi epäonnistui — valitse linkki ja kopioi käsin.');
    }
  }

  async function switchToShort() {
    if (!window.confirm('Vaihdetaanko lyhyeen linkkiin? Vanha linkki ja jo tulostetut tarrat lakkaavat toimimasta.')) return;
    await apply('new');
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
            onChange={(on) => void apply(on ? 'new' : null)}
          />
        </div>
      ) : null}
      {token ? (
        <>
        <label className="device-qr-url">
          QR-linkki
          <input type="text" readOnly value={devicePublicUrl(token)} onFocus={(e) => e.target.select()} data-testid="device-qr-url" />
        </label>
        <div className="device-qr-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void copyLink()}>
            {copied ? 'Kopioitu ✓' : 'Kopioi linkki'}
          </button>
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
        {canWrite && !isShortDeviceQrCode(token) ? (
          <p>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void switchToShort()}>
              Vaihda lyhyeen linkkiin
            </button>
          </p>
        ) : null}
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
