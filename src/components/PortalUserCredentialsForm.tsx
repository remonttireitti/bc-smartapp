import { FormEvent, useEffect, useState } from 'react';
import { updatePortalUser } from '../lib/updatePortalUser';
import PasswordReveal from './PasswordReveal';

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
  });
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      email: portalUser.email ?? '',
      display_name: portalUser.display_name ?? '',
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
        subscriber_id: subscriberId ?? null,
        customer_id: customerId ?? null,
      });
      setMessage('Kirjautumistiedot päivitetty.');
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function regeneratePassword() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setNewPassword(null);
    try {
      const res = await updatePortalUser({
        user_id: portalUser.id,
        email: portalUser.email ?? form.email.trim(),
        display_name: portalUser.display_name ?? entityName,
        generate_password: true,
        subscriber_id: subscriberId ?? null,
        customer_id: customerId ?? null,
      });
      if (!res.password) throw new Error('Salasanan luonti epäonnistui.');
      setNewPassword(res.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salasanan luonti epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid portal-user-credentials-form" onSubmit={(e) => void saveCredentials(e)}>
      <h3>Kirjautumistiedot</h3>
      <p className="muted field-span-all">
        Portaalin sähköposti ja salasana.
      </p>
      {error && <p className="error field-span-all">{error}</p>}
      {message && <p className="muted field-span-all">{message}</p>}
      {newPassword ? <PasswordReveal email={portalUser.email} password={newPassword} /> : null}
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
      <div className="form-actions field-span-all">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Tallennetaan…' : 'Tallenna kirjautumistiedot'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void regeneratePassword()}>
          Luo uusi salasana
        </button>
      </div>
    </form>
  );
}
