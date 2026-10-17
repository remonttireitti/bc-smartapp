import { useState } from 'react';

/** Näyttää luodun salasanan kerran kopiointipainikkeella. */
export default function PasswordReveal({ email, password }: { email?: string | null; password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="password-reveal field-span-all" role="status">
      {email ? <span className="muted">{email}</span> : null}
      <div className="password-reveal-row">
        <code className="password-reveal-value">{password}</code>
        <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
          {copied ? 'Kopioitu' : 'Kopioi'}
        </button>
      </div>
      <span className="muted">Salasana näytetään vain nyt.</span>
    </div>
  );
}
