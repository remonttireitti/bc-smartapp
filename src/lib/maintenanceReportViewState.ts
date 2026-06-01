import type { HuoltoReportData } from './huoltoRaportti/types';

const PREFIX = 'bc-smartapp:huoltoraportti-view:';

export type MaintenanceReportEditorSnapshot = {
  reportId: string;
  form: HuoltoReportData;
  customerId: string;
  equipmentId: string;
};

export type MaintenanceReportViewState = {
  scrollY: number;
  savedAt: number;
  /** Avoinna olevat osiot (page:*, module:*, part:*). */
  openKeys?: string[];
  editor?: MaintenanceReportEditorSnapshot;
};

export function maintenanceReportViewKey(reportId: string | null, userId: string) {
  return `${userId}:${reportId ?? 'uusi'}`;
}

export function writeMaintenanceReportViewState(key: string, state: MaintenanceReportViewState) {
  try {
    sessionStorage.setItem(`${PREFIX}${key}`, JSON.stringify(state));
  } catch {
    // ignore private mode / quota
  }
}

export function readMaintenanceReportViewState(key: string): MaintenanceReportViewState | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as MaintenanceReportViewState;
  } catch {
    return null;
  }
}

/** Luonnos palautetaan vain lyhyen ajan sisällä (mobiili välilehti / kuva). */
export function readFreshMaintenanceReportEditorSnapshot(
  key: string,
  reportId: string,
  maxAgeMs = 2 * 60 * 60 * 1000,
): MaintenanceReportEditorSnapshot | null {
  const saved = readMaintenanceReportViewState(key);
  if (!saved?.editor || saved.editor.reportId !== reportId) return null;
  if (Date.now() - saved.savedAt > maxAgeMs) return null;
  return saved.editor;
}
