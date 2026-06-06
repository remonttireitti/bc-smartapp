import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Navigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import DashboardTrialBanner from '../components/DashboardTrialBanner';
import DashboardWelcomeCard from '../components/DashboardWelcomeCard';
import OnboardingDemoPanel from '../components/OnboardingDemoPanel';
import PendingWorkOrdersBanner from '../components/PendingWorkOrdersBanner';
import QuickSearch from '../components/QuickSearch';
import { incrementAppVisit } from '../lib/dashboardOnboarding';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { useCompanyLicense } from '../hooks/useCompanyLicense';
import { useProfile } from '../hooks/useProfile';
import { isLicenseModuleAccessible, type LicenseModuleKey } from '../lib/companyLicense';
import { isMonitorViewerRole, monitorReaderHubPath } from '../lib/monitorReaderShares';
import { ROLE_LABELS } from '../lib/management';
import { getPortalPreviewLabel, isPortalPreviewActive, isPortalView } from '../lib/portalPreview';
import {
  loadPendingWorkOrderCounts,
  type PendingWorkOrderCounts,
} from '../lib/pendingWorkOrders';
import { supabase } from '../lib/supabase';

type ModuleTile = {
  title: string;
  desc: string;
  color: string;
  href: string;
  menuPath?: string;
  licenseModule?: LicenseModuleKey;
};

const MODULES: ModuleTile[] = [
  { title: 'Työraportti', desc: 'Työtilaukset ja raportit', color: '#0ea5e9', href: '/tyoraportit', licenseModule: 'base' },
  { title: 'Laskutus', desc: 'Kumppani- ja asiakaslaskutus', color: '#6366f1', href: '/laskutus', licenseModule: 'billing' },
  { title: 'Huoltoraportti', desc: 'Huoltopöytäkirjat ja laiterekisteri', color: '#22c55e', href: '/huoltoraportit', licenseModule: 'base' },
  { title: 'Asiakkaat', desc: 'Asiakkaat, laitteet, dokumentit', color: '#3b82f6', href: '/asiakkaat', licenseModule: 'base' },
  { title: 'Tarjouspyyntö', desc: 'Tarjoukset, laskelmat ja tulosteet', color: '#f97316', href: '/tarjouspyynnot', licenseModule: 'quotes' },
  { title: 'Varasto', desc: 'Materiaalit ja kylmäaine', color: '#a855f7', href: '/varasto', licenseModule: 'base' },
  {
    title: 'Etäohjaus ja seuranta',
    desc: 'Lämpötilaseuranta ja VRF-laitteet',
    menuPath: 'Etusivu → Etäohjaus ja seuranta',
    color: '#14b8a6',
    href: '/etaseuranta',
    licenseModule: 'remote_monitoring',
  },
  { title: 'Työkalut', desc: 'Työkaluinventaario', color: '#ec4899', href: '/tyokalut', licenseModule: 'tools' },
  { title: 'Hallinta', desc: 'Omat tiedot, yritys ja kumppanuudet', color: '#8b5cf6', href: '/hallinta/omat' },
];

interface Props {
  session: Session;
}

const PORTAL_MODULES: ModuleTile[] = [
  { title: 'Työtilaus', desc: 'Lähetä työtilaus palveluyritykselle', color: '#0ea5e9', href: '/tyoraportit/tilaus/uusi' },
  { title: 'Työraportit', desc: 'Omat tilaukset ja valmiit raportit', color: '#0284c7', href: '/tyoraportit' },
  { title: 'Huoltoraportit', desc: 'Valmiit huoltopöytäkirjat', color: '#22c55e', href: '/huoltoraportit' },
  { title: 'Kohteet', desc: 'Asiakaskohteet ja laitteet', color: '#3b82f6', href: '/asiakkaat' },
];

const EMPTY_PENDING: PendingWorkOrderCounts = {
  fromSubscriber: 0,
  fromPartner: 0,
  total: 0,
};

