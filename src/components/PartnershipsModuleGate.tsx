import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from './AppLayout';
import { useProfile } from '../hooks/useProfile';
import { useCompanyPartnershipsEnabled } from '../hooks/useCompanyPartnershipsEnabled';
import { PARTNER_BILLING_REQUIRES_PARTNERS } from '../lib/companyLicense';

/** Kumppanilaskutus: vaatii Kumppanuudet-moduulin (yrityksen kytkin + lisenssi). */
export default function PartnershipsModuleGate({ session, children }: { session: Session; children: ReactNode }) {
  const { profile } = useProfile(session);
  const enabled = useCompanyPartnershipsEnabled(profile?.company_id, session);
  if (enabled === true) return <>{children}</>;
  return (
    <AppLayout session={session}>
      {enabled === null ? (
        <p className="muted page-loading-placeholder">Tarkistetaan käyttöoikeuksia…</p>
      ) : (
        <section className="panel license-locked-panel">
          <h1>Kumppanilaskutus ei ole käytössä</h1>
          <p className="muted">{PARTNER_BILLING_REQUIRES_PARTNERS}</p>
          <p>
            <Link to="/laskutus">Laskutus</Link>
          </p>
        </section>
      )}
    </AppLayout>
  );
}
