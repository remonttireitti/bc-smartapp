import type { HubTileData } from '../components/HubTile';

export type HallintaContext = {
  role: string | null | undefined;
  isGlobalAdmin: boolean;
  billingModuleEnabled: boolean | null | undefined;
  partnershipsEnabled: boolean | null | undefined;
};

/** Hallinnan kaksi puolta: oma yritys (/hallinta) ja koko palvelu (/palvelu, vain GBA). */
export type ManagementScope = 'company' | 'service';

export const COMPANY_ADMIN_BASE = '/hallinta';
export const SERVICE_ADMIN_BASE = '/palvelu';
export const COMPANY_ADMIN_TITLE = 'Yrityksen hallinta';
export const SERVICE_ADMIN_TITLE = 'Palvelun hallinta';

export type HallintaGroup = { key: 'oma' | 'yritys'; title: string; tiles: HubTileData[] };

export const GBA_SECTIONS = [
  { id: 'rekisteri', title: 'Rekisterikorjaukset', lines: ['Omistajuus', 'Duplikaatit', 'Massamuokkaus'], color: '#f97316' },
  { id: 'loki', title: 'Loki ja varmuuskopiot', lines: ['Käyttäjätoiminta', 'Vedokset ja palautus'], color: '#64748b' },
] as const;

export type GbaSectionId = (typeof GBA_SECTIONS)[number]['id'];

export function isGbaSectionId(v: unknown): v is GbaSectionId {
  return GBA_SECTIONS.some((s) => s.id === v);
}

export function managementScope(pathname: string): ManagementScope {
  return pathname === SERVICE_ADMIN_BASE || pathname.startsWith(`${SERVICE_ADMIN_BASE}/`) ? 'service' : 'company';
}

/** Yrityksen hallinnan etusivun ruudut (sama gating kuin sivuvalikossa). */
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
  }
  if (isAdmin || ctx.isGlobalAdmin) {
    company.push({ title: 'Tilaajaportaali', lines: ['Moniasiakastilaajat ja heidän portaalitunnuksensa'], href: '/hallinta/tilaajat', color: '#f59e0b' });
    company.push({ title: 'Asiakasportaali', lines: ['Asiakkaiden portaalitunnukset ja esikatselu'], href: '/hallinta/asiakasportaali', color: '#8b5cf6' });
  }
  if (isAdmin) {
    if (ctx.partnershipsEnabled !== false) {
      company.push({ title: 'Kumppanuudet', lines: ['Kumppaniyritykset', 'Hinnat ja oikeudet'], href: '/hallinta/kumppanuudet', color: '#6366f1' });
    }
    if (ctx.billingModuleEnabled === true && ctx.partnershipsEnabled === true) {
      company.push({ title: 'Kumppanilaskutus', lines: ['Laskutettavat työt', 'Yhteenveto'], href: '/hallinta/kumppanilaskutus', color: '#ec4899' });
    }
  }
  if (company.length) groups.push({ key: 'yritys', title: 'Yritys', tiles: company });
  return groups;
}

/** Palvelun hallinnan (globaali admin) ruudut. */
export function buildServiceTiles(ctx: Pick<HallintaContext, 'isGlobalAdmin'>): HubTileData[] {
  if (!ctx.isGlobalAdmin) return [];
  return [
    { title: 'Yritykset', lines: ['Kaikki yritykset', 'Moduulit ja huoltolajit', 'Käyttäjät'], href: '/palvelu/yritykset', color: '#ef4444' },
    { title: 'Tilaukset', lines: ['Uudet tilaukset', 'Hyväksyntä ja kutsut', 'Esimerkkitiedot'], href: '/palvelu/tilaukset', color: '#0ea5e9' },
    { title: 'Hinnasto', lines: ['Tilaushinnat €/kk', 'Moduulit, huolto, käyttäjät'], href: '/palvelu/hinnasto', color: '#8b5cf6' },
    ...GBA_SECTIONS.map((s) => ({ title: s.title, lines: [...s.lines], href: `/palvelu/${s.id}`, color: s.color })),
  ];
}

/** Sivuvalikon Yrityksen hallinta -alakohdat. */
export function hallintaNavChildren(ctx: HallintaContext): { label: string; href: string }[] {
  return buildHallintaGroups(ctx)
    .flatMap((g) => g.tiles)
    .map((t) => ({ label: t.title, href: t.href }));
}

/** Sivuvalikon Palvelun hallinta -alakohdat. */
export function serviceNavChildren(ctx: Pick<HallintaContext, 'isGlobalAdmin'>): { label: string; href: string }[] {
  return buildServiceTiles(ctx).map((t) => ({ label: t.title, href: t.href }));
}

/** Murupolun / otsikon nimi hallinnan alasivulle (null = etusivu). */
export function hallintaPageTitle(pathname: string): string | null {
  const map: Record<string, string> = {
    '/palvelu/yritykset': 'Yritykset',
    '/palvelu/tilaukset': 'Tilaukset',
    '/palvelu/hinnasto': 'Hinnasto',
    ...Object.fromEntries(GBA_SECTIONS.map((s) => [`/palvelu/${s.id}`, s.title])),
    '/hallinta/omat': 'Omat tiedot',
    '/hallinta/yritys': 'Oma yritys',
    '/hallinta/kayttajat': 'Käyttäjät',
    '/hallinta/tilaajat': 'Tilaajaportaali',
    '/hallinta/asiakasportaali': 'Asiakasportaali',
    '/hallinta/kumppanuudet': 'Kumppanuudet',
    '/hallinta/kumppanilaskutus': 'Kumppanilaskutus',
  };
  const hit = Object.keys(map).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? map[hit] : null;
}

/** Vanhat globaalin adminin osoitteet (/hallinta/yritykset, /hallinta/global-admin…) → /palvelu. null = ei vanha osoite. */
export function legacyServicePath(pathname: string, search = ''): string | null {
  const params = new URLSearchParams(search);
  const rest = (from: string) => pathname.slice(from.length);
  if (pathname === '/global-admin' || pathname === '/hallinta/global-admin' || pathname === '/hallinta/global-admin/') {
    const osio = params.get('osio');
    params.delete('osio');
    const q = params.toString() ? `?${params}` : '';
    if (osio === 'companies' || osio === 'yritykset' || osio === 'licenses') return `/palvelu/yritykset${q}`;
    if (osio === 'hinnoittelu' || osio === 'hinnasto') return `/palvelu/hinnasto${q}`;
    if (osio === 'tilaukset') return `/palvelu/tilaukset${q}`;
    if (isGbaSectionId(osio)) return `/palvelu/${osio}${q}`;
    return `/palvelu${q}`;
  }
  if (pathname.startsWith('/hallinta/global-admin/')) return `/palvelu${rest('/hallinta/global-admin')}${search}`;
  if (pathname === '/hallinta/yritykset' || pathname.startsWith('/hallinta/yritykset/')) {
    return `/palvelu/yritykset${rest('/hallinta/yritykset')}${search}`;
  }
  return null;
}
