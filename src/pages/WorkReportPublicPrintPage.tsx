import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MaintenanceReportImageLightbox } from '../components/huoltoRaportti/MaintenanceReportImageLightbox';
import { IconPrint } from '../components/icons';
import {
  loadWorkReportPrintSharePublic,
  type WorkReportPrintShareBundle,
} from '../lib/workReportPrintShares';
import { generateWorkReportPrintHtml, buildWorkReportPrintTitle } from '../lib/workReportPrintHtml';
import { buildWorkReportPrintHeadline } from '../types';

export default function WorkReportPublicPrintPage() {
  const { token } = useParams<{ token: string }>();
  const [bundle, setBundle] = useState<WorkReportPrintShareBundle | null>(null);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Jakolinkki puuttuu.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    void loadWorkReportPrintSharePublic(token)
      .then((loaded) => {
        if (cancelled) return;
        setBundle(loaded);
        setHtml(
          generateWorkReportPrintHtml({
            report: loaded.report,
            logs: loaded.logs,
            logImages: loaded.logImages,
            printMode: 'customer',
            showPartnerPrices: false,
            calculation: null,
            meta: {
              companyName: loaded.meta.companyName,
              logoUrl: loaded.meta.logoUrl ?? undefined,
            },
            hideAssignee: false,
          }),
        );
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Tulosteen lataus epäonnistui.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!bundle?.report) return;
    const previousTitle = document.title;
    document.title = buildWorkReportPrintTitle(bundle.report);
    return () => {
      document.title = previousTitle;
    };
  }, [bundle?.report]);

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

  if (loading) {
    return (
      <div className="monitor-reader-public">
        <p className="muted">Ladataan työraporttia…</p>
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="monitor-reader-public">
        <p className="error">{error ?? 'Työraporttia ei löytynyt.'}</p>
        <Link to="/login">Kirjaudu sisään</Link>
      </div>
    );
  }

  return (
    <div className="monitor-reader-public">
      <header className="monitor-reader-public-topbar no-print">
        <span className="brand-icon" aria-hidden="true">
          🏢
        </span>
        <span>{bundle.meta.companyName} — työraportti</span>
        <div className="action-toolbar">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
            <IconPrint /> Tulosta / PDF
          </button>
          <Link to="/login" className="btn btn-secondary btn-sm monitor-reader-login-link">
            Kirjaudu
          </Link>
        </div>
      </header>

      <main className="main monitor-reader-public-main">
        <p className="muted no-print">{buildWorkReportPrintHeadline(bundle.report)}</p>
        <div className="work-report-print-host" dangerouslySetInnerHTML={{ __html: html }} />
      </main>

      {lightboxUrl ? (
        <MaintenanceReportImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      ) : null}
    </div>
  );
}
