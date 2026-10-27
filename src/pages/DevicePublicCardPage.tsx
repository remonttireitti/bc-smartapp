import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import DeviceNotesPanel from '../components/equipment/DeviceNotesPanel';
import { supabase } from '../lib/supabase';
import {
  DeviceQrLoginRequiredError,
  DeviceQrNotFoundError,
  loadDevicePublicCard,
  sendPortalAccessRequest,
  type DevicePublicCard,
} from '../lib/devicePublicCard';
import { formatMaintenanceDateFi } from '../lib/equipmentMaintenanceHistory';

type Role = string | null;

/** QR-sivu: laitteen nimi + huoltohistoria riveinä. Kirjautumaton: vain Kirjaudu. */
export default function DevicePublicCardPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<Role>(null);
  const [card, setCard] = useState<DevicePublicCard | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'login' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null), () => setSession(null));
  }, []);

  useEffect(() => {
    if (!session) return;
    void supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      setRole(((data as { role?: string } | null)?.role ?? null) as Role);
    });
  }, [session]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setState('login');
      return;
    }
    let cancelled = false;
    void loadDevicePublicCard(token).then(
      (c) => {
        if (!cancelled) {
          setCard(c);
          setState('ok');
        }
      },
      (err) => {
        if (cancelled) return;
        setCard(null);
        setState(err instanceof DeviceQrLoginRequiredError ? 'login' : err instanceof DeviceQrNotFoundError ? 'invalid' : 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, token, reloadKey]);

  if (state === 'loading') return <div className="device-public-page"><p className="device-public-status">Ladataan…</p></div>;
  if (state === 'login') return <LoggedOutView token={token} />;
  if (state !== 'ok' || !card) {
    return (
      <div className="device-public-page">
        <p className="device-public-status device-public-error" data-testid="device-public-invalid">
          {state === 'error' ? 'Tietojen haku epäonnistui.' : 'Linkki ei ole voimassa.'}
        </p>
      </div>
    );
  }

  const portal = role === 'customer' || role === 'subscriber';
  const installer = role === 'admin' || role === 'manager' || role === 'technician';
  const d = card.device;
  const title = [...new Set([d.tag, d.name].filter(Boolean))].join(' · ') || 'Laite';

  return (
    <div className="device-public-page" data-testid="device-public-card">
      <h1 className="device-public-title">{title}</h1>
      {installer && card.appLink?.customerId ? (
        <Link className="device-public-applink" to={`/asiakkaat/${card.appLink.customerId}/laitteet/${card.appLink.equipmentId}`}>
          Avaa laitekortti
        </Link>
      ) : null}
      {card.rows.length === 0 ? (
        <p className="device-public-status">Ei huoltohistoriaa.</p>
      ) : (
        <ul className="device-public-rows">
          {card.rows.map((r) => {
            const content = (
              <>
                <span className="device-public-row-head">
                  {r.date ? formatMaintenanceDateFi(r.date) : '—'} · {r.type}
                  {r.company ? ` · ${r.company}` : ''}
                </span>
                {r.text ? <span className="device-public-row-text">{r.text}</span> : null}
              </>
            );
            return (
              <li key={r.id}>
                {r.reportId ? (
                  <Link className="device-public-row is-link" to={`/huoltoraportit/${r.reportId}/tuloste`}>
                    {content}
                  </Link>
                ) : (
                  <div className="device-public-row">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {installer && !portal && card.appLink ? (
        <DeviceNotesPanel
          session={session ?? null}
          equipmentId={card.appLink.equipmentId}
          notes={[]}
          canAdd
          showList={false}
          onAdded={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

function LoggedOutView({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', website: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendPortalAccessRequest(token, { ...form, elapsedMs: Date.now() - openedAt.current });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lähetys epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="device-public-page device-public-loggedout">
      <p className="device-public-info">Asiakas: kirjaudu asiakasportaalin tunnuksilla.<br />Asentaja: kirjaudu omilla tunnuksillasi.</p>
      <Link className="btn btn-primary" to={`/login?redirect=${encodeURIComponent(`/q/${token}`)}`}>
        Kirjaudu
      </Link>
      {sent ? (
        <p className="success" data-testid="portal-request-sent">Pyyntö lähetetty.</p>
      ) : open ? (
        <form className="device-notes-form" onSubmit={(e) => void submit(e)}>
          <input aria-label="Nimi" placeholder="Nimi" value={form.name} onChange={set('name')} maxLength={100} required />
          <input aria-label="Sähköposti" placeholder="Sähköposti" type="email" value={form.email} onChange={set('email')} maxLength={200} required />
          <input aria-label="Puhelin" placeholder="Puhelin" type="tel" value={form.phone} onChange={set('phone')} maxLength={40} />
          <input aria-label="Viesti" placeholder="Viesti (valinnainen)" value={form.message} onChange={set('message')} maxLength={500} />
          <input className="hp-field" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set('website')} />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Lähetetään…' : 'Lähetä'}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            openedAt.current = Date.now();
            setOpen(true);
          }}
        >
          Tilaa asiakasportaalin tunnukset
        </button>
      )}
      <a className="btn btn-secondary" href="/#tilaa">
        Liity sovellukseen
      </a>
    </div>
  );
}
