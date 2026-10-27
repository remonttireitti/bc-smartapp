import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  UNSAFE_LocationContext,
  useLocation,
  useNavigationType,
  useRoutes,
  type Location,
  type RouteObject,
} from 'react-router-dom';
import {
  keepAliveRouteKey,
  pruneKeepAliveCache,
  shouldKeepAliveRoute,
} from '../lib/keepAliveRoutes';
import { KeepAliveActiveContext } from '../lib/dataRefresh';

type Props = {
  routes: RouteObject[];
  /** Clear cached screens when user/session changes. */
  resetKey?: string | null;
};

export default function KeepAliveRoutes({ routes, resetKey }: Props) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const activeElement = useRoutes(routes);
  const activeKey = keepAliveRouteKey(location.pathname, location.search, location.hash);
  const cacheable = shouldKeepAliveRoute(location.pathname);

  const cacheRef = useRef<Record<string, ReactNode>>({});
  /** Each cached screen keeps the location it was opened with, so hidden screens never see another route's params. */
  const locationRef = useRef<Record<string, Location>>({});
  const scrollRef = useRef<Record<string, number>>({});
  const previousKeyRef = useRef<string | null>(null);
  const resetRef = useRef(resetKey);

  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    cacheRef.current = {};
    locationRef.current = {};
    scrollRef.current = {};
    previousKeyRef.current = null;
  }

  if (cacheable && activeElement) {
    if (!cacheRef.current[activeKey]) {
      cacheRef.current = pruneKeepAliveCache(
        { ...cacheRef.current, [activeKey]: activeElement },
        activeKey,
      );
    }
    locationRef.current[activeKey] = location;
    for (const key of Object.keys(locationRef.current)) {
      if (!cacheRef.current[key]) delete locationRef.current[key];
    }
  }

  useLayoutEffect(() => {
    const previousKey = previousKeyRef.current;
    if (previousKey && previousKey !== activeKey) {
      scrollRef.current[previousKey] = window.scrollY;
    }

    const frameId = window.requestAnimationFrame(() => {
      const savedScroll = scrollRef.current[activeKey];
      if (typeof savedScroll === 'number') {
        window.scrollTo({ top: savedScroll, left: 0, behavior: 'auto' });
      } else if (previousKey && previousKey !== activeKey) {
        window.scrollTo(0, 0);
      }
    });

    previousKeyRef.current = activeKey;
    return () => window.cancelAnimationFrame(frameId);
  }, [activeKey]);

  const cachedEntries = Object.entries(cacheRef.current);

  return (
    <div className="keep-alive-root">
      {cachedEntries.map(([key, node]) => (
        <div key={key} className="keep-alive-panel" hidden={key !== activeKey || !cacheable}>
          <UNSAFE_LocationContext.Provider
            value={{ location: locationRef.current[key] ?? location, navigationType }}
          >
            <KeepAliveActiveContext.Provider value={key === activeKey && cacheable}>{node}</KeepAliveActiveContext.Provider>
          </UNSAFE_LocationContext.Provider>
        </div>
      ))}
      {!cacheable && activeElement}
    </div>
  );
}
