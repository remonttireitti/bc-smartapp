import { ensureHuomiotLiite } from './huoltoRaportti/defaults';
import type { HuoltoReportData, HuomiotImageAttachment } from './huoltoRaportti/types';
import {
  normalizeMaintenanceReportPhotos,
  type MaintenanceReportPhotoItem,
} from './maintenanceReportPhotoUtils';
import type { MaintenanceReportImageSection } from './maintenanceReportImages';
import { supabase } from './supabase';
import { isLegacyFirestoreStoragePath, toSupabaseStoragePath } from './storageUrl';

export type MaintenanceReportImageRow = {
  section: MaintenanceReportImageSection;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
};

function pathResolvable(value: string | null | undefined): boolean {
  return !!toSupabaseStoragePath(value);
}

function jsonPathsNeedSync(paths: Array<string | undefined>): boolean {
  if (paths.length === 0) return false;
  return paths.some((path) => !pathResolvable(path));
}

function mergePhotoComments(
  dbRows: MaintenanceReportImageRow[],
  jsonItems: MaintenanceReportPhotoItem[],
): MaintenanceReportPhotoItem[] {
  return dbRows.map((row, index) => ({
    storagePath: row.storage_path,
    comment: jsonItems[index]?.comment?.trim() ?? '',
  }));
}

function mergeHuomiotLiitteet(
  dbRows: MaintenanceReportImageRow[],
  jsonItems: HuomiotImageAttachment[],
): HuomiotImageAttachment[] {
  return dbRows.map((row, index) => {
    const prev = jsonItems[index];
    return ensureHuomiotLiite({
      ...prev,
      id: row.storage_path,
      storagePath: row.storage_path,
      url: '',
      comment: prev?.comment ?? '',
      fileName: row.file_name,
      contentType: row.mime_type ?? prev?.contentType ?? 'image/jpeg',
    });
  });
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
  const huomiotJsonPaths = huomiotJson.map((item) => item.storagePath ?? item.id);
  if (
    huomiotDb.length > 0
    && (jsonPathsNeedSync(huomiotJsonPaths) || huomiotJson.length !== huomiotDb.length)
  ) {
    next.huomiotLiitteet = mergeHuomiotLiitteet(huomiotDb, huomiotJson);
    changed = true;
  }

  const tiiveysJson = normalizeMaintenanceReportPhotos(data.tiiveyskoeData?.todisteKuvat);
  const tiiveysDb = bySection.get('tiiveyskoe') ?? [];
  if (
    tiiveysDb.length > 0
    && (jsonPathsNeedSync(tiiveysJson.map((item) => item.storagePath)) || tiiveysJson.length !== tiiveysDb.length)
  ) {
    next.tiiveyskoeData = {
      ...(data.tiiveyskoeData ?? {}),
      todisteKuvat: mergePhotoComments(tiiveysDb, tiiveysJson),
    };
    changed = true;
  }

  const tyhjJson = normalizeMaintenanceReportPhotos(data.tyhjiointiData?.todisteKuvat);
  const tyhjDb = bySection.get('tyhjiointi') ?? [];
  if (
    tyhjDb.length > 0
    && (jsonPathsNeedSync(tyhjJson.map((item) => item.storagePath)) || tyhjJson.length !== tyhjDb.length)
  ) {
    next.tyhjiointiData = {
      ...(data.tyhjiointiData ?? {}),
      todisteKuvat: mergePhotoComments(tyhjDb, tyhjJson),
    };
    changed = true;
  }

  return { data: next, changed };
}

export function isStaleMaintenancePhotoPath(value: string | null | undefined): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return true;
  if (isLegacyFirestoreStoragePath(trimmed)) return true;
  return !pathResolvable(trimmed);
}
