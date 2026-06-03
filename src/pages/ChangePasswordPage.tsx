import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';

type Props = {
  session: Session;
};

export default function ChangePasswordPage({ session }: Props) {
  const { profile, reload } = useProfile(session);
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
    const { error: updateError } = await supabase.auth.updateUser({ password });
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

  return (
    <AppLayout session={session}>
      <section className="panel form-grid" style={{ maxWidth: '32rem' }}>
        <h1>{required ? 'Vaihda väliaikainen salasana' : 'Vaihda salasana'}</h1>
        {required ? (
          <p className="muted">
            Ylläpitäjä on luonut tilillesi väliaikaisen salasanan. Vaihda salasana ennen sovelluksen käyttöä — älä
            jatka globaalille adminille tiedossa olevalla salasanalla.
          </p>
        ) : (
          <p className="muted">Valitse uusi salasana tilillesi.</p>
        )}

        <form onSubmit={(e) => void onSubmit(e)}>
          <div className="line-form-grid">
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
          </div>

          {error && <p className="error">{error}</p>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Tallennetaan…' : 'Tallenna uusi salasana'}
            </button>
            {!required && (
              <Link to="/hallinta/omat" className="btn btn-secondary">
                Peruuta
              </Link>
            )}
          </div>
        </form>
      </section>
    </AppLayout>
  );
}
