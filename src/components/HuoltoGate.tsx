import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from './AppLayout';
import { useCompanyHuoltoSettings } from '../hooks/useCompanyHuoltoSettings';
import { useProfile } from '../hooks/useProfile';
import { huoltoCategoryLabel, type HuoltoCategoryKey } from '../lib/huoltoCategories';
import { isPortalView } from '../lib/portalPreview';

type Props = {
  session: Session;
  /** Uuden raportin luonti tietylle lajille. */
  category?: HuoltoCategoryKey;
  children: ReactNode;
};

/** Huoltoraportit näkyvät vain, kun yrityksellä on vähintään yksi laji päällä (tilaajaportaali ohittaa). */
export default function HuoltoGate({ session, category, children }: Props) {
  const { profile } = useProfile(session);
  const huolto = useCompanyHuoltoSettings(profile?.company_id, session);
  if (!profile || isPortalView(profile)) return <>{children}</>;
  if (!huolto.loaded) {
    return (
      <AppLayout session={session}>
        <p className="muted page-loading-placeholder">Ladataan…</p>
      </AppLayout>
    );
  }
  const allowed = category ? huolto.access.isCategoryEnabled(category) : huolto.access.moduleEnabled;
  if (allowed) return <>{children}</>;
  const canEdit = profile.role === 'admin' || profile.role === 'manager';
  return (
    <AppLayout session={session}>
      <section className="panel license-locked-panel">
        <h1>{category ? `${huoltoCategoryLabel(category)} ei ole käytössä` : 'Huoltoraportit eivät ole käytössä'}</h1>
        <p>
          <Link to="/">Etusivu</Link>
          {canEdit ? (
            <>
              {' · '}
              <Link to="/hallinta/yritys?osio=moduulit">Ota käyttöön: Yrityksen hallinta → Oma yritys → Moduulit</Link>
            </>
          ) : null}
        </p>
      </section>
    </AppLayout>
  );
}
