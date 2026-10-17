import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from './AppLayout';
import ToggleSwitch from './ToggleSwitch';
import Tooltip from './Tooltip';
import { IconGear } from './icons';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { useGlobalAdminMode } from '../hooks/useGlobalAdminMode';
import { useProfile } from '../hooks/useProfile';
import { ROLE_LABELS } from '../lib/management';
import { hallintaPageTitle } from '../lib/hallintaNav';

interface Props {
  session: Session;
}

const COMPANY_SETTINGS_PATH = '/hallinta/yritys';
const ADMIN_PATHS = ['/hallinta/tilaajat', '/hallinta/kayttajat', '/hallinta/kumppanuudet', '/hallinta/kumppanilaskutus'];
const GBA_PATHS = ['/hallinta/global-admin', '/hallinta/yritykset'];

export default function ManagementLayout({ session }: Props) {
  const location = useLocation();
  const { profile, loading, reload } = useProfile(session);
  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const partnershipsEnabled = useCompanyPartnershipsEnabled(profile?.company_id, session);
  const { globalAdminMode, setGlobalAdminMode } = useGlobalAdminMode();
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const isGlobalAdmin = !!profile?.is_global_admin;
  const isCompanySettingsRoute = location.pathname.startsWith(COMPANY_SETTINGS_PATH);
  const isAdminRoute = ADMIN_PATHS.some((p) => location.pathname.startsWith(p));
  const isGlobalAdminRoute = GBA_PATHS.some((p) => location.pathname.startsWith(p));
  const isHub = location.pathname === '/hallinta' || location.pathname === '/hallinta/';
  const pageTitle = hallintaPageTitle(location.pathname, location.search);

  if (loading && !profile) {
    return (
      <AppLayout session={session}>
        <p className="muted page-loading-placeholder">Ladataan…</p>
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

  if (billingModuleEnabled === false && location.pathname.startsWith('/hallinta/kumppanilaskutus')) {
    return <Navigate to="/hallinta/omat" replace />;
  }

  if (partnershipsEnabled === false && location.pathname.startsWith('/hallinta/kumppanuudet')) {
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
          <p className="error">Globaali admin -tila on pois päältä.</p>
          <p>
            <Link to="/hallinta">Hallinta</Link>
          </p>
        </AppLayout>
      );
    }
  }

  if (isCompanySettingsRoute && !isAdmin && !isManager) {
    return (
      <AppLayout session={session}>
        <p className="error">Vain ylläpitäjä tai esimies voi avata yritystiedot.</p>
        <p>
          <Link to="/hallinta/omat">Siirry omiin tietoihin</Link>
        </p>
      </AppLayout>
    );
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

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb breadcrumb-home-only">
            <Link to="/">Etusivu</Link> / {isHub ? 'Hallinta' : <Link to="/hallinta">Hallinta</Link>}
            {pageTitle && !isHub ? ` / ${pageTitle}` : ''}
          </p>
          <h1>{isHub ? 'Hallinta' : pageTitle ?? 'Hallinta'}</h1>
          {isHub && (
            <p className="muted">
              {profile.companies?.name ?? '—'} • {ROLE_LABELS[profile.role] ?? profile.role}
            </p>
          )}
        </div>
        {isHub && isGlobalAdmin && (
          <Tooltip side="bottom" label="Globaali admin -tila: kaikkien yritysten hallinta.">
            <ToggleSwitch
              className="management-gba-toggle"
              checked={globalAdminMode}
              onChange={setGlobalAdminMode}
              id="management-global-admin-mode"
              label="Globaali admin"
              icon={<IconGear className="ui-icon management-gba-icon" />}
            />
          </Tooltip>
        )}
      </div>

      <Outlet
        context={{
          profile,
          session,
          reloadProfile: reload,
          billingModuleEnabled,
          partnershipsEnabled,
        }}
      />
    </AppLayout>
  );
}
