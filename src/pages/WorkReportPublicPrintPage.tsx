import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MaintenanceReportImageLightbox } from '../components/huoltoRaportti/MaintenanceReportImageLightbox';
import {
  loadWorkReportPrintSharePublic,
  type WorkReportPrintShareBundle,
} from '../lib/workReportPrintShares';
import { generateWorkReportPrintHtml, buildWorkReportPrintTitle } from '../lib/workReportPrintHtml';

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
      <div className="work-report-public-print-page">
        <p className="work-report-public-print-status">Ladataan työraporttia…</p>
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="work-report-public-print-page">
        <p className="work-report-public-print-status work-report-public-print-error">
          {error ?? 'Työraporttia ei löytynyt.'}
        </p>
      </div>
    );
  }

  return (
    <div className="work-report-public-print-page">
      <div className="work-report-print-host" dangerouslySetInnerHTML={{ __html: html }} />
      {lightboxUrl ? (
        <MaintenanceReportImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      ) : null}
    </div>
  );
}
