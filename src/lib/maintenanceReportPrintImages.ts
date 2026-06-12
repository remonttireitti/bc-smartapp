import type { MaintenanceReportPhotoItem } from './maintenanceReportImages';
import { normalizeMaintenanceReportPhotos } from './maintenanceReportImages';
import type { HuoltoReportData, HuomiotImageAttachment } from './huoltoRaportti/types';
import {
  isAllowedExternalStorageUrl,
  isLegacyFirebaseStorageUrl,
  toSupabaseStoragePath,
} from './storageUrl';

export type MaintenancePrintPhoto = {
  href: string;
  comment: string;
};

function isDirectImageUrl(value: string): boolean {
  if (isLegacyFirebaseStorageUrl(value)) return false;
  return value.startsWith('data:image/') || isAllowedExternalStorageUrl(value);
}

export function photoStoragePathFromAttachment(
  item: HuomiotImageAttachment | MaintenanceReportPhotoItem,
): string {
  const attachment = item as HuomiotImageAttachment;
  return String(item.storagePath ?? attachment.id ?? '').trim();
}

/** Resolvoi tulosteen img-src storage-polusta tai suorasta URL:sta. */
export function resolveMaintenancePrintPhotoHref(
  item: MaintenanceReportPhotoItem | string | HuomiotImageAttachment,
  imageUrls?: Record<string, string>,
): string {
  if (typeof item === 'string') {
    const s = item.trim();
    if (!s) return '';
    const path = toSupabaseStoragePath(s);
    if (path && imageUrls?.[path]) return imageUrls[path];
    if (isDirectImageUrl(s)) return s;
    return imageUrls?.[s] ?? '';
  }

  const path = toSupabaseStoragePath(photoStoragePathFromAttachment(item as HuomiotImageAttachment));
  if (path && imageUrls?.[path]) return imageUrls[path];

  const attachmentUrl = String((item as HuomiotImageAttachment).url ?? '').trim();
  if (attachmentUrl && isDirectImageUrl(attachmentUrl)) return attachmentUrl;
  if (attachmentUrl && imageUrls?.[attachmentUrl]) return imageUrls[attachmentUrl];
  return '';
}

export function isMaintenancePrintPhotoImage(
  item: { contentType?: string; storagePath?: string; id?: string; href?: string; url?: string },
): boolean {
  const contentType = String(item.contentType ?? '').trim().toLowerCase();
  if (contentType.startsWith('image/')) return true;
  if (contentType.startsWith('application/')) return false;

  const url = String(item.href ?? item.url ?? '').trim();
  if (url.startsWith('data:image/')) return true;
  if (isAllowedExternalStorageUrl(url)) return true;

  return Boolean(toSupabaseStoragePath(photoStoragePathFromAttachment(item as HuomiotImageAttachment)));
}

export function collectMaintenancePrintImagePaths(data: HuoltoReportData): string[] {
  const paths = new Set<string>();

  for (const item of normalizeMaintenanceReportPhotos(data.tiiveyskoeData?.todisteKuvat)) {
    const path = toSupabaseStoragePath(item.storagePath);
    if (path) paths.add(path);
  }
  for (const item of normalizeMaintenanceReportPhotos(data.tyhjiointiData?.todisteKuvat)) {
    const path = toSupabaseStoragePath(item.storagePath);
    if (path) paths.add(path);
  }
  for (const item of data.huomiotLiitteet ?? []) {
    const storagePath = toSupabaseStoragePath(photoStoragePathFromAttachment(item));
    const url = toSupabaseStoragePath(String(item.url ?? '').trim());
    if (storagePath) paths.add(storagePath);
    else if (url) paths.add(url);
  }

  return [...paths].filter((p) => p && !isDirectImageUrl(p));
}

export function mapMaintenancePrintPhotos(
  items: MaintenanceReportPhotoItem[] | undefined,
  imageUrls?: Record<string, string>,
): MaintenancePrintPhoto[] {
  return normalizeMaintenanceReportPhotos(items).map((item) => ({
    href: resolveMaintenancePrintPhotoHref(item, imageUrls),
    comment: item.comment,
  }));
}

export function mapHuomiotLiitteetForPrint(
  items: HuomiotImageAttachment[] | undefined,
  imageUrls?: Record<string, string>,
): HuomiotImageAttachment[] {
  return (items ?? []).map((item) => {
    const href = resolveMaintenancePrintPhotoHref(item, imageUrls);
    return {
      ...item,
      url: href || item.url,
      contentType: item.contentType ?? 'image/jpeg',
    };
  });
}