export default function Dashboard({ session }: Props) {
  const { profile } = useProfile(session);
  const billingModuleEnabled = useCompanyBillingModuleEnabled(profile?.company_id, session);
  const partnershipsEnabled = useCompanyPartnershipsEnabled(profile?.company_id, session);
  const { license } = useCompanyLicense(
    profile?.company_id,
    session,
    !!profile?.is_global_admin,
  );
  const portalView = isPortalView(profile);
  const visibleModules = useMemo(() => {
    if (portalView) return PORTAL_MODULES;
    return MODULES.filter((m) => {
      if (!m.licenseModule) return true;
      if (license && license.enrollment !== 'legacy') {
        return isLicenseModuleAccessible(license, m.licenseModule);
      }
      if (m.licenseModule === 'billing' && billingModuleEnabled === false) return false;
      return true;
    }).map((module) => {
      if (module.title === 'Laskutus' && partnershipsEnabled === false) {
        return { ...module, desc: 'Asiakaslaskutus' };
      }
      if (module.title === 'Hallinta' && partnershipsEnabled === false) {
        return { ...module, desc: 'Omat tiedot ja yritysasetukset' };
      }
      return module;
    });
  }, [portalView, license, billingModuleEnabled, partnershipsEnabled]);
  const [pendingOrders, setPendingOrders] = useState<PendingWorkOrderCounts>(EMPTY_PENDING);
  const [onboardingRefreshKey, setOnboardingRefreshKey] = useState(0);

  const companyId = profile?.company_id ?? '';

  useEffect(() => {
    if (!portalView) {
      incrementAppVisit();
    }
  }, [portalView]);

  useEffect(() => {
    if (portalView || !companyId) {
      setPendingOrders(EMPTY_PENDING);
      return;
    }

    void loadPendingWorkOrderCounts(supabase, companyId, session.user.id).then(setPendingOrders);
  }, [portalView, companyId, session.user.id]);

  const roleLabel = isPortalPreviewActive()
    ? `Esikatselu: ${getPortalPreviewLabel() ?? 'portaali'}`
    : (ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? '—');

  if (isMonitorViewerRole(profile?.role)) {
    return <Navigate to={monitorReaderHubPath()} replace />;
  }

  const showTrialBanner =
    !portalView && license && license.enrollment !== 'legacy'
    && (license.effective_status === 'trial' || license.effective_status === 'pending_trial');
  const isAdmin = profile?.role === 'admin';

  return (
    <AppLayout session={session}>
      <p className="subtitle">
        {profile?.companies?.name ?? 'Ei yritystä'} • {roleLabel}
      </p>

      {!portalView && (
        <DashboardWelcomeCard
          key={onboardingRefreshKey}
          session={session}
          profile={profile}
          isAdmin={isAdmin}
        />
      )}

      {!portalView && (
        <OnboardingDemoPanel
          companyId={companyId}
          onChanged={() => setOnboardingRefreshKey((value) => value + 1)}
        />
      )}

      {showTrialBanner && license && <DashboardTrialBanner license={license} />}

      {!portalView && pendingOrders.total > 0 && (
        <PendingWorkOrdersBanner counts={pendingOrders} />
      )}

      {!portalView && (
        <section className="search-box">
          <h2>Pikahaku</h2>
          <p className="muted">Asiakkaat, laitteet ja raportit — kirjoita vähintään 2 merkkiä</p>
          <QuickSearch />
        </section>
      )}

      <section className="grid">
        {visibleModules.map((m) => (
          <Link key={m.title} to={m.href} className="tile" style={{ background: m.color }}>
            {m.menuPath ? <span className="tile-menu-path">{m.menuPath}</span> : null}
            <strong>{m.title}</strong>
            <span>{m.desc}</span>
          </Link>
        ))}
      </section>
    </AppLayout>
  );
}
