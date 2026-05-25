import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import { useMaintenancePrintNavigation } from '../hooks/useMaintenancePrintNavigation';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { normalizeHuoltoReportData } from '../lib/huoltoRaportti/defaults';
import { generateMaintenanceReportHtml } from '../lib/huoltoRaportti/printHtml';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import { maintenanceListTrail } from '../lib/navigationTrail';
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
}

export default function MaintenanceReportPrintPage({ session }: Props) {
  const { id } = useParams();
  const [html, setHtml] = useState('');
  const [reportData, setReportData] = useState<HuoltoReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigation = useMaintenancePrintNavigation(id, reportData);

  useEffect(() => {
    if (!id) {
      setError('Raportin tunniste puuttuu.');
      setLoading(false);
      return;
    }
    void loadReport(id);
  }, [id]);

  async function loadReport(reportId: string) {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from('maintenance_reports')
      .select('id, data, branding_company_id, owner_company_id, customer_id')
      .eq('id', reportId)
      .single();

    if (loadError || !data) {
      setError(loadError?.message ?? 'Raporttia ei löytynyt.');
      setLoading(false);
      return;
    }

    const row = data as {
      data: HuoltoReportData;
      branding_company_id: string | null;
      owner_company_id: string;
      customer_id: string | null;
    };

    const companyId = row.branding_company_id ?? row.owner_company_id;
    const { data: companyRow } = await supabase
      .from('companies')
      .select('name, logo_url')
      .eq('id', companyId)
      .single();

    const companyName = (companyRow as { name: string } | null)?.name ?? '—';
    let logoUrl: string | undefined;
    try {
      const resolved = await resolveCompanyLogoUrl(
        (companyRow as { logo_url: string | null } | null)?.logo_url,
      );
      if (resolved) logoUrl = resolved;
    } catch {
      /* optional logo */
    }

    const normalized = normalizeHuoltoReportData({
      ...row.data,
      customerId: row.data.customerId ?? row.customer_id ?? undefined,
    });
    setReportData(normalized);
    setHtml(generateMaintenanceReportHtml(normalized, { companyName, logoUrl }));
    setLoading(false);
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
            {navigation.linkToEdit && (
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
