import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  DeviceQrNotFoundError,
  loadDevicePublicCard,
  loadDevicePublicImageUrls,
  type DevicePublicCard,
} from '../lib/devicePublicCard';
import { normalizeHuoltoReportData } from '../lib/huoltoRaportti/defaults';
import { generateMaintenanceReportHtml } from '../lib/huoltoRaportti/printHtml';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import { collectMaintenancePrintImagePaths } from '../lib/maintenanceReportPrintImages';
import { isChecklistCategory } from '../lib/huoltoCategories';
import { formatMaintenanceDateFi } from '../lib/equipmentMaintenanceHistory';
import { extractPrintableHtmlFragment } from '../lib/printDocumentShell';

/** Julkinen, vain luku: QR-tarrasta avautuva laitteen huoltopöytäkirja + huoltohistoria. */
export default function DevicePublicCardPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [reportId, setReportId] = useState<string | undefined>();
  const [card, setCard] = useState<DevicePublicCard | null>(null);
  const [html, setHtml] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'error'>('loading');
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setLoggedIn(Boolean(data.session)), () => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void (async () => {
      try {
        const loaded = await loadDevicePublicCard(token, reportId);
        if (cancelled) return;
        let fragment = '';
        if (loaded.report) {
          const raw = loaded.report.data as Record<string, unknown>;
          const category = (raw.reportCategory as string | null | undefined) ?? null;
          if (isChecklistCategory(category)) {
            const [{ normalizeChecklistReport }, { generateChecklistPrintHtml }] = await Promise.all([
              import('../lib/huoltoChecklist/logic'),
              import('../lib/huoltoChecklist/printHtml'),
            ]);
            const data = normalizeChecklistReport(raw, category);
            const paths = Object.values(data.items).flatMap((s) => (s.photos ?? []).map((p) => p.storagePath));
            const imageUrls = await loadDevicePublicImageUrls(token, loaded.report.id, paths);
            const d = loaded.device;
            fragment = generateChecklistPrintHtml(data, {
              companyName: loaded.branding.companyName,
              logoUrl: loaded.branding.logoUrl ?? undefined,
              imageUrls,
              customer: null,
              device: { name: d.name, tag: d.tag, model: d.model, serial: d.serialNumber, location: d.location },
            });
          } else {
            const data = normalizeHuoltoReportData(raw as Partial<HuoltoReportData>);
            const paths = collectMaintenancePrintImagePaths(data);
            const imageUrls = await loadDevicePublicImageUrls(token, loaded.report.id, paths);
            fragment = generateMaintenanceReportHtml(data, {
              companyName: loaded.branding.companyName,
              logoUrl: loaded.branding.logoUrl ?? undefined,
              imageUrls,
            });
          }
        }
        if (cancelled) return;
        setCard(loaded);
        setHtml(fragment ? extractPrintableHtmlFragment(fragment) : '');
        setState('ok');
      } catch (err) {
        if (cancelled) return;
        setCard(null);
        setHtml('');
        setState(err instanceof DeviceQrNotFoundError ? 'invalid' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, reportId]);

  if (state === 'loading' && !card) {
    return <div className="device-public-page"><p className="device-public-status">Ladataan…</p></div>;
  }
  if (state === 'invalid' || state === 'error' || !card) {
    return (
      <div className="device-public-page">
        <p className="device-public-status device-public-error" data-testid="device-public-invalid">
          {state === 'error' ? 'Tietojen haku epäonnistui.' : 'Linkki ei ole voimassa.'}
        </p>
      </div>
    );
  }

  const d = card.device;
  const title = [...new Set([d.tag, d.name].filter(Boolean))].join(' · ') || 'Laite';
  const currentId = card.report?.id;

  return (
    <div className="device-public-page" data-testid="device-public-card">
      <header className="device-public-head no-print">
        <h1>{title}</h1>
        <p className="muted">
          {[d.manufacturer, d.model, d.location].filter(Boolean).join(' · ')}
        </p>
        {loggedIn && card.appLink?.customerId ? (
          <Link
            className="btn btn-secondary"
            to={`/asiakkaat/${card.appLink.customerId}/laitteet/${card.appLink.equipmentId}`}
          >
            Avaa laitekortti
          </Link>
        ) : null}
      </header>

      {card.history.length > 0 ? (
        <section className="device-public-history no-print">
          <h2>Huoltohistoria</h2>
          <ul>
            {card.history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className={`device-public-history-item${h.id === currentId ? ' is-active' : ''}`}
                  onClick={() => setReportId(h.id)}
                  aria-current={h.id === currentId ? 'true' : undefined}
                >
                  {h.date ? formatMaintenanceDateFi(h.date) : '—'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="device-public-status">Ei valmiita huoltopöytäkirjoja.</p>
      )}

      {html ? (
        <div className="maintenance-print-host device-public-report" dangerouslySetInnerHTML={{ __html: html }} />
      ) : null}
    </div>
  );
}
