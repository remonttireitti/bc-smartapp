import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, type CameraDevice } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'refrigerant-bottle-scanner';

type CameraFacing = 'environment' | 'user';

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
};

const SCAN_CONFIG = {
  fps: 10,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const size = Math.min(viewfinderWidth, viewfinderHeight, 280) * 0.85;
    return { width: size, height: size };
  },
} as const;

function pickCameraId(cameras: CameraDevice[], facing: CameraFacing): string | null {
  if (cameras.length === 0) return null;

  const labelMatch =
    facing === 'environment'
      ? cameras.find((camera) => /back|rear|environment|takakamera|wide/i.test(camera.label))
      : cameras.find((camera) => /front|user|selfie|etukamera|face/i.test(camera.label));
  if (labelMatch) return labelMatch.id;

  if (cameras.length >= 2) {
    return facing === 'environment' ? cameras[cameras.length - 1]!.id : cameras[0]!.id;
  }

  return cameras[0]!.id;
}

async function startScannerCamera(
  scanner: Html5Qrcode,
  facing: CameraFacing,
  cameras: CameraDevice[],
  onDecoded: (text: string) => void,
): Promise<void> {
  const cameraId = pickCameraId(cameras, facing);
  const attempts: Array<string | MediaTrackConstraints> = [
    { facingMode: { exact: facing } },
    { facingMode: facing },
  ];
  if (cameraId) attempts.push(cameraId);

  let lastError: unknown = null;
  for (const camera of attempts) {
    try {
      await scanner.start(camera, SCAN_CONFIG, (decodedText) => onDecoded(decodedText.trim()), () => undefined);
      return;
    } catch (err) {
      lastError = err;
      if (scanner.isScanning) {
        await scanner.stop().catch(() => undefined);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Kameran käynnistys epäonnistui.');
}

export default function RefrigerantBottleScanDialog({ open, busy = false, onClose, onScan }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('environment');
  const [cameraCount, setCameraCount] = useState(0);
  const handledRef = useRef(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const camerasRef = useRef<CameraDevice[]>([]);
  const facingRef = useRef<CameraFacing>('environment');

  const handleDecoded = useCallback(
    (decodedText: string) => {
      if (handledRef.current || busy) return;
      handledRef.current = true;
      const scanner = scannerRef.current;
      void (scanner?.isScanning ? scanner.stop().catch(() => undefined) : Promise.resolve()).finally(() =>
        onScan(decodedText),
      );
    },
    [busy, onScan],
  );

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) {
      await scanner.stop().catch(() => undefined);
    }
  }, []);

  const startWithFacing = useCallback(
    async (facing: CameraFacing) => {
      const scanner = scannerRef.current;
      if (!scanner) return;

      await stopScanner();
      await startScannerCamera(scanner, facing, camerasRef.current, handleDecoded);
      facingRef.current = facing;
      setCameraFacing(facing);
      setError(null);
    },
    [handleDecoded, stopScanner],
  );

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      setError(null);
      setStarting(false);
      setSwitching(false);
      setCameraFacing('environment');
      facingRef.current = 'environment';
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
        camerasRef.current = cameras;
        setCameraCount(cameras.length);

        if (cameras.length === 0) {
          setError('Kameraa ei löytynyt.');
          return;
        }

        await startScannerCamera(scanner, 'environment', cameras, handleDecoded);
        if (!cancelled) {
          facingRef.current = 'environment';
          setCameraFacing('environment');
        }
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
      scannerRef.current = null;
      void stopScanner();
    };
  }, [open, handleDecoded, stopScanner]);

  async function switchCamera() {
    if (starting || switching || busy) return;
    const nextFacing: CameraFacing = facingRef.current === 'environment' ? 'user' : 'environment';
    setSwitching(true);
    setError(null);
    try {
      await startWithFacing(nextFacing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kameran vaihto epäonnistui.');
    } finally {
      setSwitching(false);
    }
  }

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
        {switching ? <p className="muted inventory-scan-status">Vaihdetaan kameraa…</p> : null}
        {error ? <p className="error inventory-scan-status">{error}</p> : null}
        <div className="leave-draft-actions inventory-scan-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || starting || switching || Boolean(error && cameraCount === 0)}
            onClick={() => void switchCamera()}
          >
            {cameraFacing === 'environment' ? 'Etukamera' : 'Takakamera'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Sulje
          </button>
        </div>
      </div>
    </div>
  );
}
