import BrandLogo from './BrandLogo';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import { ROLE_LABELS } from '../lib/management';
import { routeHidesSidebar } from '../lib/mainNav';
import { isPortalRouteAllowed, isPortalView, portalRedirectFor } from '../lib/portalPreview';
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
    && !isMonitorViewerRole(profile.role)
    // Portaalissa valikko näkyy myös tulostenäkymissä (ei paperilla).
    && (!routeHidesSidebar(location.pathname) || (isPortalView(profile) && /\/tuloste\/?$/.test(location.pathname)));

  // Portaali: henkilöstön reitit (esim. asiakaslista/-valitsin) eivät ole saatavilla.
  if (profile && isPortalView(profile)) {
    const redirect = portalRedirectFor(location.pathname);
    if (redirect) return <Navigate to={redirect} replace />;
    if (!isPortalRouteAllowed(location.pathname)) return <Navigate to="/" replace />;
  }

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
    <div className={`dashboard${isPortalView(profile) ? ' portal-mode' : ''}${showSidebar ? ' app-with-sidebar' : ''}${showSidebar && collapsed ? ' sidebar-collapsed' : ''}`}>
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
          <Link to="/" className="brand-link" aria-label="BC Smartapp">
            <BrandLogo variant="mark" size="1.55rem" />
          </Link>
        </div>
        {showSidebar ? null : (
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
        )}
      </header>

      <div className="app-body">
        {showSidebar ? (
          <AppSidebar
            session={session}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={closeMobile}
            footer={
              <>
                <LicenseStatusHeaderButton session={session} variant="sidebar" />
                <Link
                  to={isPortalView(profile) ? '/' : '/hallinta/omat'}
                  className="app-sidebar-link app-sidebar-user"
                  title={[profile?.display_name ?? session.user.email, profile?.companies?.name, ROLE_LABELS[profile?.role ?? ''] ?? profile?.role].filter(Boolean).join(' • ')}
                >
                  <svg className="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <span className="app-sidebar-label app-sidebar-user-text">
                    <span className="app-sidebar-user-name">{profile?.display_name ?? session.user.email}</span>
                    <span className="app-sidebar-user-meta">
                      {[profile?.companies?.name, ROLE_LABELS[profile?.role ?? ''] ?? profile?.role]
                        .filter(Boolean)
                        .join(' • ')}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="app-sidebar-link app-sidebar-signout"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  title="Kirjaudu ulos"
                >
                  <svg className="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="app-sidebar-label">{signingOut ? 'Kirjaudutaan ulos…' : 'Kirjaudu ulos'}</span>
                </button>
              </>
            }
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
