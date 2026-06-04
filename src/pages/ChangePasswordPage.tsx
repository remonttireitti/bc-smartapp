import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useAuthSession } from '../contexts/AuthSessionContext';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';

type Props = {
  session: Session;
};

export default function ChangePasswordPage({ session }: Props) {
  const { profile, reload } = useProfile(session);
  const { signOut } = useAuthSession();
  const navigate = useNavigate();
  const required = profile?.must_change_password === true;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Salasanan tulee olla vähintään 8 merkkiä.');
      return;
    }
    if (password !== confirm) {
      setError('Salasanat eivät täsmää.');
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }

    const { error: clearError } = await supabase.rpc('clear_must_change_password');
    setBusy(false);

    if (clearError) {
      setError(clearError.message);
      return;
    }

    await reload();
    navigate('/', { replace: true });
  }

  const form = (
    <form onSubmit={(e) => void onSubmit(e)}>
      <label>
        Uusi salasana
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
      </label>
      <label>
        Vahvista salasana
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Tallennetaan…' : 'Tallenna uusi salasana'}
      </button>
    </form>
  );

  if (required) {
    return (
      <div className="login-page">
        <div className="login-card login-card-wide">
          <h1>Vaihda väliaikainen salasana</h1>
          <p className="login-notice">
            Ylläpitäjä on luonut tilillesi väliaikaisen salasanan. Valitse uusi salasana ennen sovelluksen käyttöä.
          </p>
          {form}
          <p className="login-footer-actions">
            <button type="button" className="link-btn" onClick={() => void signOut('manual')}>
              Kirjaudu ulos
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppLayout session={session}>
      <section className="panel form-grid password-change-panel">
        <h1>Vaihda salasana</h1>
        <p className="muted">Valitse uusi salasana tilillesi.</p>
        {form}
        <div className="form-actions">
          <Link to="/hallinta/omat" className="btn btn-secondary">
            Peruuta
          </Link>
        </div>
      </section>
    </AppLayout>
  );
}
