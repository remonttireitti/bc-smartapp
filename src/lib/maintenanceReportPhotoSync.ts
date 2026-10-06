import { ensureHuomiotLiite } from './huoltoRaportti/defaults';
import type { HuoltoReportData, HuomiotImageAttachment } from './huoltoRaportti/types';
import {
  normalizeMaintenanceReportPhotos,
  type MaintenanceReportPhotoItem,
} from './maintenanceReportPhotoUtils';
import type { MaintenanceReportImageSection } from './maintenanceReportImages';
import { supabase } from './supabase';
import {
  isInlineImageUrl,
  isLegacyFirestoreStoragePath,
  isMaintenanceReportStoragePath,
  toSupabaseStoragePath,
} from './storageUrl';

export type MaintenanceReportImageRow = {
  section: MaintenanceReportImageSection;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
};

function pathKey(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function commentForPath(
  jsonItems: Array<{ storagePath?: string; id?: string; comment?: string }>,
  storagePath: string,
): string {
  const match = jsonItems.find((item) => pathKey(item.storagePath ?? item.id) === storagePath);
  return match?.comment ?? '';
}

function pathsMatchDb(
  jsonPaths: string[],
  dbRows: MaintenanceReportImageRow[],
): boolean {
  if (jsonPaths.length !== dbRows.length) return false;
  return jsonPaths.every((path, index) => path === dbRows[index]?.storage_path);
}

function jsonPathsNeedSync(paths: Array<string | undefined>): boolean {
  return paths.some((path) => {
    const key = pathKey(path);
    if (!key) return true;
    if (isInlineImageUrl(key)) return false;
    if (isLegacyFirestoreStoragePath(key)) return true;
    const storagePath = toSupabaseStoragePath(key);
    return !storagePath || !isMaintenanceReportStoragePath(storagePath);
  });
}

function mergePhotoComments(
  dbRows: MaintenanceReportImageRow[],
  jsonItems: MaintenanceReportPhotoItem[],
): MaintenanceReportPhotoItem[] {
  return dbRows.map((row) => ({
    storagePath: row.storage_path,
    comment: commentForPath(jsonItems, row.storage_path),
  }));
}

function mergeHuomiotLiitteet(
  dbRows: MaintenanceReportImageRow[],
  jsonItems: HuomiotImageAttachment[],
): HuomiotImageAttachment[] {
  return dbRows.map((row) => {
    const prev = jsonItems.find((item) => pathKey(item.storagePath ?? item.id) === row.storage_path);
    return ensureHuomiotLiite({
      ...prev,
      id: row.storage_path,
      storagePath: row.storage_path,
      url: '',
      comment: prev?.comment ?? commentForPath(jsonItems, row.storage_path),
      fileName: row.file_name,
      contentType: row.mime_type ?? prev?.contentType ?? 'image/jpeg',
    });
  });
}

function inlineHuomiotLiitteet(jsonItems: HuomiotImageAttachment[]): HuomiotImageAttachment[] {
  return jsonItems.filter((item) => isInlineImageUrl(pathKey(item.storagePath ?? item.id)));
}

function inlinePhotoItems(jsonItems: MaintenanceReportPhotoItem[]): MaintenanceReportPhotoItem[] {
  return jsonItems.filter((item) => isInlineImageUrl(pathKey(item.storagePath)));
}

const ILP_PHOTO_TAG_RE = /^ilp-([A-Za-z0-9-]+?)--/;

/** ILP-lisälaitteen kuva: tallennuspolun tiedostonimi alkaa `ilp-<laitteen id>--`. */
export function ilpPhotoTagOwner(storagePath: string | null | undefined): string | null {
  const file = pathKey(storagePath).split('/').pop() ?? '';
  return ILP_PHOTO_TAG_RE.exec(file)?.[1] ?? null;
}

/**
 * Jakaa osion DB-kuvat laitteille: JSON-viittaus ratkaisee; muuten etuliitteetön → laite 1,
 * etuliite → sen lisälaite; poistetun laitteen kuvat jätetään pois.
 */
export function partitionPhotoRowsByDevice<T extends { storage_path: string }>(
  rows: T[],
  slots: Array<{ id: string | null; json: MaintenanceReportPhotoItem[] }>,
): T[][] {
  const out: T[][] = slots.map(() => []);
  const refs = new Map<string, number>();
  slots.forEach((slot, index) => {
    for (const item of slot.json) {
      const key = pathKey(item.storagePath);
      if (key && !refs.has(key)) refs.set(key, index);
    }
  });
  for (const row of rows) {
    const key = pathKey(row.storage_path);
    const referenced = refs.get(key);
    if (referenced != null) {
      out[referenced].push(row);
      continue;
    }
    const tag = ilpPhotoTagOwner(key);
    const index = tag ? slots.findIndex((slot, i) => i > 0 && slot.id === tag) : 0;
    if (index >= 0) out[index].push(row);
  }
  return out;
}

function syncPhotoList(
  dbRows: MaintenanceReportImageRow[],
  json: MaintenanceReportPhotoItem[],
): { items: MaintenanceReportPhotoItem[]; changed: boolean } {
  if (dbRows.length === 0) return { items: json, changed: false };
  const merged = [...mergePhotoComments(dbRows, json), ...inlinePhotoItems(json)];
  const storageJsonPaths = json
    .filter((item) => !isInlineImageUrl(pathKey(item.storagePath)))
    .map((item) => pathKey(item.storagePath));
  if (jsonPathsNeedSync(storageJsonPaths) || !pathsMatchDb(storageJsonPaths, dbRows)) {
    return { items: merged, changed: true };
  }
  return { items: json, changed: false };
}

export async function loadMaintenanceReportImagesBySection(reportId: string) {
  const { data, error } = await supabase
    .from('maintenance_report_images')
    .select('section, storage_path, file_name, mime_type, created_at')
    .eq('maintenance_report_id', reportId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const bySection = new Map<MaintenanceReportImageSection, MaintenanceReportImageRow[]>();
  for (const row of (data ?? []) as MaintenanceReportImageRow[]) {
    const section = row.section as MaintenanceReportImageSection;
    const list = bySection.get(section) ?? [];
    list.push(row);
    bySection.set(section, list);
  }
  return bySection;
}

/** Korjaa JSON-polkuja maintenance_report_images -taulun Supabase-poluilla. */
export async function syncMaintenanceReportPhotosFromDb(
  reportId: string,
  data: HuoltoReportData,
): Promise<{ data: HuoltoReportData; changed: boolean }> {
  const bySection = await loadMaintenanceReportImagesBySection(reportId);
  let changed = false;
  const next: HuoltoReportData = { ...data };

  const huomiotDb = bySection.get('huomiot') ?? [];
  const huomiotJson = data.huomiotLiitteet ?? [];
  const huomiotJsonPaths = huomiotJson.map((item) => pathKey(item.storagePath ?? item.id));
  const inlineHuomiot = inlineHuomiotLiitteet(huomiotJson);
  if (huomiotDb.length > 0) {
    const merged = [...mergeHuomiotLiitteet(huomiotDb, huomiotJson), ...inlineHuomiot];
    if (
      jsonPathsNeedSync(huomiotJsonPaths)
      || !pathsMatchDb(
        huomiotJson.filter((item) => !isInlineImageUrl(pathKey(item.storagePath ?? item.id)))
          .map((item) => pathKey(item.storagePath ?? item.id)),
        huomiotDb,
      )
    ) {
      next.huomiotLiitteet = merged;
      changed = true;
    }
  }

  // Tiiveyskoe/tyhjiöinti: ILP-lisälaitteiden kuvat tunnistetaan tiedostonimen etuliitteestä (ilp-<id>--).
  const extras = next.laiteTyyppi === 'lämpöpumppu' && Array.isArray(next.ilpLisaLaitteet)
    ? (next.ilpLisaLaitteet as Array<Record<string, unknown> & { id?: string }>)
    : [];
  let nextExtras = extras;
  for (const [section, dataKey] of [['tiiveyskoe', 'tiiveyskoeData'], ['tyhjiointi', 'tyhjiointiData']] as const) {
    const slots = [
      { id: null as string | null, json: normalizeMaintenanceReportPhotos(next[dataKey]?.todisteKuvat) },
      ...nextExtras.map((extra) => ({
        id: String(extra.id ?? '').replace(/[^A-Za-z0-9-]/g, '') || null,
        json: normalizeMaintenanceReportPhotos((extra[dataKey] as { todisteKuvat?: MaintenanceReportPhotoItem[] } | undefined)?.todisteKuvat),
      })),
    ];
    const rowsBySlot = partitionPhotoRowsByDevice(bySection.get(section) ?? [], slots);
    slots.forEach((slot, index) => {
      const result = syncPhotoList(rowsBySlot[index], slot.json);
      if (!result.changed) return;
      changed = true;
      if (index === 0) {
        (next as Record<string, unknown>)[dataKey] = { ...(next[dataKey] ?? {}), todisteKuvat: result.items };
        return;
      }
      nextExtras = nextExtras.map((extra, extraIndex) =>
        extraIndex === index - 1
          ? { ...extra, [dataKey]: { ...((extra[dataKey] as object | undefined) ?? {}), todisteKuvat: result.items } }
          : extra,
      );
    });
  }
  if (nextExtras !== extras) next.ilpLisaLaitteet = nextExtras;

  return { data: next, changed };
}

export function isStaleMaintenancePhotoPath(value: string | null | undefined): boolean {
  const trimmed = pathKey(value);
  if (!trimmed) return true;
  if (isInlineImageUrl(trimmed)) return false;
  if (isLegacyFirestoreStoragePath(trimmed)) return true;
  const storagePath = toSupabaseStoragePath(trimmed);
  return !storagePath || !isMaintenanceReportStoragePath(storagePath);
}
