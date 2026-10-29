import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from './AppLayout';
import { useCompanyLicense } from '../hooks/useCompanyLicense';
import { useProfile } from '../hooks/useProfile';
import { isPortalView } from '../lib/portalPreview';
import {
  isLicenseModuleAccessible,
  LICENSE_MODULE_DESCRIPTIONS,
  LICENSE_MODULE_LABELS,
  type LicenseModuleKey,
} from '../lib/companyLicense';

type Props = {
  session: Session;
  moduleKey: LicenseModuleKey;
  children: ReactNode;
};

export default function LicenseModuleGate({ session, moduleKey, children }: Props) {
  const { profile, loading: profileLoading } = useProfile(session);
  // Asiakas- ja tilaajaportaalin käyttäjät eivät tarvitse pakettia: portti koskee vain yrityksen omaa henkilökuntaa.
  const portalUser = isPortalView(profile);
  const isGlobalAdmin = !!profile?.is_global_admin;
  const { license, loading, recordAccess } = useCompanyLicense(
    profile?.company_id,
    session,
    isGlobalAdmin,
  );

  useEffect(() => {
    if (portalUser || loading || isGlobalAdmin || !license) return;
    if (!isLicenseModuleAccessible(license, moduleKey)) return;
    void recordAccess(moduleKey);
  }, [portalUser, loading, isGlobalAdmin, license, moduleKey, recordAccess]);

  if (portalUser) return <>{children}</>;

  if (!profile && profileLoading) {
    return (
      <AppLayout session={session}>
        <p className="muted page-loading-placeholder">Tarkistetaan käyttöoikeuksia…</p>
      </AppLayout>
    );
  }

  if (loading && !license && !isGlobalAdmin) {
    return (
      <AppLayout session={session}>
        <p className="muted page-loading-placeholder">Tarkistetaan käyttöoikeuksia…</p>
      </AppLayout>
    );
  }

  if (isGlobalAdmin || isLicenseModuleAccessible(license, moduleKey)) {
    return <>{children}</>;
  }

  const status = license?.effective_status ?? 'expired';

  return (
    <AppLayout session={session}>
      <section className="panel license-locked-panel">
        <h1>{LICENSE_MODULE_LABELS[moduleKey]} ei ole käytössä</h1>
        <p className="muted">{LICENSE_MODULE_DESCRIPTIONS[moduleKey]}</p>
        {status === 'expired' ? (
          <p>
            Ilmainen kokeilujakso on päättynyt. Ota yhteyttä BC Smartappiin tilauksen aktivoimiseksi tai valitse
            tarvitsemasi moduulit.
          </p>
        ) : (
          <p>Moduuli ei kuulu yrityksesi tilaukseen. Ota yhteyttä ylläpitoon moduulin avaamiseksi.</p>
        )}
        <p>
          <Link to="/">Palaa etusivulle</Link>
          {' · '}
          <Link to="/hallinta/yritys">Hallinta</Link>
        </p>
      </section>
    </AppLayout>
  );
}
