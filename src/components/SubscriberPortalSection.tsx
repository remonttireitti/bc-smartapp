import { FormEvent, useEffect, useState } from 'react';
import PortalUserCredentialsForm from './PortalUserCredentialsForm';
import PasswordReveal from './PasswordReveal';
import { useNavigate } from 'react-router-dom';
import { rememberPortalPreviewReturn } from '../lib/portalPreview';
import ToggleSwitch from './ToggleSwitch';
import { inviteCompanyUser } from '../lib/inviteUser';
import { supabase } from '../lib/supabase';

type PortalProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
};

type Props = {
  subscriberId: string;
  subscriberName: string;
  companyId: string;
};

function subscriberPortalPreviewUrl(subscriberId: string) {
  return `/esikatselu/tilaaja/${subscriberId}`;
}

export default function SubscriberPortalSection({ subscriberId, subscriberName, companyId }: Props) {
  const [portalUser, setPortalUser] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({
    email: '',
    display_name: '',
  });
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [createdPassword, setCreatedPassword] = useState<{ email: string; password: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPortalUser();
  }, [subscriberId]);

  async function loadPortalUser() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('subscriber_id', subscriberId)
      .eq('role', 'subscriber')
      .maybeSingle();

    if (loadError) {
      console.error(loadError);
      setPortalUser(null);
    } else {
      setPortalUser((data as PortalProfile | null) ?? null);
    }
    setLoading(false);
  }

  function openSubscriberPortal() {
    rememberPortalPreviewReturn(`${window.location.pathname}${window.location.search}`);
    navigate(subscriberPortalPreviewUrl(subscriberId));
  }

  async function createPortalUser(e: FormEvent) {
    e.preventDefault();
    const email = invite.email.trim();
    if (!email) {
      setError('Sähköposti on pakollinen.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const created = await inviteCompanyUser({
        email,
        generate_password: true,
        send_email: sendEmail,
        display_name: invite.display_name.trim() || subscriberName,
        role: 'subscriber',
        company_id: companyId,
        subscriber_id: subscriberId,
      });
      setMessage(`Portaalikäyttäjä luotu: ${email}.${created.mail_sent === true ? ' Tunnukset lähetetty sähköpostilla.' : created.mail_sent === false ? ` Sähköposti epäonnistui: ${created.mail_error ?? ''}` : ''}`);
      setCreatedPassword(created.password ? { email, password: created.password } : null);
      setShowInvite(false);
      await loadPortalUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Käyttäjän luonti epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel customer-portal-panel" id="subscriber-portal">
      <h2>Tilaajaportaali</h2>
      <p className="muted">
        Tilaaja <strong>{subscriberName}</strong> näkee kaikki linkitetyt kohteet, voi lähettää työtilauksia ja
        lukea raportteja.
      </p>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}
      {createdPassword ? <PasswordReveal email={createdPassword.email} password={createdPassword.password} /> : null}

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : portalUser ? (
        <div className="customer-portal-active">
          <PortalUserCredentialsForm
            portalUser={portalUser}
            entityName={subscriberName}
            subscriberId={subscriberId}
            onUpdated={loadPortalUser}
          />
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={openSubscriberPortal}>
              Avaa tilaajaportaali (esikatselu)
            </button>
          </div>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Avaa saman näkymän kuin tilaaja näkee. Esikatselussa käytetään yrityskäyttäjän istuntoa, mutta näet
            tilaajan oikeuksilla rajatun sisällön.
          </p>
        </div>
      ) : !showInvite ? (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowInvite(true)}>
            Luo portaalikäyttäjä
          </button>
          <button type="button" className="btn btn-secondary" onClick={openSubscriberPortal}>
            Esikatsele tilaajaportaalia
          </button>
        </div>
      ) : (
        <form className="form-grid" onSubmit={(e) => void createPortalUser(e)}>
          <h3>Uusi portaalikäyttäjä</h3>
          <label>
            Sähköposti *
            <input
              type="email"
              value={invite.email}
              onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
              required
            />
          </label>
          <label>
            Nimi portaalissa
            <input
              value={invite.display_name}
              onChange={(e) => setInvite((i) => ({ ...i, display_name: e.target.value }))}
              placeholder={subscriberName}
            />
          </label>
          <ToggleSwitch checked={sendEmail} onChange={setSendEmail} label="Lähetä tunnukset sähköpostilla" />
              <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Luodaan…' : 'Luo käyttäjä'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setShowInvite(false)}>
              Peruuta
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
