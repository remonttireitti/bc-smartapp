import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import { useMaintenancePrintNavigation } from '../hooks/useMaintenancePrintNavigation';
import { useProfile } from '../hooks/useProfile';
import { loadMaintenanceReportPrintBundle } from '../lib/maintenanceReportPrintAction';
import { isPortalReadOnly } from '../lib/portalWorkOrder';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import { maintenanceListTrail } from '../lib/navigationTrail';

interface Props {
  session: Session;
}

export default function MaintenanceReportPrintPage({ session }: Props) {
  const { id } = useParams();
  const { profile } = useProfile(session);
  const [html, setHtml] = useState('');
  const [printTitle, setPrintTitle] = useState('');
  const [reportData, setReportData] = useState<HuoltoReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigation = useMaintenancePrintNavigation(id, reportData);
  const portalReadOnly = isPortalReadOnly(profile);

  useEffect(() => {
    if (!id) {
      setError('Raportin tunniste puuttuu.');
      setLoading(false);
      return;
    }
    void loadReport(id);
  }, [id]);

  useEffect(() => {
    if (!printTitle) return;
    const previous = document.title;
    document.title = printTitle;
    return () => {
      document.title = previous;
    };
  }, [printTitle]);

  async function loadReport(reportId: string) {
    setLoading(true);
    setError(null);

    try {
      const bundle = await loadMaintenanceReportPrintBundle(reportId);
      setReportData(bundle.data);
      setHtml(bundle.fragment);
      setPrintTitle(bundle.documentTitle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Raporttia ei löytynyt.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan tulostetta…</p>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout session={session}>
        <section className="panel">
          <p className="error">{error}</p>
          <Link to={maintenanceListTrail().backTo} className="btn btn-secondary">
            Takaisin listaan
          </Link>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="maintenance-print-page">
        <div className="page-header no-print">
          <div>
            <NavigationBreadcrumb items={navigation.breadcrumb} />
            <h1>Huoltoraportin tuloste</h1>
          </div>
          <div className="btn-group">
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Tulosta
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
    </AppLayout>
  );
}
