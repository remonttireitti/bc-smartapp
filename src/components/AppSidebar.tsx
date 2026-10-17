import { useEffect, useMemo, useState, type ReactNode } from 'react';
import QuickSearch from './QuickSearch';
import { Link, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { useCompanyLicense } from '../hooks/useCompanyLicense';
import { useCompanyHuoltoSettings } from '../hooks/useCompanyHuoltoSettings';
import { useProfile } from '../hooks/useProfile';
import { isPortalView } from '../lib/portalPreview';
import { activeMainNavChild, buildMainNav, isMainNavItemActive, type MainNavIconKey, type MainNavItem } from '../lib/mainNav';

const ICON_PATHS: Record<MainNavIconKey | 'home', string> = {
  home: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5',
  work: 'M6 3h9l4 4v14H6V3zm8 1.5V8h3.5M9 12h7M9 16h7',
  billing: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zm4 5h6M9 12h6M9 16h4',
  maintenance: 'M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4 16.4V20h3.6l6.3-6.3A4.5 4.5 0 1 0 14.5 4z',
  customers: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2 .8 3 3 3 6',
  quotes: 'M4 4h16v12H8l-4 4V4zm4 5h8M8 12h5',
  inventory: 'M3 8l9-5 9 5v10l-9 5-9-5V8zm0 0l9 5 9-5M12 13v10',
  remote: 'M12 12v9M8.5 8.5a5 5 0 0 1 7 0M5.5 5.5a9.2 9.2 0 0 1 13 0',
  tools: 'M3 21l7-7M14 4l6 6-3 3-6-6 3-3zM9 9l6 6',
  service: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3C9.5 5.5 8.2 8.5 8.2 12s1.3 6.5 3.8 9',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
};

function NavIcon({ name }: { name: MainNavIconKey | 'home' }) {
  return (
    <svg className="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Asiakas-/tilaajaportaalin valikko. */
const PORTAL_NAV: MainNavItem[] = [
  { key: 'work', label: 'Uusi työtilaus', href: '/tyoraportit/tilaus/uusi', bases: ['/tyoraportit/tilaus'], children: [] },
  { key: 'work', label: 'Työraportit', href: '/tyoraportit', bases: ['/tyoraportit'], children: [] },
  { key: 'customers', label: 'Laitteet', href: '/laitteet', bases: ['/laitteet', '/asiakkaat'], children: [] },
  { key: 'maintenance', label: 'Huoltopöytäkirjat', href: '/huoltoraportit', bases: ['/huoltoraportit'], children: [] },
  { key: 'quotes', label: 'Tarjoukset', href: '/tarjoukset', bases: ['/tarjoukset', '/tarjouspyynnot'], children: [] },
];

function portalNavActive(item: MainNavItem, pathname: string): boolean {
  if (item.href === '/tyoraportit') return pathname.startsWith('/tyoraportit') && !pathname.startsWith('/tyoraportit/tilaus');
  return item.bases.some((b) => pathname.startsWith(b));
}

type Props = {
  session: Session;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** Lisenssi, käyttäjä ja uloskirjautuminen sivupalkin alaosaan. */
  footer?: ReactNode;
};

export default function AppSidebar({ session, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, footer }: Props) {
  const location = useLocation();
  const { profile } = useProfile(session);
  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const partnershipsEnabled = useCompanyPartnershipsEnabled(profile?.company_id, session);
  const { license } = useCompanyLicense(profile?.company_id, session, !!profile?.is_global_admin);
  const huolto = useCompanyHuoltoSettings(profile?.company_id, session);
  const huoltoAccess = huolto.loaded ? huolto.access : null;

  const portal = isPortalView(profile);
  const items = useMemo(
    () => portal ? PORTAL_NAV : 
      buildMainNav({
        license,
        billingModuleEnabled,
        partnershipsEnabled,
        role: profile?.role,
        isGlobalAdmin: !!profile?.is_global_admin,
        huolto: huoltoAccess,
      }),
    [portal, license, billingModuleEnabled, partnershipsEnabled, profile?.role, profile?.is_global_admin, huoltoAccess],
  );

  // Mobiililaatikko sulkeutuu navigoinnissa.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  const showChildren = !collapsed || mobileOpen;
  const railCollapsed = collapsed && !mobileOpen;
  const [focusSearch, setFocusSearch] = useState(false);
  useEffect(() => {
    if (!focusSearch) return;
    const id = window.setTimeout(() => setFocusSearch(false), 300);
    return () => window.clearTimeout(id);
  }, [focusSearch]);

  return (
    <>
      {mobileOpen ? <div className="app-sidebar-backdrop" onClick={onCloseMobile} aria-hidden="true" /> : null}
      <nav
        className={`app-sidebar${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}
        aria-label="Päävalikko"
      >
        <button
          type="button"
          className="app-sidebar-collapse"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Laajenna valikko' : 'Pienennä valikko'}
          title={collapsed ? 'Laajenna valikko' : 'Pienennä valikko'}
        >
          <svg className="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="app-sidebar-label">Pienennä valikko</span>
        </button>
        {!portal ? <div className="app-sidebar-search">
          {railCollapsed ? (
            <button
              type="button"
              className="app-sidebar-link app-sidebar-search-btn"
              title="Pikahaku"
              aria-label="Pikahaku"
              onClick={() => {
                onToggleCollapsed();
                setFocusSearch(true);
              }}
            >
              <svg className="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3l-4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <QuickSearch variant="sidebar" placeholder="Hae asiakas, laite, raportti…" resultLimit={12} autoFocus={focusSearch} />
          )}
        </div> : null}
        <ul className="app-sidebar-list">
          {!portal ? <li>
            <Link
              to="/"
              className={`app-sidebar-link${location.pathname === '/' ? ' is-active' : ''}`}
              title={collapsed ? 'Etusivu' : undefined}
            >
              <NavIcon name="home" />
              <span className="app-sidebar-label">Etusivu</span>
            </Link>
          </li> : null}
          {items.map((item) => {
            const active = portal ? portalNavActive(item, location.pathname) : isMainNavItemActive(item, location.pathname);
            const activeChild = active ? activeMainNavChild(item, location.pathname, location.search) : null;
            return (
              <li key={item.href} className={item.section ? 'app-sidebar-section-item' : undefined}>
                {item.section ? (
                  <span className="app-sidebar-section-label" aria-hidden={railCollapsed || undefined}>
                    {railCollapsed ? '' : item.section}
                  </span>
                ) : null}
                <Link
                  to={item.href}
                  className={`app-sidebar-link${active ? ' is-active' : ''}`}
                  title={collapsed ? item.label : undefined}
                  aria-current={active && !activeChild ? 'page' : undefined}
                >
                  <NavIcon name={item.key} />
                  <span className="app-sidebar-label">{item.label}</span>
                </Link>
                {active && item.children.length > 0 && showChildren ? (
                  <ul className="app-sidebar-sublist">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          to={child.href}
                          className={`app-sidebar-sublink${activeChild?.href === child.href ? ' is-active' : ''}`}
                          aria-current={activeChild?.href === child.href ? 'page' : undefined}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="app-sidebar-bottom">
        {footer ? <div className="app-sidebar-footer">{footer}</div> : null}

        </div>
      </nav>
    </>
  );
}
