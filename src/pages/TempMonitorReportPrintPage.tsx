import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import IconButton from '../components/IconButton';
import { IconBack, IconPrint } from '../components/icons';
import { loadTempMonitorReportPrintBundle } from '../lib/tempMonitorReportPrint';
import type { TempMonitorReport } from '../lib/tempMonitoring';

interface Props {
  session: Session;
}

export default function TempMonitorReportPrintPage({ session }: Props) {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<TempMonitorReport | null>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) {
      setError('Raportin tunniste puuttuu.');
      setLoading(false);
      return;
    }
    void loadReport();
  }, [reportId]);

  async function loadReport() {
    if (!reportId) return;
    setLoading(true);
    setError(null);
    try {
      const bundle = await loadTempMonitorReportPrintBundle(reportId);
      setReport(bundle.report);
      setHtml(bundle.html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tulosteen lataus epäonnistui.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!report) return;
    const previousTitle = document.title;
    document.title = report.title;
    return () => {
      document.title = previousTitle;
    };
  }, [report]);

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan tulostetta…</p>
      </AppLayout>
    );
  }

  if (error || !report) {
    return (
      <AppLayout session={session}>
        <p className="form-error">{error ?? 'Raporttia ei löydy'}</p>
        <Link to="/lampotila">← Takaisin</Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="temp-report-print-page">
        <div className="page-header no-print">
          <div>
            <p className="breadcrumb">
              <Link to="/lampotila">Lämpötilaseuranta</Link> / Tuloste
            </p>
            <h1>{report.title}</h1>
            <p className="muted">{report.monitor_label ?? 'Lämpötilaraportti'}</p>
          </div>
          <div className="page-header-actions action-toolbar">
            <IconButton
              label="Takaisin laitteeseen"
              href={`/lampotila/${report.device_id}`}
              tooltipSide="bottom"
            >
              <IconBack />
            </IconButton>
            <IconButton
              label="Tulosta tai tallenna PDF"
              variant="primary"
              tooltipSide="bottom"
              onClick={() => window.print()}
            >
              <IconPrint />
            </IconButton>
          </div>
        </div>
        <div className="temp-report-print-host" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </AppLayout>
  );
}
