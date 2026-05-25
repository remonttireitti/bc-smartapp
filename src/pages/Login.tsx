import { FormEvent, useState } from 'react';
import { translateAuthError } from '../lib/authErrors';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(translateAuthError(err.message));
    setBusy(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>BC Smartapp</h1>
        <p className="muted">Kirjaudu sisään</p>
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
