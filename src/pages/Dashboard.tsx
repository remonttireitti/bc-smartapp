import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { HubTileGrid } from '../components/HubTile';
import DashboardWelcomeCard from '../components/DashboardWelcomeCard';
import OnboardingDemoPanel from '../components/OnboardingDemoPanel';
import PendingWorkOrdersBanner from '../components/PendingWorkOrdersBanner';
import { incrementAppVisit } from '../lib/dashboardOnboarding';
import { useCompanyBillingModuleEnabled } from '../hooks/useCompanyBillingModuleEnabled';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { useCompanyLicense } from '../hooks/useCompanyLicense';
import { useCompanyHuoltoSettings } from '../hooks/useCompanyHuoltoSettings';
import { HUOLTO_CATEGORIES } from '../lib/huoltoCategories';
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
  lines: string[];
  color: string;
  href: string;
  menuPath?: string;
  licenseModule?: LicenseModuleKey;
};

const MODULES: ModuleTile[] = [
  { title: 'Työraportti', lines: ['Työtilaukset ja päiväkirjaukset', 'Kalenteri ja raportit'], color: '#0ea5e9', href: '/tyoraportit', licenseModule: 'base' },
  { title: 'Laskutus', lines: ['Laskutettavat', 'Tilastot'], color: '#6366f1', href: '/laskutus', licenseModule: 'billing' },
  { title: 'Huoltoraportti', lines: ['Huoltopöytäkirjat', 'Laiterekisteri'], color: '#22c55e', href: '/huoltoraportit', licenseModule: 'base' },
  { title: 'Asiakkaat', lines: ['Asiakasrekisteri', 'Laitteet ja dokumentit'], color: '#3b82f6', href: '/asiakkaat', licenseModule: 'base' },
  { title: 'Tarjouspyynnöt ja laskennat', lines: ['Huolto, LVI, IV, sähkö, lämpöpumput', 'Asennussuunnittelu'], color: '#f97316', href: '/tarjouspyynnot', licenseModule: 'quotes' },
  { title: 'Varasto', lines: ['Materiaalit', 'Kylmäainekirjanpito'], color: '#a855f7', href: '/varasto', licenseModule: 'inventory' },
  {
    title: 'Etäohjaus ja seuranta',
    lines: ['Lämpötilaseuranta', 'VRF ohjaus ja seuranta'],
    color: '#14b8a6',
    href: '/etaseuranta',
    licenseModule: 'remote_monitoring',
  },
  { title: 'Työkalut', lines: ['Työkaluinventaario', 'Lainaus ja varaukset'], color: '#ec4899', href: '/tyokalut', licenseModule: 'tools' },
  { title: 'Hallinta', lines: ['Omat tiedot ja yritys', 'Käyttäjät ja kumppanuudet'], color: '#8b5cf6', href: '/hallinta' },
];

const SERVICE_TILE: ModuleTile = { title: 'Palvelun hallinta', lines: ['Yritykset ja tilaukset', 'Hinnasto'], color: '#7c3aed', href: '/palvelu' };

interface Props {
  session: Session;
}

const PORTAL_MODULES: ModuleTile[] = [
  { title: 'Uusi työtilaus', lines: ['Lähetä työtilaus'], color: '#0ea5e9', href: '/tyoraportit/tilaus/uusi' },
  { title: 'Työraportit', lines: ['Tilaukset ja valmiit työt'], color: '#0284c7', href: '/tyoraportit' },
  { title: 'Laitteet', lines: ['Laitteet ja huoltohistoria'], color: '#3b82f6', href: '/laitteet' },
  { title: 'Huoltopöytäkirjat', lines: ['Valmiit huollot'], color: '#22c55e', href: '/huoltoraportit' },
  { title: 'Tarjoukset', lines: ['Saadut tarjoukset'], color: '#6366f1', href: '/tarjoukset' },
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
  const huolto = useCompanyHuoltoSettings(profile?.company_id, session);
  const visibleModules = useMemo(() => {
    if (portalView) return PORTAL_MODULES;
    return MODULES.filter((m) => {
      if (!m.licenseModule) return true;
      // Laskutus-moduulin kytkin (yrityksen asetus) piilottaa ruudun myös lisenssin kanssa.
      if (m.licenseModule === 'billing' && billingModuleEnabled !== true) return false;
      if (m.href === '/huoltoraportit' && (!huolto.loaded || !huolto.access.moduleEnabled)) return false;
      if (license && license.enrollment !== 'legacy') {
        return isLicenseModuleAccessible(license, m.licenseModule);
      }
      return true;
    }).map((module) => {
      if (module.title === 'Laskutus' && partnershipsEnabled !== true) {
        return { ...module, lines: ['Asiakaslaskutus'] };
      }
      if (module.href === '/huoltoraportit' && huolto.access.enabledCategories.length > 1) {
        const labels = HUOLTO_CATEGORIES.filter((c) => huolto.access.isCategoryEnabled(c.key)).map((c) => c.short);
        return { ...module, lines: [labels.join(', '), 'Laiterekisteri'] };
      }
      if (module.href === '/hallinta') {
        const isCompanyAdmin = profile?.role === 'admin' || profile?.role === 'manager';
        return {
          ...module,
          title: isCompanyAdmin ? 'Yrityksen hallinta' : 'Hallinta',
          lines: partnershipsEnabled === false ? ['Omat tiedot', 'Yritysasetukset'] : module.lines,
        };
      }
      return module;
    }).concat(profile?.is_global_admin ? [SERVICE_TILE] : []);
  }, [portalView, license, billingModuleEnabled, partnershipsEnabled, huolto.loaded, huolto.access, profile?.role, profile?.is_global_admin]);
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

  const isAdmin = profile?.role === 'admin';

  return (
    <AppLayout session={session}>
      {/* Sivupalkin käyttäjillä yritys + rooli ja Pikahaku ovat sivupalkissa. */}
      {portalView ? (
        <p className="subtitle">
          {profile?.companies?.name ?? 'Ei yritystä'} • {roleLabel}
        </p>
      ) : null}

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
          canDelete={profile?.role === 'admin'}
          onChanged={() => setOnboardingRefreshKey((value) => value + 1)}
        />
      )}

      {!portalView && pendingOrders.total > 0 && (
        <PendingWorkOrdersBanner counts={pendingOrders} />
      )}


      <HubTileGrid tiles={visibleModules} />
    </AppLayout>
  );
}
