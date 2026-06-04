import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { translateAuthError } from '../lib/authErrors';
import { supabase } from '../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
        setInvalid(false);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setReady(true);
        return;
      }

      window.setTimeout(() => {
        if (!mounted) return;
        void supabase.auth.getSession().then(({ data: { session: retrySession } }) => {
          if (!mounted) return;
          if (retrySession) {
            setReady(true);
          } else {
            setInvalid(true);
          }
        });
      }, 800);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
      setError(translateAuthError(updateError.message));
      return;
    }

    await supabase.rpc('clear_must_change_password');
    setBusy(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card login-card-wide">
        <h1>Aseta uusi salasana</h1>

        {invalid && !ready ? (
          <>
            <p className="error">
              Palautuslinkki on vanhentunut tai virheellinen. Pyydä uusi linkki kirjautumissivulta.
            </p>
            <p className="login-footer-actions">
              <Link to="/unohdin-salasana">Pyydä uusi palautuslinkki</Link>
              {' · '}
              <Link to="/login">Kirjaudu sisään</Link>
            </p>
          </>
        ) : !ready ? (
          <p className="muted">Vahvistetaan palautuslinkkiä…</p>
        ) : (
          <>
            <p className="muted">Valitse uusi salasana tilillesi.</p>
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
          </>
        )}
      </div>
    </div>
  );
}
