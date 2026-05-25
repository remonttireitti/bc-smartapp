import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';

interface Props {
  session: Session;
}

const TILES = [
  {
    title: 'Tallennetut tarjouspyynnöt',
    desc: 'Lista, haku ja muokkaus',
    href: '/tarjouspyynnot/lista',
    color: '#f97316',
  },
  {
    title: 'Uusi tarjouspyyntö',
    desc: 'Laske ja laadi tarjous',
    href: '/tarjouspyynnot/uusi',
    color: '#fb923c',
  },
  {
    title: 'Lämpöpumppujen rekisteri',
    desc: 'Hinnasto ja mallit',
    href: '/tarjouspyynnot/laiterekisteri',
    color: '#14b8a6',
  },
];

export default function QuoteRequestHubPage({ session }: Props) {
  const { profile } = useProfile(session);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Tarjouspyyntö
          </p>
          <h1>Tarjouspyyntö</h1>
          <p className="muted">{profile?.companies?.name ?? '—'} • valitse toiminto</p>
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
