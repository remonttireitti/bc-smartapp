/** Max number of visited screens kept mounted (LRU eviction). */
export const KEEP_ALIVE_MAX_ROUTES = 16;

const NEVER_CACHE_PREFIXES = [
  '/login',
  '/unohdin-salasana',
  '/aseta-uusi-salasana',
  '/seuranta/luku',
] as const;

export function keepAliveRouteKey(pathname: string, search = '', hash = '') {
  return `${pathname}${search}${hash}`;
}

export function shouldKeepAliveRoute(pathname: string): boolean {
  if (!pathname || pathname === '/') return true;
  if (NEVER_CACHE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  if (pathname.includes('/tuloste')) return false;
  return true;
}

export function pruneKeepAliveCache<T>(cache: Record<string, T>, activeKey: string, max = KEEP_ALIVE_MAX_ROUTES) {
  const keys = Object.keys(cache);
  if (keys.length <= max) return cache;

  const drop = keys.filter((key) => key !== activeKey).slice(0, keys.length - max);
  if (drop.length === 0) return cache;

  const next = { ...cache };
  for (const key of drop) delete next[key];
  return next;
}
