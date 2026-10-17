import { useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { buildExamplePrintDocument } from '../lib/examplePrintDocument';
import { EXAMPLE_PRINTS, isExamplePrintKey } from '../lib/examplePrints';
import {
  applyPrintDocumentTitle,
  extractPrintableHtmlFragment,
  formatPrintSaveFileName,
  printCurrentDocument,
} from '../lib/printDocumentShell';

/** /esimerkit/:laji — julkinen esimerkkituloste (ei kirjautumista). */
export default function ExamplePrintPage() {
  const { laji } = useParams();
  const key = isExamplePrintKey(laji) ? laji : null;
  const bundle = useMemo(() => (key ? buildExamplePrintDocument(key) : null), [key]);
  const html = useMemo(() => (bundle ? extractPrintableHtmlFragment(bundle.html) : ''), [bundle]);
  const printTitle = bundle ? formatPrintSaveFileName(bundle.documentTitle) : '';
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!printTitle) return undefined;
    const previous = document.title;
    document.title = printTitle;
    const onBeforePrint = () => applyPrintDocumentTitle(document, printTitle);
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      document.title = previous;
      cleanupRef.current?.();
    };
  }, [printTitle]);

  if (!key || !bundle) return <Navigate to="/" replace />;
  const meta = EXAMPLE_PRINTS.find((p) => p.key === key)!;

  return (
    <div className="maintenance-print-page maintenance-print-page--standalone">
      <div className="page-header no-print maintenance-print-toolbar">
        <div>
          <p className="breadcrumb">
            <Link to="/">BestCool</Link> / Esimerkkitulosteet / {meta.title}
          </p>
          <h1>Esimerkki: {meta.title}</h1>
          <p className="muted">Keksitty asiakas ja mittaukset.</p>
        </div>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              cleanupRef.current?.();
              cleanupRef.current = printCurrentDocument(printTitle);
            }}
          >
            Tulosta / PDF
          </button>
          {EXAMPLE_PRINTS.filter((p) => p.key !== key).map((p) => (
            <Link key={p.key} to={`/esimerkit/${p.key}`} className="btn btn-secondary">
              {p.title}
            </Link>
          ))}
        </div>
      </div>
      <div className="maintenance-print-host" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
