import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { HubTileGrid, type HubTileData } from '../components/HubTile';

interface Props {
  session: Session;
}

const TILES: HubTileData[] = [
  { title: 'Tallennetut tarjouspyynnöt', lines: ['Kaikki tarjoukset listana', 'Haku, tila ja muokkaus'], href: '/tarjouspyynnot/lista', color: '#f97316', icon: '☰' },
  { title: 'Yhteenveto', lines: ['Tarjottu vs. tilattu', 'Viikko, kuukausi, vuosi'], href: '/tarjouspyynnot/yhteenveto', color: '#ea580c', icon: '∑' },
  { title: 'Uusi tarjouspyyntö', lines: ['Laskelma ja kate', 'Tarjousdokumentti asiakkaalle'], href: '/tarjouspyynnot/uusi', color: '#fb923c', icon: '+' },
  { title: 'Asennus suunnittelu', lines: ['Taloyhtiöselosteet', 'Liitteet ja kuvat'], href: '/asennus-suunnittelu', color: '#6366f1', icon: '⌂' },
  { title: 'Lämpöpumppujen rekisteri', lines: ['Mallit ja tekniset tiedot', 'Hinnasto'], href: '/tarjouspyynnot/laiterekisteri', color: '#14b8a6', icon: '❄' },
];

export default function QuoteRequestHubPage({ session }: Props) {

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb breadcrumb-home-only">
            <Link to="/">Etusivu</Link> / Tarjouspyyntö
          </p>
          <h1>Tarjouspyyntö</h1>
        </div>
      </div>

      <HubTileGrid tiles={TILES} />
    </AppLayout>
  );
}
