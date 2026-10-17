import { FormEvent, useEffect, useState } from 'react';
import PortalUserCredentialsForm from './PortalUserCredentialsForm';
import PasswordReveal from './PasswordReveal';
import { useNavigate } from 'react-router-dom';
import { rememberPortalPreviewReturn } from '../lib/portalPreview';
import ToggleSwitch from './ToggleSwitch';
import PortalOrderRecipients from './PortalOrderRecipients';
import { inviteCompanyUser } from '../lib/inviteUser';
import { supabase } from '../lib/supabase';

type PortalProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
};

type Props = {
  /** Asiakasportaali (customerId) tai tilaajaportaali (subscriberId) — sama hallinta. */
  customerId?: string;
  subscriberId?: string;
  customerName: string;
  companyId: string;
  canManage: boolean;
  sectionId?: string;
};


export default function CustomerPortalSection({
  customerId,
  subscriberId,
  customerName,
  companyId,
  canManage,
  sectionId = 'customer-portal',
}: Props) {
  const isSubscriber = !!subscriberId;
  const entityId = (subscriberId ?? customerId) as string;
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
  }, [entityId]);

  async function loadPortalUser() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq(isSubscriber ? 'subscriber_id' : 'customer_id', entityId)
      .eq('role', isSubscriber ? 'subscriber' : 'customer')
      .maybeSingle();

    if (loadError) {
      console.error(loadError);
      setPortalUser(null);
    } else {
      setPortalUser((data as PortalProfile | null) ?? null);
    }
    setLoading(false);
  }

  function openCustomerPortal() {
    rememberPortalPreviewReturn(`${window.location.pathname}${window.location.search}`);
    navigate(`/esikatselu/${isSubscriber ? 'tilaaja' : 'asiakas'}/${entityId}`);
  }

  async function createPortalUser(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
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
        display_name: invite.display_name.trim() || customerName,
        role: isSubscriber ? 'subscriber' : 'customer',
        company_id: companyId,
        ...(isSubscriber ? { subscriber_id: subscriberId } : { customer_id: customerId }),
      });
      setMessage(`Portaalikäyttäjä luotu: ${email}.${created.mail_sent === true ? ' Tunnukset lähetetty sähköpostilla.' : created.mail_sent === false ? ` Sähköposti epäonnistui: ${created.mail_error ?? ''}` : ''}`);
      setCreatedPassword(created.password ? { email, password: created.password } : null);
      setShowInvite(false);
      setInvite({ email: '', display_name: '' });
      await loadPortalUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Käyttäjän luonti epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel customer-portal-panel" id={sectionId}>
      <p className="muted">
        {isSubscriber
          ? 'Tilaaja näkee kaikkien kohteidensa portaalit ja tilaa töitä niille.'
          : 'Asiakas kirjautuu, tilaa töitä ja näkee raportit.'}
      </p>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}
      {createdPassword ? <PasswordReveal email={createdPassword.email} password={createdPassword.password} /> : null}

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : portalUser ? (
        <div className="customer-portal-active">
          {canManage ? (
            <PortalUserCredentialsForm
              portalUser={portalUser}
              entityName={customerName}
              customerId={customerId}
              subscriberId={subscriberId}
              onUpdated={loadPortalUser}
            />
          ) : (
            <dl className="detail-list compact">
              <div>
                <dt>Kirjautuminen</dt>
                <dd>{portalUser.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Näyttönimi</dt>
                <dd>{portalUser.display_name ?? '—'}</dd>
              </div>
            </dl>
          )}
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={openCustomerPortal}>
              {isSubscriber ? 'Avaa tilaajaportaali' : 'Avaa asiakasportaali'}
            </button>
          </div>
          
        </div>
      ) : canManage ? (
        <>
          {!showInvite ? (
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={() => setShowInvite(true)}>
                Luo portaalikäyttäjä
              </button>
              <button type="button" className="btn btn-secondary" onClick={openCustomerPortal}>
                {isSubscriber ? 'Esikatsele tilaajaportaalia' : 'Esikatsele asiakasportaalia'}
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
                  placeholder={customerName}
                />
              </label>
              <ToggleSwitch checked={sendEmail} onChange={setSendEmail} label="Lähetä tunnukset sähköpostilla" />
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Luodaan…' : 'Luo ja avaa portaali'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setShowInvite(false)}
                >
                  Peruuta
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <p className="muted">Vain ylläpitäjä voi luoda portaalikäyttäjiä.</p>
      )}
      {canManage ? (
        isSubscriber ? <PortalOrderRecipients subscriberId={subscriberId} /> : <PortalOrderRecipients customerId={customerId} />
      ) : null}
    </section>
  );
}
