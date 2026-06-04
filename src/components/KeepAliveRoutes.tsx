import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useRoutes, type RouteObject } from 'react-router-dom';
import {
  keepAliveRouteKey,
  pruneKeepAliveCache,
  shouldKeepAliveRoute,
} from '../lib/keepAliveRoutes';

type Props = {
  routes: RouteObject[];
  /** Clear cached screens when user/session changes. */
  resetKey?: string | null;
};

export default function KeepAliveRoutes({ routes, resetKey }: Props) {
  const location = useLocation();
  const activeElement = useRoutes(routes);
  const activeKey = keepAliveRouteKey(location.pathname, location.search, location.hash);
  const cacheable = shouldKeepAliveRoute(location.pathname);

  const cacheRef = useRef<Record<string, ReactNode>>({});
  const scrollRef = useRef<Record<string, number>>({});
  const previousKeyRef = useRef<string | null>(null);
  const resetRef = useRef(resetKey);

  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    cacheRef.current = {};
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
  }

  useLayoutEffect(() => {
    const previousKey = previousKeyRef.current;
    if (previousKey && previousKey !== activeKey) {
      scrollRef.current[previousKey] = window.scrollY;
    }

    const savedScroll = scrollRef.current[activeKey];
    if (typeof savedScroll === 'number') {
      window.scrollTo({ top: savedScroll, left: 0, behavior: 'auto' });
    } else if (previousKey && previousKey !== activeKey) {
      window.scrollTo(0, 0);
    }

    previousKeyRef.current = activeKey;
  }, [activeKey]);

  const cachedEntries = Object.entries(cacheRef.current);

  return (
    <div className="keep-alive-root">
      {cachedEntries.map(([key, node]) => (
        <div key={key} className="keep-alive-panel" hidden={key !== activeKey || !cacheable}>
          {node}
        </div>
      ))}
      {!cacheable && activeElement}
    </div>
  );
}
