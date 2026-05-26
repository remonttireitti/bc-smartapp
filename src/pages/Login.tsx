import { FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SIGN_OUT_REASON_MESSAGES, type SignOutReason } from '../lib/authSessionConfig';
import { translateAuthError } from '../lib/authErrors';
import { supabase } from '../lib/supabase';

function parseSignOutReason(raw: string | null): SignOutReason | null {
  if (raw === 'idle' || raw === 'remote' || raw === 'expired') return raw;
  return null;
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signOutNotice = useMemo(() => {
    const reason = parseSignOutReason(searchParams.get('reason'));
    return reason ? SIGN_OUT_REASON_MESSAGES[reason] : null;
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(translateAuthError(err.message));
      setBusy(false);
      return;
    }
    await supabase.auth.signOut({ scope: 'others' });
    setBusy(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>BC Smartapp</h1>
        <p className="muted">Kirjaudu sisään</p>
        {signOutNotice && <p className="login-notice">{signOutNotice}</p>}
        <form onSubmit={onSubmit}>
          <label>
            Sähköposti
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Salasana
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Kirjaudutaan…' : 'Kirjaudu'}
          </button>
        </form>
      </div>
    </div>
  );
}
