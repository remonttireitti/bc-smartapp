import type { HubTileData } from '../components/HubTile';

export type HallintaContext = {
  role: string | null | undefined;
  isGlobalAdmin: boolean;
  globalAdminMode: boolean;
  billingModuleEnabled: boolean | null | undefined;
  partnershipsEnabled: boolean | null | undefined;
};

export type HallintaGroup = { key: 'oma' | 'yritys' | 'gba'; title: string; tiles: HubTileData[] };

export const GBA_SECTIONS = [
  { id: 'hinnoittelu', title: 'Hinnoittelu', lines: ['Kokeilujakso', 'Moduulien ja laitteiden hinnat'], color: '#8b5cf6' },
  { id: 'rekisteri', title: 'Rekisterikorjaukset', lines: ['Omistajuus', 'Duplikaatit', 'Massamuokkaus'], color: '#f97316' },
  { id: 'loki', title: 'Loki ja varmuuskopiot', lines: ['Käyttäjätoiminta', 'Vedokset ja palautus'], color: '#64748b' },
] as const;

export type GbaSectionId = (typeof GBA_SECTIONS)[number]['id'];

export function isGbaSectionId(v: unknown): v is GbaSectionId {
  return GBA_SECTIONS.some((s) => s.id === v);
}

/** Hallinnan etusivun ruudut (sama gating kuin sivuvalikossa). */
export function buildHallintaGroups(ctx: HallintaContext): HallintaGroup[] {
  const isAdmin = ctx.role === 'admin';
  const isManager = ctx.role === 'manager';
  const groups: HallintaGroup[] = [
    {
      key: 'oma',
      title: 'Oma käyttäjä',
      tiles: [{ title: 'Omat tiedot', lines: ['Nimi ja yhteystiedot', 'Salasana'], href: '/hallinta/omat', color: '#0ea5e9' }],
    },
  ];
  const company: HubTileData[] = [];
  if (isAdmin || isManager) {
    company.push({ title: 'Oma yritys', lines: ['Perustiedot', 'Moduulit ja huoltolajit', 'Hinnat'], href: '/hallinta/yritys', color: '#22c55e' });
  }
  if (isAdmin) {
    company.push({ title: 'Käyttäjät', lines: ['Asentajat ja ylläpitäjät', 'Kutsut ja roolit'], href: '/hallinta/kayttajat', color: '#14b8a6' });
    company.push({ title: 'Tilaajat', lines: ['Moniasiakas-tilaajat', 'Tilaajaportaali'], href: '/hallinta/tilaajat', color: '#f59e0b' });
    if (ctx.partnershipsEnabled !== false) {
      company.push({ title: 'Kumppanuudet', lines: ['Kumppaniyritykset', 'Hinnat ja oikeudet'], href: '/hallinta/kumppanuudet', color: '#6366f1' });
    }
    if (ctx.billingModuleEnabled === true) {
      company.push({ title: 'Kumppanilaskutus', lines: ['Laskutettavat työt', 'Yhteenveto'], href: '/hallinta/kumppanilaskutus', color: '#ec4899' });
    }
  }
  if (company.length) groups.push({ key: 'yritys', title: 'Yritys', tiles: company });
  if (ctx.isGlobalAdmin && ctx.globalAdminMode) {
    groups.push({
      key: 'gba',
      title: 'Globaali admin',
      tiles: [
        { title: 'Yritykset', lines: ['Kaikki yritykset', 'Moduulit ja huoltolajit', 'Käyttäjät'], href: '/hallinta/yritykset', color: '#ef4444' },
        ...GBA_SECTIONS.map((s) => ({ title: s.title, lines: [...s.lines], href: `/hallinta/global-admin?osio=${s.id}`, color: s.color })),
      ],
    });
  }
  return groups;
}

/** Sivuvalikon Hallinta-alakohdat. */
export function hallintaNavChildren(ctx: HallintaContext): { label: string; href: string }[] {
  // GBA:n muut osiot löytyvät Hallinnan etusivulta; valikossa vain Yritykset.
  return buildHallintaGroups(ctx)
    .flatMap((g) => g.tiles)
    .filter((t) => !t.href.startsWith('/hallinta/global-admin'))
    .map((t) => ({ label: t.title, href: t.href }));
}

/** Murupolun / otsikon nimi Hallinnan alasivulle. */
export function hallintaPageTitle(pathname: string, search = ''): string | null {
  if (pathname.startsWith('/hallinta/yritykset')) return 'Yritykset';
  if (pathname.startsWith('/hallinta/global-admin')) {
    const osio = new URLSearchParams(search).get('osio');
    return GBA_SECTIONS.find((s) => s.id === osio)?.title ?? 'Globaali admin';
  }
  const map: Record<string, string> = {
    '/hallinta/omat': 'Omat tiedot',
    '/hallinta/yritys': 'Oma yritys',
    '/hallinta/kayttajat': 'Käyttäjät',
    '/hallinta/tilaajat': 'Tilaajat',
    '/hallinta/kumppanuudet': 'Kumppanuudet',
    '/hallinta/kumppanilaskutus': 'Kumppanilaskutus',
  };
  const hit = Object.keys(map).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? map[hit] : null;
}
