import { useEffect } from 'react';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import {
  maintenanceReportViewKey,
  readMaintenanceReportViewState,
  writeMaintenanceReportViewState,
} from '../lib/maintenanceReportViewState';

/** Palauttaa vierityskohdan ja tallentaa editor-tilan (scroll, taivutus, lomake). */
export function useMaintenanceReportScrollRestore(input: {
  reportId: string | null;
  userId: string;
  ready: boolean;
  status?: string;
  form?: HuoltoReportData;
  customerId?: string;
  equipmentId?: string;
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
      const prev = readMaintenanceReportViewState(viewKey);
      const next = {
        scrollY: window.scrollY,
        savedAt: Date.now(),
        openKeys: prev?.openKeys,
        editor:
          input.reportId &&
          input.status === 'draft' &&
          input.form
            ? {
                reportId: input.reportId,
                form: input.form,
                customerId: input.customerId ?? '',
                equipmentId: input.equipmentId ?? '',
              }
            : prev?.editor,
      };
      writeMaintenanceReportViewState(viewKey, next);
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
  }, [viewKey, input.reportId, input.status, input.form, input.customerId, input.equipmentId]);
}
