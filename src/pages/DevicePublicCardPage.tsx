import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import DeviceNotesPanel from '../components/equipment/DeviceNotesPanel';
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
  const [session, setSession] = useState<Session | null>(null);
  const [canAdd, setCanAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loggedIn = Boolean(session);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null), () => undefined);
  }, []);

  // Kirjautunut: lisäysoikeus vain, jos laite näkyy käyttäjälle RLS:n kautta (ja merkintätaulu on olemassa).
  const appEquipmentId = card?.appLink?.equipmentId ?? null;
  useEffect(() => {
    if (!session || !appEquipmentId) {
      setCanAdd(false);
      return;
    }
    let cancelled = false;
    void Promise.all([
      supabase.from('equipment').select('id').eq('id', appEquipmentId).maybeSingle(),
      supabase.from('equipment_notes').select('id').eq('equipment_id', appEquipmentId).limit(1),
    ]).then(([eq, notes]) => {
      if (!cancelled) setCanAdd(Boolean(eq.data) && !notes.error);
    });
    return () => {
      cancelled = true;
    };
  }, [session, appEquipmentId]);

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
  }, [token, reportId, reloadKey]);

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
  type TimelineItem =
    | { kind: 'report'; id: string; date: string | null }
    | { kind: 'note'; id: string; date: string | null; note: { text: string; company: string | null; installer: string | null; tukes: string | null; serviceVisit: boolean; label?: string } };
  const timeline: TimelineItem[] = [
    ...card.history.map((h) => ({ kind: 'report' as const, id: h.id, date: h.date })),
    ...card.notes.map((n) => ({ kind: 'note' as const, id: `n-${n.id}`, date: n.date, note: n })),
    ...card.shared.map((r, i) => ({ kind: 'note' as const, id: `s-${i}`, date: r.date, note: { text: r.text || '—', company: r.company, installer: r.installer, tukes: r.tukes, serviceVisit: false, label: { huoltopöytäkirja: 'Huoltopöytäkirja', merkintä: 'Merkintä', huoltokäynti: 'Huoltokäynti', työraportti: 'Työraportti' }[r.kind] ?? r.kind } })),
    ...card.work.map((w) => ({ kind: 'note' as const, id: `w-${w.id}`, date: w.date, note: { ...w, serviceVisit: false, label: 'Työraportti' } })),
  ].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

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

      {timeline.length > 0 ? (
        <section className="device-public-history no-print">
          <h2>Huoltohistoria</h2>
          <ul>
            {timeline.map((t) =>
              t.kind === 'report' ? (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`device-public-history-item${t.id === currentId ? ' is-active' : ''}`}
                    onClick={() => setReportId(t.id)}
                    aria-current={t.id === currentId ? 'true' : undefined}
                  >
                    {t.date ? formatMaintenanceDateFi(t.date) : '—'} · Huoltopöytäkirja
                  </button>
                </li>
              ) : (
                <li key={t.id} className="device-public-note">
                  <strong>{t.date ? formatMaintenanceDateFi(t.date) : '—'}</strong>
                  {t.note.serviceVisit ? <span className="device-notes-badge">Huoltokäynti</span> : null}
                  {t.note.label ? <span className="device-notes-badge device-notes-badge--work">{t.note.label}</span> : null}
                  <span className="device-notes-text">{t.note.text}</span>
                  <span className="muted">
                    {[t.note.company, [t.note.installer, t.note.tukes ? `Tukes ${t.note.tukes}` : null].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ),
            )}
          </ul>
        </section>
      ) : (
        <p className="device-public-status">Ei huoltohistoriaa.</p>
      )}

      {loggedIn && canAdd && appEquipmentId ? (
        <DeviceNotesPanel
          session={session}
          equipmentId={appEquipmentId}
          notes={[]}
          canAdd
          showList={false}
          onAdded={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      {!loggedIn ? (
        <p className="device-public-login no-print">
          <Link className="btn btn-secondary" to={`/login?redirect=${encodeURIComponent(`/q/${token}`)}`}>
            Kirjaudu
          </Link>
        </p>
      ) : null}

      {html ? (
        <div className="maintenance-print-host device-public-report" dangerouslySetInnerHTML={{ __html: html }} />
      ) : null}
    </div>
  );
}
