import { FormEvent, useEffect, useState } from 'react';
import { updatePortalUser } from '../lib/updatePortalUser';

export type PortalUserCredentials = {
  id: string;
  email: string | null;
  display_name: string | null;
};

type Props = {
  portalUser: PortalUserCredentials;
  entityName: string;
  subscriberId?: string;
  customerId?: string;
  onUpdated: () => void | Promise<void>;
};

export default function PortalUserCredentialsForm({
  portalUser,
  entityName,
  subscriberId,
  customerId,
  onUpdated,
}: Props) {
  const [form, setForm] = useState({
    email: portalUser.email ?? '',
    display_name: portalUser.display_name ?? '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      email: portalUser.email ?? '',
      display_name: portalUser.display_name ?? '',
      password: '',
    });
    setMessage(null);
    setError(null);
  }, [portalUser.id, portalUser.email, portalUser.display_name]);

  async function saveCredentials(e: FormEvent) {
    e.preventDefault();
    const email = form.email.trim();
    if (!email) {
      setError('Sähköposti on pakollinen.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await updatePortalUser({
        user_id: portalUser.id,
        email,
        display_name: form.display_name.trim() || entityName,
        ...(form.password.trim() ? { password: form.password } : {}),
        subscriber_id: subscriberId ?? null,
        customer_id: customerId ?? null,
      });
      setMessage('Kirjautumistiedot päivitetty.');
      setForm((f) => ({ ...f, password: '' }));
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid portal-user-credentials-form" onSubmit={(e) => void saveCredentials(e)}>
      <h3>Kirjautumistiedot</h3>
      <p className="muted field-span-all">
        Ylläpitäjä voi vaihtaa portaalin sähköpostin ja salasanan. Jätä salasana tyhjäksi, jos et vaihda sitä.
      </p>
      {error && <p className="error field-span-all">{error}</p>}
      {message && <p className="muted field-span-all">{message}</p>}
      <label>
        Sähköposti (kirjautuminen) *
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
          autoComplete="off"
        />
      </label>
      <label>
        Nimi portaalissa
        <input
          value={form.display_name}
          onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          placeholder={entityName}
        />
      </label>
      <label className="field-span-all">
        Uusi salasana
        <input
          type="text"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder="Tyhjä = ei vaihdeta"
          autoComplete="new-password"
        />
      </label>
      <div className="form-actions field-span-all">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Tallennetaan…' : 'Tallenna kirjautumistiedot'}
        </button>
      </div>
    </form>
  );
}
