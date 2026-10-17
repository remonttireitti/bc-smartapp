import { isLicenseModuleAccessible, type CompanyLicenseSnapshot, type LicenseModuleKey } from './companyLicense';
import { TEMP_MONITORING_BASE, VRF_MONITORING_BASE } from './remoteMonitoringRoutes';

export type MainNavIconKey =
  | 'work'
  | 'billing'
  | 'maintenance'
  | 'customers'
  | 'quotes'
  | 'inventory'
  | 'remote'
  | 'tools'
  | 'admin';

export type MainNavChild = {
  label: string;
  href: string;
  /** Syvät sivut, joilla alakohta on aktiivinen, vaikka polku ei ala hrefillä (esim. tallennettu tarjous). */
  alsoMatch?: RegExp;
};

export type MainNavItem = {
  key: MainNavIconKey;
  label: string;
  href: string;
  /** Polkujen alut, joilla pääkohta on aktiivinen. */
  bases: string[];
  licenseModule?: LicenseModuleKey;
  children: MainNavChild[];
};

export type MainNavContext = {
  license: CompanyLicenseSnapshot | null | undefined;
  billingModuleEnabled: boolean | null | undefined;
  partnershipsEnabled: boolean | null | undefined;
  role: string | null | undefined;
  isGlobalAdmin: boolean;
  globalAdminMode: boolean;
};

/** Sama gating kuin etusivun ruuduilla ja Hallinnan välilehdillä. */
export function buildMainNav(ctx: MainNavContext): MainNavItem[] {
  const isAdmin = ctx.role === 'admin';
  const isManager = ctx.role === 'manager';
  const billingOn = ctx.billingModuleEnabled === true;
  const partnershipsOff = ctx.partnershipsEnabled === false;

  const hallinta: MainNavChild[] = [{ label: 'Omat tiedot', href: '/hallinta/omat' }];
  if (isAdmin || isManager) hallinta.push({ label: 'Yritystiedot', href: '/hallinta/yritys' });
  if (isAdmin) {
    hallinta.push({ label: 'Tilaajat', href: '/hallinta/tilaajat' });
    hallinta.push({ label: 'Käyttäjät', href: '/hallinta/kayttajat' });
    if (!partnershipsOff) hallinta.push({ label: 'Kumppanuudet', href: '/hallinta/kumppanuudet' });
    if (billingOn) hallinta.push({ label: 'Kumppanilaskutus', href: '/hallinta/kumppanilaskutus' });
  }
  if (ctx.isGlobalAdmin && ctx.globalAdminMode) {
    hallinta.push({ label: 'Globaali admin', href: '/hallinta/global-admin' });
  }

  const items: MainNavItem[] = [
    {
      key: 'work', label: 'Työraportti', href: '/tyoraportit', bases: ['/tyoraportit'], licenseModule: 'base',
      children: [
        { label: 'Työraportit', href: '/tyoraportit' },
        { label: 'Uusi työraportti', href: '/tyoraportit/uusi' },
      ],
    },
    {
      key: 'billing', label: 'Laskutus', href: '/laskutus', bases: ['/laskutus'], licenseModule: 'billing',
      children: partnershipsOff
        ? []
        : [
            { label: 'Yhteensä', href: '/laskutus?mode=total' },
            { label: 'Asiakaslaskutus', href: '/laskutus?mode=customer' },
            { label: 'Kumppanilaskutus', href: '/laskutus?mode=partner' },
          ],
    },
    {
      key: 'maintenance', label: 'Huoltoraportti', href: '/huoltoraportit', bases: ['/huoltoraportit'], licenseModule: 'base',
      children: [
        { label: 'Huoltoraportit', href: '/huoltoraportit' },
        { label: 'Uusi huoltoraportti', href: '/huoltoraportit/uusi' },
      ],
    },
    { key: 'customers', label: 'Asiakkaat', href: '/asiakkaat', bases: ['/asiakkaat'], licenseModule: 'base', children: [] },
    {
      key: 'quotes', label: 'Tarjouspyyntö', href: '/tarjouspyynnot', bases: ['/tarjouspyynnot', '/asennus-suunnittelu'], licenseModule: 'quotes',
      children: [
        {
          label: 'Tallennetut',
          href: '/tarjouspyynnot/lista',
          alsoMatch: /^\/tarjouspyynnot\/(?!uusi$|yhteenveto$|laiterekisteri$|lista$)[^/]+(\/.*)?$/,
        },
        { label: 'Yhteenveto', href: '/tarjouspyynnot/yhteenveto' },
        { label: 'Uusi tarjouspyyntö', href: '/tarjouspyynnot/uusi' },
        { label: 'Asennus suunnittelu', href: '/asennus-suunnittelu' },
        { label: 'Lämpöpumppujen rekisteri', href: '/tarjouspyynnot/laiterekisteri' },
      ],
    },
    {
      key: 'inventory', label: 'Varasto', href: '/varasto', bases: ['/varasto'], licenseModule: 'base',
      children: [
        { label: 'Kylmäaine', href: '/varasto?tab=refrigerant' },
        { label: 'Materiaalit', href: '/varasto?tab=materials' },
      ],
    },
    {
      key: 'remote', label: 'Etäohjaus ja seuranta', href: '/etaseuranta', bases: ['/etaseuranta'], licenseModule: 'remote_monitoring',
      children: [
        { label: 'Lämpötilaseuranta', href: TEMP_MONITORING_BASE },
        { label: 'VRF ohjaus ja seuranta', href: VRF_MONITORING_BASE },
      ],
    },
    {
      key: 'tools', label: 'Työkalut', href: '/tyokalut', bases: ['/tyokalut'], licenseModule: 'tools',
      children: [
        { label: 'Työkalut', href: '/tyokalut' },
        { label: 'Varauskalenteri', href: '/tyokalut/varaus' },
      ],
    },
    { key: 'admin', label: 'Hallinta', href: hallinta[1]?.href ?? '/hallinta/omat', bases: ['/hallinta'], children: hallinta },
  ];

  return items.filter((item) => {
    if (!item.licenseModule) return true;
    if (item.licenseModule === 'billing' && !billingOn) return false;
    if (ctx.license && ctx.license.enrollment !== 'legacy') {
      return isLicenseModuleAccessible(ctx.license, item.licenseModule);
    }
    return true;
  });
}

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isMainNavItemActive(item: MainNavItem, pathname: string): boolean {
  return item.bases.some((base) => pathMatches(pathname, base));
}

