import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from './AppLayout';
import ToggleSwitch from './ToggleSwitch';
import Tooltip from './Tooltip';
import { IconGear } from './icons';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useGlobalAdminMode } from '../hooks/useGlobalAdminMode';
import { useProfile } from '../hooks/useProfile';
import { ROLE_LABELS } from '../lib/management';

interface Props {
  session: Session;
}

const PROFILE_TAB = { href: '/hallinta/omat', label: 'Omat tiedot' };

const ADMIN_TABS = [
  { href: '/hallinta/yritys', label: 'Yritystiedot' },
  { href: '/hallinta/tilaajat', label: 'Tilaajat' },
  { href: '/hallinta/kayttajat', label: 'Käyttäjät' },
  { href: '/hallinta/kumppanuudet', label: 'Kumppanuudet' },
  { href: '/hallinta/kumppanilaskutus', label: 'Kumppanilaskutus' },
];

const GLOBAL_ADMIN_TAB = { href: '/hallinta/global-admin', label: 'Globaali admin' };

export default function ManagementLayout({ session }: Props) {
  const location = useLocation();
  const { profile, loading, reload } = useProfile(session);
  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const { globalAdminMode, setGlobalAdminMode } = useGlobalAdminMode();
  const isAdmin = profile?.role === 'admin';
  const isGlobalAdmin = !!profile?.is_global_admin;
  const isAdminRoute = ADMIN_TABS.some((tab) => location.pathname.startsWith(tab.href));
  const isGlobalAdminRoute = location.pathname.startsWith(GLOBAL_ADMIN_TAB.href);

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (!profile?.company_id) {
    return (
      <AppLayout session={session}>
        <p className="error">Yritys puuttuu profiilista. Aja npm run setup:dev ja kirjaudu uudelleen.</p>
      </AppLayout>
    );
  }

  if (location.pathname === '/hallinta' || location.pathname === '/hallinta/') {
    return <Navigate to={isAdmin ? '/hallinta/yritys' : '/hallinta/omat'} replace />;
  }

  if (billingModuleEnabled === false && location.pathname.startsWith('/hallinta/kumppanilaskutus')) {
    return <Navigate to="/hallinta/omat" replace />;
  }

  if (isGlobalAdminRoute) {
    if (!isGlobalAdmin) {
      return (
        <AppLayout session={session}>
          <p className="error">Vain globaali admin pääsee tälle sivulle.</p>
          <p>
            <Link to="/hallinta/omat">Siirry hallintaan</Link>
          </p>
        </AppLayout>
      );
    }
    if (!globalAdminMode) {
      return (
        <AppLayout session={session}>
          <p className="error">Ota globaali admin -tila käyttöön hallinnassa.</p>
          <p>
            <Link to="/hallinta/omat">Siirry hallintaan</Link>
          </p>
        </AppLayout>
      );
    }
  }

  if (isAdminRoute && !isAdmin) {
    return (
      <AppLayout session={session}>
        <p className="error">Vain ylläpitäjä voi muokata yrityksen hallinta-asetuksia.</p>
        <p>
          <Link to="/hallinta/omat">Siirry omiin tietoihin</Link>
        </p>
      </AppLayout>
    );
  }

  const adminTabs =
    billingModuleEnabled === false
      ? ADMIN_TABS.filter((tab) => tab.href !== '/hallinta/kumppanilaskutus')
      : ADMIN_TABS;

  const tabs = [
    PROFILE_TAB,
    ...(isAdmin ? adminTabs : []),
    ...(isGlobalAdmin && globalAdminMode ? [GLOBAL_ADMIN_TAB] : []),
  ];

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Hallinta
          </p>
          <h1>Hallinta</h1>
          <p className="muted">
            {profile.companies?.name ?? '—'} • {ROLE_LABELS[profile.role] ?? profile.role}
          </p>
        </div>
      </div>

      {isGlobalAdmin && (
        <section className="panel global-admin-panel">
          <div className="global-admin-panel-head">
            <div>
              <h2>Globaali admin (GBA)</h2>
              <p className="muted global-admin-panel-copy">
                Massamuokkaus ja omistajuuden hallinta. Näkyy vain hallinnassa.
              </p>
            </div>
            <Tooltip
              side="bottom"
              label="Globaali admin (GBA): massamuokkaus ja omistajuuden hallinta."
            >
              <ToggleSwitch
                className="management-gba-toggle"
                checked={globalAdminMode}
                onChange={setGlobalAdminMode}
                id="management-global-admin-mode"
                icon={<IconGear className="ui-icon management-gba-icon" />}
              />
            </Tooltip>
          </div>
        </section>
      )}

      <div className="toolbar">
        <div className="tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              to={tab.href}
              className={location.pathname.startsWith(tab.href) ? 'tab active tab-link' : 'tab tab-link'}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <Outlet context={{ profile, session, reloadProfile: reload, billingModuleEnabled }} />
    </AppLayout>
  );
}
