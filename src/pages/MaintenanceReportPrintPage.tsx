import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import AppLayout from '../components/AppLayout';
import { useMaintenancePrintNavigation } from '../hooks/useMaintenancePrintNavigation';
import { useProfile } from '../hooks/useProfile';
import { loadMaintenanceReportPrintBundle } from '../lib/maintenanceReportPrintAction';
import {
  applyPrintDocumentTitle,
  extractPrintableHtmlFragment,
  formatPrintSaveFileName,
  printCurrentDocument,
} from '../lib/printDocumentShell';
import { renderElementToPdf, shareOrDownloadPdf, shouldUsePdfExport } from '../lib/pdfExport';
import { isPortalReadOnly } from '../lib/portalWorkOrder';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import { maintenanceListTrail } from '../lib/navigationTrail';

interface Props {
  session: Session;
}

export default function MaintenanceReportPrintPage({ session }: Props) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';
  const faultyKonvektoritOnly = searchParams.get('vialliset') === '1';
  const { profile } = useProfile(session);
  const [html, setHtml] = useState('');
  const [printTitle, setPrintTitle] = useState('');
  const [reportData, setReportData] = useState<HuoltoReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigation = useMaintenancePrintNavigation(id, reportData);
  const portalReadOnly = isPortalReadOnly(profile);
  const autoPrintTriggeredRef = useRef(false);
  const printCleanupRef = useRef<(() => void) | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [usePdf] = useState(() => shouldUsePdfExport());
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfState, setPdfState] = useState<'idle' | 'busy' | 'error'>('idle');

  useEffect(() => {
    if (!id) {
      setError('Raportin tunniste puuttuu.');
      setLoading(false);
      return;
    }
    void loadReport(id);
  }, [id, faultyKonvektoritOnly]);

  useEffect(() => {
    if (!printTitle) return undefined;
    const previousTitle = document.title;
    document.title = printTitle;
    const onBeforePrint = () => {
      applyPrintDocumentTitle(document, printTitle);
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      document.title = previousTitle;
    };
  }, [printTitle]);

  useEffect(() => {
    if (!autoPrint || loading || !printTitle || autoPrintTriggeredRef.current) return;
    autoPrintTriggeredRef.current = true;
    printCleanupRef.current?.();
    printCleanupRef.current = printCurrentDocument(printTitle);
  }, [autoPrint, loading, printTitle]);

  useEffect(
    () => () => {
      printCleanupRef.current?.();
      printCleanupRef.current = null;
    },
    [],
  );

  async function loadReport(reportId: string) {
    setLoading(true);
    setError(null);
    autoPrintTriggeredRef.current = false;

    try {
      const bundle = await loadMaintenanceReportPrintBundle(reportId, { faultyKonvektoritOnly, embedImages: false });
      setReportData(bundle.data);
      setHtml(extractPrintableHtmlFragment(bundle.html));
      setPrintTitle(formatPrintSaveFileName(bundle.documentTitle));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Raporttia ei löytynyt.');
    } finally {
      setLoading(false);
    }
  }

  // iOS-kotivalikkosovellus: PDF valmiiksi taustalla, jotta jako käynnistyy suoraan painalluksesta.
  useEffect(() => {
    if (!usePdf || loading || !html || !printTitle || !hostRef.current) return undefined;
    let cancelled = false;
    setPdfFile(null);
    setPdfState('busy');
    const timer = window.setTimeout(() => {
      if (!hostRef.current) return;
      renderElementToPdf(hostRef.current, printTitle)
        .then((file) => { if (!cancelled) { setPdfFile(file); setPdfState('idle'); } })
        .catch(() => { if (!cancelled) setPdfState('error'); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [usePdf, loading, html, printTitle]);

  function triggerPrint() {
    if (!printTitle) return;
    if (usePdf) {
      if (pdfFile) void shareOrDownloadPdf(pdfFile);
      return;
    }
    printCleanupRef.current?.();
    printCleanupRef.current = printCurrentDocument(printTitle, 0);
  }

  if (loading) {
    return (
      <div className="maintenance-print-page maintenance-print-page--standalone">
        <p className="muted">Ladataan tulostetta…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="maintenance-print-page maintenance-print-page--standalone">
        <section className="panel">
          <p className="error">{error}</p>
          <Link to={portalReadOnly ? '/huoltoraportit' : maintenanceListTrail().backTo} className="btn btn-secondary">
            Takaisin listaan
          </Link>
        </section>
      </div>
    );
  }

  const content = (
    <div className="maintenance-print-page maintenance-print-page--standalone">
      <div className="page-header no-print maintenance-print-toolbar">
        <div>
          {!portalReadOnly ? <NavigationBreadcrumb items={navigation.breadcrumb} /> : null}
          <h1>{faultyKonvektoritOnly ? 'Vialliset konvektorit' : 'Huoltoraportin tuloste'}</h1>
          {printTitle ? (
            <p className="muted maintenance-print-filename-hint">
              PDF-tiedostonimi: <strong>{printTitle}</strong>
            </p>
          ) : null}
          {usePdf ? null : <p className="muted maintenance-print-help">
            Valitse tulostimena <strong>Tallenna PDF-muodossa</strong> — tiedostonimi täyttyy automaattisesti
            yllä olevasta otsikosta. Poista valinnasta <strong>Ylätunnisteet ja alatunnisteet</strong>, jotta
            selaimen omat ylä- ja alatunnisteet eivät tule paperille.
          </p>}
        </div>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn-primary"
            onClick={triggerPrint}
            disabled={usePdf && !pdfFile}
          >
            {usePdf && pdfState === 'busy' ? 'Luodaan PDF…' : usePdf && pdfState === 'error' ? 'PDF epäonnistui' : 'Tulosta / PDF'}
          </button>
          {navigation.linkToEdit && !portalReadOnly && (
            <Link {...navigation.linkToEdit} className="btn btn-secondary">
              Muokkaa raporttia
            </Link>
          )}
        </div>
      </div>

      <div ref={hostRef} className="maintenance-print-host" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
  // Asiakasportaali: sovelluksen valikko näkyy (ei paperilla).
  return portalReadOnly ? <AppLayout session={session}>{content}</AppLayout> : content;
}
