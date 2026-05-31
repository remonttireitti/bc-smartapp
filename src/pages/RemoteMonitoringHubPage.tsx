import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { TEMP_MONITORING_BASE, VRF_MONITORING_BASE } from '../lib/remoteMonitoringRoutes';

interface Props {
  session: Session;
}

const TILES = [
  {
    title: 'Lämpötilaseuranta',
    desc: 'Mittauslaitteet, live-seuranta ja raportit',
    href: TEMP_MONITORING_BASE,
    color: '#14b8a6',
  },
  {
    title: 'VRF ohjaus ja seuranta',
    desc: 'Lämpöpumppu, lämpötilat, sulatus ja ohjaus',
    href: VRF_MONITORING_BASE,
    color: '#0d9488',
  },
];

export default function RemoteMonitoringHubPage({ session }: Props) {
  const { profile } = useProfile(session);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Etäohjaus ja seuranta
          </p>
          <h1>Etäohjaus ja seuranta</h1>
          <p className="muted">{profile?.companies?.name ?? '—'} • valitse palvelu</p>
        </div>
      </div>

      <section className="grid">
        {TILES.map((tile) => (
          <Link key={tile.title} to={tile.href} className="tile" style={{ background: tile.color }}>
            <strong>{tile.title}</strong>
            <span>{tile.desc}</span>
          </Link>
        ))}
      </section>
    </AppLayout>
  );
}
