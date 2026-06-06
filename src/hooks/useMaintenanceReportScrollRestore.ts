import { useEffect, useRef, type RefObject } from 'react';
import type { HuoltoReportData } from '../lib/huoltoRaportti/types';
import type { MaintenanceReportEditorSnapshot } from '../lib/maintenanceReportViewState';
import {
  maintenanceReportViewKey,
  persistMaintenanceReportEditorSnapshot,
  readMaintenanceReportViewState,
} from '../lib/maintenanceReportViewState';

type FormStateRef = {
  form: HuoltoReportData;
  customerId: string;
  equipmentId: string;
};

/** Palauttaa vierityskohdan ja tallentaa editor-tilan (scroll, lomake). */
export function useMaintenanceReportScrollRestore(input: {
  reportId: string | null;
  userId: string;
  ready: boolean;
  status?: string;
  formStateRef: RefObject<FormStateRef>;
}) {
  const viewKey = maintenanceReportViewKey(input.reportId, input.userId);
  const statusRef = useRef(input.status);
  const reportIdRef = useRef(input.reportId);
  statusRef.current = input.status;
  reportIdRef.current = input.reportId;

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
    const persistEditor = () => {
      const reportId = reportIdRef.current;
      const state = input.formStateRef.current;
      if (!reportId || statusRef.current !== 'draft' || !state?.form) return;
      const editor: MaintenanceReportEditorSnapshot = {
        reportId,
        form: state.form,
        customerId: state.customerId,
        equipmentId: state.equipmentId,
      };
      persistMaintenanceReportEditorSnapshot(viewKey, editor);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistEditor();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const saved = readMaintenanceReportViewState(viewKey);
      if (saved?.scrollY) {
        window.scrollTo({ top: saved.scrollY, left: 0, behavior: 'instant' });
      }
    };

    window.addEventListener('pagehide', persistEditor);
    document.addEventListener('visibilitychange', onVisibilityChange, true);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      persistEditor();
      window.removeEventListener('pagehide', persistEditor);
      document.removeEventListener('visibilitychange', onVisibilityChange, true);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [viewKey, input.formStateRef]);
}