/** Aktiivisin alakohta: pisin osuva polku; kyselyparametrit erottavat saman polun kohdat. */
export function activeMainNavChild(item: MainNavItem, pathname: string, search: string): MainNavChild | null {
  const params = new URLSearchParams(search);
  let best: MainNavChild | null = null;
  let bestScore = -1;
  for (const child of item.children) {
    const [path, query] = child.href.split('?');
    if (!pathMatches(pathname, path)) {
      if (child.alsoMatch?.test(pathname) && bestScore < 0) {
        best = child;
        bestScore = 0;
      }
      continue;
    }
    let score = path.length * 10;
    if (query) {
      const want = new URLSearchParams(query);
      if (![...want.entries()].every(([k, v]) => params.get(k) === v)) continue;
      score += 5;
    } else if (pathname !== path) {
      score -= 1;
    }
    if (score > bestScore) {
      best = child;
      bestScore = score;
    }
  }
  return best;
}

/** Näkymät ilman sivupalkkia: tulosteet, julkiset jaot ja lukijanäkymät. */
export function routeHidesSidebar(pathname: string): boolean {
  return (
    /\/tuloste\/?$/.test(pathname)
    || pathname.startsWith('/etaseuranta/luku')
    || pathname.startsWith('/seuranta/luku/')
    || pathname.startsWith('/j/')
    || pathname.startsWith('/tyoraportti/jako/')
    || /^\/tyokalut\/varaus\/[^/]+/.test(pathname)
    || pathname.startsWith('/esikatselu/')
    || pathname === '/vaihda-salasana'
  );
}
