import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import { useMaintenancePrintNavigation } from '../hooks/useMaintenancePrintNavigation';
import { useProfile } from '../hooks/useProfile';
import { loadMaintenanceReportPrintBundle, type IlpVisitPrintInfo } from '../lib/maintenanceReportPrintAction';
import {
  applyPrintDocumentTitle,
  extractPrintableHtmlFragment,
  formatPrintSaveFileName,
  printCurrentDocument,
} from '../lib/printDocumentShell';
import { isPortalReadOnly } from '../lib/portalWorkOrder';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import { maintenanceListTrail } from '../lib/navigationTrail';

interface Props {
  session: Session;
}

export default function MaintenanceReportPrintPage({ session }: Props) {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';
  const faultyKonvektoritOnly = searchParams.get('vialliset') === '1';
  const combineIlpVisit = searchParams.get('kaynti') !== '0';
  const [ilpVisit, setIlpVisit] = useState<IlpVisitPrintInfo>({ siblingCount: 0, combined: false });
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

  useEffect(() => {
    if (!id) {
      setError('Raportin tunniste puuttuu.');
      setLoading(false);
      return;
    }
    void loadReport(id);
  }, [id, faultyKonvektoritOnly, combineIlpVisit]);

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
      const bundle = await loadMaintenanceReportPrintBundle(reportId, { faultyKonvektoritOnly, combineIlpVisit });
      setReportData(bundle.data);
      setIlpVisit(bundle.ilpVisit);
      setHtml(extractPrintableHtmlFragment(bundle.html));
      setPrintTitle(formatPrintSaveFileName(bundle.documentTitle));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Raporttia ei löytynyt.');
    } finally {
      setLoading(false);
    }
  }

  function toggleIlpVisit() {
    const next = new URLSearchParams(searchParams);
    next.delete('print');
    if (ilpVisit.combined) next.set('kaynti', '0');
    else next.delete('kaynti');
    setSearchParams(next, { replace: true });
  }

  function triggerPrint() {
    if (!printTitle) return;
    printCleanupRef.current?.();
    printCleanupRef.current = printCurrentDocument(printTitle);
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
          <Link to={maintenanceListTrail().backTo} className="btn btn-secondary">
            Takaisin listaan
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="maintenance-print-page maintenance-print-page--standalone">
      <div className="page-header no-print maintenance-print-toolbar">
        <div>
          <NavigationBreadcrumb items={navigation.breadcrumb} />
          <h1>{faultyKonvektoritOnly ? 'Vialliset konvektorit' : 'Huoltoraportin tuloste'}</h1>
          {printTitle ? (
            <p className="muted maintenance-print-filename-hint">
              PDF-tiedostonimi: <strong>{printTitle}</strong>
            </p>
          ) : null}
          <p className="muted maintenance-print-help">
            Valitse tulostimena <strong>Tallenna PDF-muodossa</strong> — tiedostonimi täyttyy automaattisesti
            yllä olevasta otsikosta. Poista valinnasta <strong>Ylätunnisteet ja alatunnisteet</strong>, jotta
            selaimen omat ylä- ja alatunnisteet eivät tule paperille.
          </p>
        </div>
        <div className="btn-group">
          <button type="button" className="btn btn-primary" onClick={triggerPrint}>
            Tulosta / PDF
          </button>
          {ilpVisit.siblingCount > 0 ? (
            <button type="button" className="btn btn-secondary" onClick={toggleIlpVisit}>
              {ilpVisit.combined ? 'Vain tämä laite' : `Koko käynti (${ilpVisit.siblingCount + 1} laitetta)`}
            </button>
          ) : null}
          {navigation.linkToEdit && !portalReadOnly && (
            <Link {...navigation.linkToEdit} className="btn btn-secondary">
              Muokkaa raporttia
            </Link>
          )}
        </div>
      </div>

      <div className="maintenance-print-host" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
