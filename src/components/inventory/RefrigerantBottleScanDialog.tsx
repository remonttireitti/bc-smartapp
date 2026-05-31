import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'refrigerant-bottle-scanner';

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
};

export default function RefrigerantBottleScanDialog({ open, busy = false, onClose, onScan }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const handledRef = useRef(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      setError(null);
      setStarting(false);
      return;
    }

    let cancelled = false;
    handledRef.current = false;
    setError(null);
    setStarting(true);

    void (async () => {
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (cameras.length === 0) {
          setError('Kameraa ei löytynyt.');
          return;
        }

        const rear =
          cameras.find((camera) => /back|rear|environment/i.test(camera.label))?.id ?? cameras[0]?.id;
        if (!rear) {
          setError('Kameraa ei löytynyt.');
          return;
        }

        await scanner.start(
          rear,
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const size = Math.min(viewfinderWidth, viewfinderHeight, 280) * 0.85;
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            if (handledRef.current || busy) return;
            handledRef.current = true;
            void scanner
              .stop()
              .catch(() => undefined)
              .finally(() => onScan(decodedText.trim()));
          },
          () => undefined,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Kameran käynnistys epäonnistui.');
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner?.isScanning) {
        void scanner.stop().catch(() => undefined);
      }
    };
  }, [open, busy, onScan]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog inventory-scan-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-scan-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="inventory-scan-dialog-title">Skannaa pullo</h2>
        <p className="muted inventory-scan-dialog-hint">
          Osoita QR-koodi tai viivakoodi kameraan. Pullo avautuu automaattisesti.
        </p>
        <div id={SCANNER_ELEMENT_ID} className="inventory-scan-reader" aria-live="polite" />
        {starting && !error ? <p className="muted inventory-scan-status">Käynnistetään kameraa…</p> : null}
        {error ? <p className="error inventory-scan-status">{error}</p> : null}
        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Sulje
          </button>
        </div>
      </div>
    </div>
  );
}
