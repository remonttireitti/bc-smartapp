import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from './AppLayout';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { useProfile } from '../hooks/useProfile';
import { ROLE_LABELS } from '../lib/management';
import {
  COMPANY_ADMIN_BASE,
  COMPANY_ADMIN_TITLE,
  SERVICE_ADMIN_BASE,
  SERVICE_ADMIN_TITLE,
  hallintaPageTitle,
  legacyServicePath,
  type ManagementScope,
} from '../lib/hallintaNav';

interface Props {
  session: Session;
  /** company = /hallinta (oma yritys), service = /palvelu (globaali admin). */
  scope?: ManagementScope;
}

const COMPANY_SETTINGS_PATH = '/hallinta/yritys';
const ADMIN_PATHS = ['/hallinta/kayttajat', '/hallinta/kumppanuudet'];
const PORTAL_ADMIN_PATHS = ['/hallinta/tilaajat', '/hallinta/asiakasportaali'];

export default function ManagementLayout({ session, scope = 'company' }: Props) {
  const location = useLocation();
  const { profile, loading, reload } = useProfile(session);
  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const partnershipsEnabled = useCompanyPartnershipsEnabled(profile?.company_id, session);
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const isGlobalAdmin = !!profile?.is_global_admin;
  const isCompanySettingsRoute = location.pathname.startsWith(COMPANY_SETTINGS_PATH);
  const isAdminRoute = ADMIN_PATHS.some((p) => location.pathname.startsWith(p));
  const isService = scope === 'service';
  const base = isService ? SERVICE_ADMIN_BASE : COMPANY_ADMIN_BASE;
  const isHub = location.pathname === base || location.pathname === `${base}/`;
  const pageTitle = hallintaPageTitle(location.pathname);
  const scopeTitle = isService ? SERVICE_ADMIN_TITLE : isAdmin || isManager ? COMPANY_ADMIN_TITLE : 'Hallinta';
  const legacyTarget = isService ? null : legacyServicePath(location.pathname, location.search);

  if (legacyTarget) return <Navigate to={`${legacyTarget}${location.hash}`} replace />;

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

  if (partnershipsEnabled === false && location.pathname.startsWith('/hallinta/kumppanuudet')) {
    return <Navigate to="/hallinta/omat" replace />;
  }

  if (isService && !isGlobalAdmin) {
    return (
      <AppLayout session={session}>
        <p className="error">Vain globaali admin pääsee tälle sivulle.</p>
        <p>
          <Link to="/hallinta">{COMPANY_ADMIN_TITLE}</Link>
        </p>
      </AppLayout>
    );
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

  // Portaalit: yrityksen ylläpitäjä tai GBA (oma yritys).
  const isPortalRoute = PORTAL_ADMIN_PATHS.some((p) => location.pathname.startsWith(p));
  if ((isAdminRoute && !isAdmin) || (isPortalRoute && !isAdmin && !isGlobalAdmin)) {
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
          {!isHub && (
            <p className={`management-scope${isService ? ' management-scope--service' : ''}`}>
              <Link to={base}>{scopeTitle}</Link>
            </p>
          )}
          <h1>{isHub ? scopeTitle : pageTitle ?? scopeTitle}</h1>
          {isHub && !isService && (
            <p className="muted">
              {profile.companies?.name ?? '—'} • {ROLE_LABELS[profile.role] ?? profile.role}
            </p>
          )}
        </div>
      </div>

      <Outlet
        context={{
          profile,
          session,
          reloadProfile: reload,
          billingModuleEnabled,
          partnershipsEnabled,
          scope,
        }}
      />
    </AppLayout>
  );
}
