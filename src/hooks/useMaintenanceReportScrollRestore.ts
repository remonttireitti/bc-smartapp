import { useEffect } from 'react';
import {
  maintenanceReportViewKey,
  readMaintenanceReportViewState,
  writeMaintenanceReportViewState,
} from '../lib/maintenanceReportViewState';

/** Palauttaa vierityskohdan kun käyttäjä palaa raporttisivulle (toinen sivu / välilehti). */
export function useMaintenanceReportScrollRestore(input: {
  reportId: string | null;
  userId: string;
  ready: boolean;
}) {
  const viewKey = maintenanceReportViewKey(input.reportId, input.userId);

  useEffect(() => {
    if (!input.ready) return;

    const saved = readMaintenanceReportViewState(viewKey);
    if (!saved?.scrollY) return;

    const restore = () => {
      window.scrollTo({ top: saved.scrollY, left: 0, behavior: 'instant' });
    };

    requestAnimationFrame(restore);
    const timer = window.setTimeout(restore, 0);
    return () => window.clearTimeout(timer);
  }, [input.ready, viewKey]);

  useEffect(() => {
    const persist = () => {
      writeMaintenanceReportViewState(viewKey, {
        scrollY: window.scrollY,
        savedAt: Date.now(),
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persist();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const saved = readMaintenanceReportViewState(viewKey);
      if (saved?.scrollY) {
        window.scrollTo({ top: saved.scrollY, left: 0, behavior: 'instant' });
      }
    };

    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      persist();
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [viewKey]);
}
