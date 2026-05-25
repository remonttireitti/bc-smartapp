import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useProfile } from '../hooks/useProfile';

interface Props {
  session: Session;
  children: ReactNode;
}

export default function AppLayout({ session, children }: Props) {
  const { profile } = useProfile(session);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Uloskirjautuminen epäonnistui:', error.message);
      setSigningOut(false);
      return;
    }
    window.location.assign('/login');
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">
          <Link to="/" className="brand-link">
            <span className="brand-icon">🏢</span>
            <span>BC Smartapp</span>
          </Link>
        </div>
        <div className="topbar-actions">
          <div className="topbar-actions-group topbar-actions-user">
            <Link to="/hallinta/omat" className="topbar-user-name">
              {profile?.display_name ?? session.user.email}
            </Link>
            <span className="topbar-actions-sep" aria-hidden="true" />
            <button
              type="button"
              onClick={() => void signOut()}
              className="link-btn topbar-signout"
              disabled={signingOut}
            >
              {signingOut ? 'Kirjaudutaan ulos…' : 'Kirjaudu ulos'}
            </button>
          </div>
        </div>
      </header>

      <main className="main">{children}</main>

      <footer className="footer">BC Smartapp — moniyritys + kumppanuudet</footer>
    </div>
  );
}
