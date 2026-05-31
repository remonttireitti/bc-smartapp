import { useEffect, useState } from 'react';

import { buildCylinderQrContent, copyCylinderScanUrl, downloadCylinderQrPng } from '../../lib/refrigerantCylinderQr';
import type { RefrigerantCylinder } from '../../types/inventory';

type Props = {
  open: boolean;
  cylinder: RefrigerantCylinder | null;
  onClose: () => void;
  onMessage?: (message: string | null) => void;
};

export default function RefrigerantBottleQrDialog({ open, cylinder, onClose, onMessage }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open || !cylinder) {
      setScanUrl('');
      setQrDataUrl('');
      setTitle('');
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void buildCylinderQrContent(cylinder)
      .then((content) => {
        if (cancelled) return;
        setTitle(content.title);
        setScanUrl(content.scanUrl);
        setQrDataUrl(content.qrDataUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'QR-koodin luonti epäonnistui');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, cylinder]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  async function handleCopyLink() {
    if (!cylinder) return;
    try {
      const url = await copyCylinderScanUrl(cylinder);
      onMessage?.(`Linkki kopioitu: ${url}`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Linkin kopiointi epäonnistui');
    }
  }

  async function handleDownload() {
    if (!cylinder) return;
    try {
      await downloadCylinderQrPng(cylinder);
      onMessage?.('QR-kuva ladattu. Tulosta se DYMO ID:ssä tai muulla työkalulla.');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR-kuvan lataus epäonnistui');
    }
  }

  if (!open || !cylinder) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog inventory-bottle-qr-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-bottle-qr-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="inventory-bottle-qr-title">QR-koodi — {title || '…'}</h2>
        <p className="muted inventory-bottle-qr-hint">
          Tulosta QR itse (esim. DYMO ID). Koodissa on pullo-linkki — skannaus avaa ajantasaiset tiedot
          sovelluksesta.
        </p>

        {loading ? <p className="muted">Luodaan QR-koodia…</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {qrDataUrl ? (
          <div className="inventory-bottle-qr-preview">
            <img src={qrDataUrl} alt={`QR ${title}`} width={220} height={220} />
          </div>
        ) : null}

        {scanUrl ? (
          <label className="inventory-bottle-qr-url">
            Pullo-linkki
            <input type="text" readOnly value={scanUrl} onFocus={(e) => e.target.select()} />
          </label>
        ) : null}

        <div className="leave-draft-actions inventory-bottle-qr-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Sulje
          </button>
          <button type="button" className="btn btn-secondary" disabled={!scanUrl} onClick={() => void handleCopyLink()}>
            Kopioi linkki
          </button>
          <button type="button" className="btn btn-primary" disabled={!qrDataUrl} onClick={() => void handleDownload()}>
            Lataa QR-kuva
          </button>
        </div>
      </div>
    </div>
  );
}
