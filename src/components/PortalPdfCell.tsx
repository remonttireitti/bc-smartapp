import { useState } from 'react';
import { downloadPortalDocumentPdf, printedDateFi, printLogKey, type PortalDocKind, type PrintLog } from '../lib/portalDocumentPdf';

type Props = {
  kind: PortalDocKind;
  id: string;
  /** null = tulostuslokia ei ole käytössä (SQL ajamatta) → merkintä piilossa. */
  log: PrintLog | null;
  viewerCompanyId?: string | null;
  onPrinted?: () => void;
};

/** PDF-latauspainike + "Tulostettu d.m.yyyy" / "Ei tulostettu". */
export default function PortalPdfCell({ kind, id, log, viewerCompanyId, onPrinted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const printed = log?.get(printLogKey(kind, id));

  async function run() {
    setBusy(true);
    setError(false);
    try {
      if (await downloadPortalDocumentPdf(kind, id, viewerCompanyId)) onPrinted?.();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="portal-pdf-cell">
      <button type="button" className="btn btn-secondary btn-sm portal-pdf-btn" disabled={busy} onClick={() => void run()}>
        {busy ? 'Luodaan…' : 'PDF'}
      </button>
      {error ? <small className="portal-pdf-state error">Epäonnistui</small> : null}
      {!error && log ? (
        <small className="portal-pdf-state muted" data-testid="print-state">
          {printed ? `Tulostettu ${printedDateFi(printed)}` : 'Ei tulostettu'}
        </small>
      ) : null}
    </span>
  );
}
