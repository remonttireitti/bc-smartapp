import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import { useMaintenancePrintNavigation } from '../hooks/useMaintenancePrintNavigation';
import { useProfile } from '../hooks/useProfile';
import { loadMaintenanceReportPrintBundle } from '../lib/maintenanceReportPrintAction';
import { openPrintHtml } from '../lib/openPrintWindow';
import {
  applyPrintDocumentTitle,
  extractPrintableHtmlFragment,
  formatPrintSaveFileName,
} from '../lib/printDocumentShell';
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
  const { profile } = useProfile(session);
  const [html, setHtml] = useState('');
  const [printHtml, setPrintHtml] = useState('');
  const [printTitle, setPrintTitle] = useState('');
  const [reportData, setReportData] = useState<HuoltoReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigation = useMaintenancePrintNavigation(id, reportData);
  const portalReadOnly = isPortalReadOnly(profile);
  const autoPrintTriggeredRef = useRef(false);

  useEffect(() => {
    if (!id) {
      setError('Raportin tunniste puuttuu.');
      setLoading(false);
      return;
    }
    void loadReport(id);
  }, [id]);

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
    if (!autoPrint || loading || !printHtml || !printTitle || autoPrintTriggeredRef.current) return;
    autoPrintTriggeredRef.current = true;
    openPrintHtml(printHtml, { documentTitle: printTitle });
  }, [autoPrint, loading, printHtml, printTitle]);

  async function loadReport(reportId: string) {
    setLoading(true);
    setError(null);

    try {
      const bundle = await loadMaintenanceReportPrintBundle(reportId);
      setReportData(bundle.data);
      setPrintHtml(bundle.html);
      setHtml(extractPrintableHtmlFragment(bundle.html));
      setPrintTitle(formatPrintSaveFileName(bundle.documentTitle));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Raporttia ei löytynyt.');
    } finally {
      setLoading(false);
    }
  }

  function triggerPrint() {
    if (!printHtml || !printTitle) return;
    openPrintHtml(printHtml, { documentTitle: printTitle });
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
          <h1>Huoltoraportin tuloste</h1>
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
