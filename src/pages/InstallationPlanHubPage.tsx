import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';

interface Props {
  session: Session;
}

const TILES = [
  {
    title: 'Tallennetut suunnitelmat',
    desc: 'Lista, haku ja muokkaus',
    href: '/asennus-suunnittelu/lista',
    color: '#6366f1',
  },
  {
    title: 'Uusi asennus suunnittelu',
    desc: 'Taloyhtiöseloste pohjalla',
    href: '/asennus-suunnittelu/uusi',
    color: '#818cf8',
  },
];

export default function InstallationPlanHubPage({ session }: Props) {
  const { profile } = useProfile(session);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyyntö</Link> / Asennus suunnittelu
          </p>
          <h1>Asennus suunnittelu</h1>
          <p className="muted">{profile?.companies?.name ?? '—'} • taloyhtiöselosteet ja liitteet</p>
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
