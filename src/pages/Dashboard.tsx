import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import QuickSearch from '../components/QuickSearch';
import { useProfile } from '../hooks/useProfile';
import { ROLE_LABELS } from '../lib/management';
import { getPortalPreviewLabel, isPortalPreviewActive, isPortalView } from '../lib/portalPreview';

const MODULES = [
  { title: 'Työraportti', desc: 'Työtilaukset ja raportit', color: '#0ea5e9', href: '/tyoraportit' },
  { title: 'Laskutus', desc: 'Kumppani- ja asiakaslaskutus', color: '#6366f1', href: '/laskutus' },
  { title: 'Huoltoraportti', desc: 'Huoltopöytäkirjat ja laiterekisteri', color: '#22c55e', href: '/huoltoraportit' },
  { title: 'Asiakkaat', desc: 'Asiakkaat, laitteet, dokumentit', color: '#3b82f6', href: '/asiakkaat' },
  { title: 'Tarjouspyyntö', desc: 'Tarjoukset, laskelmat ja tulosteet', color: '#f97316', href: '/tarjouspyynnot' },
  { title: 'Varasto', desc: 'Materiaalit ja kylmäaine', color: '#a855f7', href: '/varasto' },
  { title: 'Työkalut', desc: 'Työkaluinventaario', color: '#ec4899', href: '/tyokalut' },
  { title: 'Hallinta', desc: 'Omat tiedot, yritys ja kumppanuudet', color: '#8b5cf6', href: '/hallinta/omat' },
];

interface Props {
  session: Session;
}

const PORTAL_MODULES = [
  { title: 'Työtilaus', desc: 'Lähetä työtilaus palveluyritykselle', color: '#0ea5e9', href: '/tyoraportit/tilaus/uusi' },
  { title: 'Työraportit', desc: 'Omat tilaukset ja valmiit raportit', color: '#0284c7', href: '/tyoraportit' },
  { title: 'Huoltoraportit', desc: 'Toimitetut huoltopöytäkirjat', color: '#22c55e', href: '/huoltoraportit' },
  { title: 'Kohteet', desc: 'Asiakaskohteet ja laitteet', color: '#3b82f6', href: '/asiakkaat' },
];

export default function Dashboard({ session }: Props) {
  const { profile } = useProfile(session);
  const portalView = isPortalView(profile);
  const visibleModules = useMemo(() => (portalView ? PORTAL_MODULES : MODULES), [portalView]);

  const roleLabel = isPortalPreviewActive()
    ? `Esikatselu: ${getPortalPreviewLabel() ?? 'portaali'}`
    : (ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? '—');

  return (
    <AppLayout session={session}>
      <p className="subtitle">
        {profile?.companies?.name ?? 'Ei yritystä'} • {roleLabel}
      </p>

      {!portalView && (
        <section className="search-box">
          <h2>Pikahaku</h2>
          <p className="muted">Asiakkaat, laitteet ja raportit — kirjoita vähintään 2 merkkiä</p>
          <QuickSearch />
        </section>
      )}

      <section className="grid">
        {visibleModules.map((m) => (
          <Link key={m.title} to={m.href} className="tile" style={{ background: m.color }}>
            <strong>{m.title}</strong>
            <span>{m.desc}</span>
          </Link>
        ))}
      </section>
    </AppLayout>
  );
}
