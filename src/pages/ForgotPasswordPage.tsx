import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthSession } from '../contexts/AuthSessionContext';
import { translateAuthError } from '../lib/authErrors';
import { passwordResetRedirectUrl } from '../lib/authRedirect';
import { supabase } from '../lib/supabase';

export default function ForgotPasswordPage() {
  const { session } = useAuthSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirectUrl(),
    });

    setBusy(false);
    if (resetError) {
      setError(translateAuthError(resetError.message));
      return;
    }

    setSent(true);
  }

  return (
    <div className="login-page">
      <div className="login-card login-card-wide">
        <p className="login-back">
          <Link to="/login">← Takaisin kirjautumiseen</Link>
        </p>
        <h1>Unohditko salasanan?</h1>
        {sent ? (
          <>
            <p className="login-notice">
              Jos sähköpostiosoite <strong>{email.trim()}</strong> löytyy järjestelmästä, lähetimme siihen linkin
              salasanan vaihtoon. Tarkista myös roskaposti.
            </p>
            <p className="login-footer-actions">
              <Link to="/login">Takaisin kirjautumiseen</Link>
            </p>
          </>
        ) : (
          <>
            <p className="muted">Syötä tilisi sähköpostiosoite. Lähetämme linkin uuden salasanan asettamiseen.</p>
            <form onSubmit={(e) => void onSubmit(e)}>
              <label>
                Sähköposti
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Lähetetään…' : 'Lähetä palautuslinkki'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
