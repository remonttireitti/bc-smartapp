import { FormEvent, useEffect, useState } from 'react';
import { inviteCompanyUser } from '../lib/inviteUser';
import { supabase } from '../lib/supabase';

type PortalProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
};

type Props = {
  customerId: string;
  customerName: string;
  companyId: string;
  canManage: boolean;
  sectionId?: string;
};

function customerPortalPreviewUrl(customerId: string) {
  return `${window.location.origin}/esikatselu/asiakas/${customerId}`;
}

export default function CustomerPortalSection({
  customerId,
  customerName,
  companyId,
  canManage,
  sectionId = 'customer-portal',
}: Props) {
  const [portalUser, setPortalUser] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({
    email: '',
    password: 'test123456',
    display_name: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPortalUser();
  }, [customerId]);

  async function loadPortalUser() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('customer_id', customerId)
      .eq('role', 'customer')
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
    window.open(customerPortalPreviewUrl(customerId), '_blank', 'noopener,noreferrer');
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
      await inviteCompanyUser({
        email,
        password: invite.password,
        display_name: invite.display_name.trim() || customerName,
        role: 'customer',
        company_id: companyId,
        customer_id: customerId,
      });
      setMessage(`Portaalikäyttäjä luotu: ${email}`);
      setShowInvite(false);
      setInvite({ email: '', password: 'test123456', display_name: '' });
      await loadPortalUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Käyttäjän luonti epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel customer-portal-panel" id={sectionId}>
      <h2>Asiakasportaali</h2>
      <p className="muted">
        Kohde <strong>{customerName}</strong> — asiakas kirjautuu, lähettää työtilauksia ja näkee toimitetut
        raportit.
      </p>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : portalUser ? (
        <div className="customer-portal-active">
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
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={openCustomerPortal}>
              Avaa asiakasportaali
            </button>
          </div>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Esikatselussa käytetään yrityskäyttäjän istuntoa, mutta näet asiakasportaalin näkymän kohteesi
            oikeuksilla.
          </p>
        </div>
      ) : canManage ? (
        <>
          {!showInvite ? (
            <div className="form-actions">
              <button type="button" className="btn btn-primary" onClick={() => setShowInvite(true)}>
                Luo portaalikäyttäjä
              </button>
              <button type="button" className="btn btn-secondary" onClick={openCustomerPortal}>
                Esikatsele asiakasportaalia
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
              <label>
                Väliaikainen salasana
                <input
                  type="text"
                  value={invite.password}
                  onChange={(e) => setInvite((i) => ({ ...i, password: e.target.value }))}
                />
              </label>
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
    </section>
  );
}
