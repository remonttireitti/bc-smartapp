import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { parseCompanySettings } from '../lib/management';
import { supabase } from '../lib/supabase';
import { fetchWorkReportDetailLogs } from '../lib/workReportDailyLogSelect';
import type { BillableCalculation } from '../lib/workReportBilling';
import { generatePartnerBillingHtml } from '../lib/workReportBillingPrintHtml';

interface Props {
  session: Session;
}

export default function WorkReportPartnerBillingPrintPage({ session }: Props) {
  const { id } = useParams();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const [{ data: reportData, error: reportError }, { data: billableData, error: billableError }, logsResult] =
      await Promise.all([
        supabase
          .from('work_reports')
          .select(`
            id, title,
            owner_company_id, created_by_company_id,
            customers(name),
            owner_company:companies!work_reports_owner_company_id_fkey(name),
            created_by_company:companies!work_reports_created_by_company_id_fkey(name)
          `)
          .eq('id', reportId)
          .single(),
        supabase
          .from('work_report_billable')
          .select('calculation, billing_quote, customer_calculation')
          .eq('work_report_id', reportId)
          .maybeSingle(),
        fetchWorkReportDetailLogs(supabase, reportId),
      ]);

    if (reportError || !reportData) {
      setError(reportError?.message ?? 'Työraporttia ei löytynyt.');
      setLoading(false);
      return;
    }

    if (billableError || !billableData) {
      setError('Laskutettavaa yhteenvetoa ei ole vielä laskettu.');
      setLoading(false);
      return;
    }

    const report = reportData as unknown as {
      title: string;
      created_by_company_id: string;
      customers: { name: string } | null;
      owner_company: { name: string } | null;
      created_by_company: { name: string } | null;
    };

    const { data: companyRow } = await supabase
      .from('companies')
      .select('name, logo_url, settings')
      .eq('id', report.created_by_company_id)
      .single();

    let logoUrl: string | undefined;
    try {
      const resolved = await resolveCompanyLogoUrl(
        (companyRow as { logo_url: string | null } | null)?.logo_url,
      );
      if (resolved) logoUrl = resolved;
    } catch {
      /* optional */
    }

    parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);

    setHtml(
      generatePartnerBillingHtml({
        reportTitle: report.title,
        creatorCompanyName: report.created_by_company?.name ?? '—',
        ownerCompanyName: report.owner_company?.name ?? '—',
        customerName: report.customers?.name ?? null,
        calculation: billableData.calculation as BillableCalculation,
        billingQuote: billableData.billing_quote as import('../lib/workReportBillingQuote').BillingQuoteSettings,
        dailyLogs: logsResult.logs,
        customerCalculation: billableData.customer_calculation as BillableCalculation | null,
        logoUrl,
      }),
    );
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
        <p className="error">{error}</p>
        <Link to={id ? `/tyoraportit/${id}` : '/tyoraportit'}>← Takaisin</Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <h1>Laskutus kumppanille</h1>
          <p className="muted">Tulosta tai tallenna PDF selaimen tulostusvalikosta.</p>
        </div>
        <div className="form-actions">
          <Link to={id ? `/tyoraportit/${id}` : '/tyoraportit'} className="btn btn-secondary">
            Takaisin raporttiin
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Tulosta
          </button>
        </div>
      </div>
      <div className="print-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </AppLayout>
  );
}
