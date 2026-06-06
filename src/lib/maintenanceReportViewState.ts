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
  /** Viimeisin onnistunut DB-tallennus (ms). Editor-snapshot ohittaa DB:n vain jos savedAt on uudempi. */
  dbSyncedAt?: number;
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

/** Onko sessionStorage-editorissa tallentamattomia muutoksia verrattuna viimeiseen DB-tallennukseen. */
export function maintenanceReportEditorAheadOfDb(key: string): boolean {
  const saved = readMaintenanceReportViewState(key);
  if (!saved?.editor) return false;
  const syncedAt = saved.dbSyncedAt ?? 0;
  return saved.savedAt > syncedAt;
}

/** Session-editor ilman DB-ahead-tarkistusta (palautus taustalta / bfcache). */
export function readMaintenanceReportEditorSnapshot(
  key: string,
  reportId: string,
  maxAgeMs = 2 * 60 * 60 * 1000,
): MaintenanceReportEditorSnapshot | null {
  const saved = readMaintenanceReportViewState(key);
  if (!saved?.editor || saved.editor.reportId !== reportId) return null;
  if (Date.now() - saved.savedAt > maxAgeMs) return null;
  return saved.editor;
}

/** Luonnos palautetaan vain lyhyen ajan sisällä (mobiili välilehti / kuva). */
export function readFreshMaintenanceReportEditorSnapshot(
  key: string,
  reportId: string,
  maxAgeMs = 2 * 60 * 60 * 1000,
): MaintenanceReportEditorSnapshot | null {
  const snap = readMaintenanceReportEditorSnapshot(key, reportId, maxAgeMs);
  if (!snap || !maintenanceReportEditorAheadOfDb(key)) return null;
  return snap;
}

/** Tallenna editor-snapshot säilyttäen dbSyncedAt (openKeys-päivitykset eivät saa nollata editoria). */
export function persistMaintenanceReportEditorSnapshot(
  key: string,
  editor: MaintenanceReportEditorSnapshot,
  scrollY = typeof window !== 'undefined' ? window.scrollY : 0,
) {
  const prev = readMaintenanceReportViewState(key);
  writeMaintenanceReportViewState(key, {
    scrollY,
    savedAt: Date.now(),
    dbSyncedAt: prev?.dbSyncedAt,
    openKeys: prev?.openKeys,
    editor,
  });
}

/** Päivitä vain avoinna olevat osiot — älä koske editoriin, savedAt:aan tai dbSyncedAt:iin. */
export function persistMaintenanceReportOpenKeys(key: string, openKeys: string[]) {
  const prev = readMaintenanceReportViewState(key);
  if (!prev) {
    writeMaintenanceReportViewState(key, {
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      savedAt: Date.now(),
      openKeys,
    });
    return;
  }
  writeMaintenanceReportViewState(key, { ...prev, openKeys });
}

/** Päivitä session-editor vastaamaan juuri tallennettua dataa (estää vanhan luonnoksen palautumisen). */
export function syncMaintenanceReportEditorAfterSave(
  key: string,
  editor: MaintenanceReportEditorSnapshot,
) {
  const prev = readMaintenanceReportViewState(key);
  const now = Date.now();
  writeMaintenanceReportViewState(key, {
    scrollY: prev?.scrollY ?? 0,
    savedAt: now,
    dbSyncedAt: now,
    openKeys: prev?.openKeys,
    editor,
  });
}
