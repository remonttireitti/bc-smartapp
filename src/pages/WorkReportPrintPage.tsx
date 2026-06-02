import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { MaintenanceReportImageLightbox } from '../components/huoltoRaportti/MaintenanceReportImageLightbox';
import IconButton from '../components/IconButton';
import Tooltip from '../components/Tooltip';
import ToggleSwitch from '../components/ToggleSwitch';
import { IconBack, IconEuro, IconPrint } from '../components/icons';
import { useProfile } from '../hooks/useProfile';
import { loadWorkReportPrintBundle } from '../lib/workReportPrintAction';
import { buildWorkReportPrintTitle } from '../lib/workReportPrintHtml';
import { buildWorkReportPrintHeadline } from '../types';
import type { BillableCalculation } from '../lib/workReportBilling';
import type { WorkReport } from '../types';

interface Props {
  session: Session;
}

export default function WorkReportPrintPage({ session }: Props) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { profile } = useProfile(session);
  const [report, setReport] = useState<WorkReport | null>(null);
  const [html, setHtml] = useState('');
  const [calculation, setCalculation] = useState<BillableCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPartnerPrices, setShowPartnerPrices] = useState(searchParams.get('hinnat') === '1');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Raportin tunniste puuttuu.');
      setLoading(false);
      return;
    }
    void loadReport(id);
  }, [id, showPartnerPrices, profile?.company_id]);

  async function loadReport(reportId: string) {
    setLoading(true);
    setError(null);

    try {
      const bundle = await loadWorkReportPrintBundle(reportId, {
        showPartnerPrices,
        viewerCompanyId: profile?.company_id,
      });
      setReport(bundle.report);
      setHtml(bundle.html);
      setCalculation(bundle.calculation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tulosteen lataus epäonnistui.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!report) return;
    const previousTitle = document.title;
    document.title = buildWorkReportPrintTitle(report);
    return () => {
      document.title = previousTitle;
    };
  }, [report]);

  useEffect(() => {
    const host = document.querySelector('.work-report-print-host');
    if (!host || !html) return;

    function onImageLinkClick(event: Event) {
      const target = event.target as HTMLElement | null;
      const link = target?.closest('a.log-image-full-link') as HTMLAnchorElement | null;
      if (!link?.href) return;
      event.preventDefault();
      setLightboxUrl(link.href);
    }

    host.addEventListener('click', onImageLinkClick);
    return () => host.removeEventListener('click', onImageLinkClick);
  }, [html]);

  const canTogglePartnerPrices = !!calculation;

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
        <p className="error">{error ?? 'Työraporttia ei löytynyt.'}</p>
        <Link to={id ? `/tyoraportit/${id}` : '/tyoraportit'}>← Takaisin</Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="work-report-print-page">
        <div className="page-header no-print">
          <div>
            <p className="breadcrumb">
              <Link to="/">Etusivu</Link> / <Link to="/tyoraportit">Työraportit</Link> / Tuloste
            </p>
            <h1>Työraportin tuloste</h1>
            <p className="muted">{buildWorkReportPrintHeadline(report)}</p>
          </div>
          <div className="page-header-actions action-toolbar">
            {canTogglePartnerPrices && (
              <Tooltip
                label={
                  showPartnerPrices
                    ? 'Kumppanin hinnat mukana tulosteessa. Kytke pois päältä piilottaaksesi hinnat.'
                    : 'Näytä kumppanin hinnat tulosteessa.'
                }
                side="bottom"
              >
                <span className="print-toolbar-control">
                  <IconEuro className="ui-icon print-toolbar-icon" />
                  <ToggleSwitch
                    checked={showPartnerPrices}
                    onChange={setShowPartnerPrices}
                    className="toggle-switch-inline"
                    id="print-show-partner-prices"
                  />
                </span>
              </Tooltip>
            )}
            <IconButton
              label="Takaisin raporttiin"
              href={`/tyoraportit/${report.id}`}
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

        <div className="work-report-print-host" dangerouslySetInnerHTML={{ __html: html }} />
        {lightboxUrl ? (
          <MaintenanceReportImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
        ) : null}
      </div>
    </AppLayout>
  );
}
