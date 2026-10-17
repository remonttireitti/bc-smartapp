import { Link, useLocation } from 'react-router-dom';
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import { routeHidesSidebar } from '../lib/mainNav';
import { isPortalView } from '../lib/portalPreview';
import { isMonitorViewerRole } from '../lib/monitorReaderShares';
import type { Session } from '@supabase/supabase-js';
import LicenseStatusHeaderButton from './LicenseStatusHeaderButton';
import PortalPreviewBanner from './PortalPreviewBanner';
import { usePortalPreview } from '../hooks/usePortalPreview';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { useAuthSession } from '../contexts/AuthSessionContext';
import { useProfile } from '../hooks/useProfile';

interface Props {
  session: Session;
  children: ReactNode;
  /** Pakota ilman sivupalkkia. */
  noSidebar?: boolean;
}

const SIDEBAR_COLLAPSED_KEY = 'bc-sidebar-collapsed';
const COLLAPSED_EVENT = 'bc-sidebar-collapsed-change';

function subscribeCollapsed(callback: () => void) {
  window.addEventListener(COLLAPSED_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppLayout({ session, children, noSidebar = false }: Props) {
  const { profile } = useProfile(session);
  const partnershipsEnabled = useCompanyPartnershipsEnabled(profile?.company_id, session);
  const portalPreview = usePortalPreview();
  const { signOut: authSignOut } = useAuthSession();
  const [signingOut, setSigningOut] = useState(false);
  const location = useLocation();
  // Jaettu tila: keep-alive-välimuistin kaikki sivut näyttävät saman kavennuksen.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const showSidebar =
    !noSidebar
    && !!profile
    && !isPortalView(profile)
    && !isMonitorViewerRole(profile.role)
    && !routeHidesSidebar(location.pathname);

  function toggleCollapsed() {
    const next = !readCollapsed();
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await authSignOut('manual');
  }

  return (
    <div className={`dashboard${showSidebar ? ' app-with-sidebar' : ''}${showSidebar && collapsed ? ' sidebar-collapsed' : ''}`}>
      <header className="topbar">
        <div className="brand">
          {showSidebar ? (
            <button
              type="button"
              className="app-sidebar-burger"
              aria-label="Avaa valikko"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((value) => !value)}
            >
              ☰
            </button>
          ) : null}
          <Link to="/" className="brand-link">
            <span className="brand-icon">🏢</span>
            <span>BC Smartapp</span>
          </Link>
        </div>
        <div className="topbar-actions">
          <LicenseStatusHeaderButton session={session} />
          <div className="topbar-actions-group topbar-actions-user">
            {!portalPreview ? (
              <Link to="/hallinta/omat" className="topbar-user-name">
                {profile?.display_name ?? session.user.email}
              </Link>
            ) : (
              <span className="topbar-user-name">{profile?.display_name ?? session.user.email}</span>
            )}
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

      <div className="app-body">
        {showSidebar ? (
          <AppSidebar
            session={session}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={closeMobile}
          />
        ) : null}
        <main className="main">
          {portalPreview && <PortalPreviewBanner />}
          {children}
        </main>
      </div>

      <footer className="footer">
        BC Smartapp
        {partnershipsEnabled === false ? '' : ' — moniyritys + kumppanuudet'}
      </footer>
    </div>
  );
}
