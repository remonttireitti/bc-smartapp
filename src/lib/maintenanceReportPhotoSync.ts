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
  return match?.comment?.trim() ?? '';
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

  const tiiveysJson = normalizeMaintenanceReportPhotos(data.tiiveyskoeData?.todisteKuvat);
  const tiiveysDb = bySection.get('tiiveyskoe') ?? [];
  const inlineTiiveys = inlinePhotoItems(tiiveysJson);
  if (tiiveysDb.length > 0) {
    const merged = [...mergePhotoComments(tiiveysDb, tiiveysJson), ...inlineTiiveys];
    const storageJsonPaths = tiiveysJson
      .filter((item) => !isInlineImageUrl(pathKey(item.storagePath)))
      .map((item) => pathKey(item.storagePath));
    if (
      jsonPathsNeedSync(storageJsonPaths)
      || !pathsMatchDb(storageJsonPaths, tiiveysDb)
    ) {
      next.tiiveyskoeData = {
        ...(data.tiiveyskoeData ?? {}),
        todisteKuvat: merged,
      };
      changed = true;
    }
  }

  const tyhjJson = normalizeMaintenanceReportPhotos(data.tyhjiointiData?.todisteKuvat);
  const tyhjDb = bySection.get('tyhjiointi') ?? [];
  const inlineTyhj = inlinePhotoItems(tyhjJson);
  if (tyhjDb.length > 0) {
    const merged = [...mergePhotoComments(tyhjDb, tyhjJson), ...inlineTyhj];
    const storageJsonPaths = tyhjJson
      .filter((item) => !isInlineImageUrl(pathKey(item.storagePath)))
      .map((item) => pathKey(item.storagePath));
    if (
      jsonPathsNeedSync(storageJsonPaths)
      || !pathsMatchDb(storageJsonPaths, tyhjDb)
    ) {
      next.tyhjiointiData = {
        ...(data.tyhjiointiData ?? {}),
        todisteKuvat: merged,
      };
      changed = true;
    }
  }

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
