const PREFIX = 'bc-smartapp:huoltoraportti-view:';

export type MaintenanceReportViewState = {
  scrollY: number;
  savedAt: number;
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
