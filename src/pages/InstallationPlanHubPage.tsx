import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { HubTileGrid, type HubTileData } from '../components/HubTile';

interface Props {
  session: Session;
}

const TILES: HubTileData[] = [
  { title: 'Tallennetut suunnitelmat', lines: ['Kaikki suunnitelmat listana', 'Haku ja muokkaus'], href: '/asennus-suunnittelu/lista', color: '#6366f1', icon: '☰' },
  { title: 'Uusi asennus suunnittelu', lines: ['Taloyhtiöseloste pohjalla', 'Liitteet mukaan'], href: '/asennus-suunnittelu/uusi', color: '#818cf8', icon: '+' },
];

export default function InstallationPlanHubPage({ session }: Props) {

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyynnöt ja laskennat</Link> / Asennus suunnittelu
          </p>
          <h1>Asennus suunnittelu</h1>
        </div>
      </div>

      <HubTileGrid tiles={TILES} />
    </AppLayout>
  );
}
