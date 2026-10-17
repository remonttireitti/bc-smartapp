import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { HubTileGrid, type HubTileData } from '../components/HubTile';
import { useCompanyHuoltoSettings } from '../hooks/useCompanyHuoltoSettings';
import { useProfile } from '../hooks/useProfile';
import { HUOLTO_CATEGORIES, newHuoltoReportHrefForCategory } from '../lib/huoltoCategories';

interface Props {
  session: Session;
}

/** Uuden huoltoraportin lajin valinta (vain käytössä olevat lajit). */
export default function MaintenanceNewReportHubPage({ session }: Props) {
  const { profile } = useProfile(session);
  const huolto = useCompanyHuoltoSettings(profile?.company_id, session);
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  const enabled = HUOLTO_CATEGORIES.filter((c) => huolto.access.isCategoryEnabled(c.key));

  if (huolto.loaded && enabled.length === 1) {
    return <Navigate to={newHuoltoReportHrefForCategory(enabled[0].key, query)} replace />;
  }

  const tiles: HubTileData[] = enabled.map((c) => ({
    title: c.label,
    lines: c.lines,
    href: newHuoltoReportHrefForCategory(c.key, query),
    color: c.color,
  }));

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb breadcrumb-home-only">
            <Link to="/">Etusivu</Link> / <Link to="/huoltoraportit">Huoltoraportit</Link> / Uusi
          </p>
          <h1>Uusi huoltoraportti</h1>
        </div>
      </div>
      <HubTileGrid tiles={tiles} />
    </AppLayout>
  );
}
