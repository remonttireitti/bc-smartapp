import type { MaintenanceReportPhotoItem } from './maintenanceReportImages';
import { normalizeMaintenanceReportPhotos } from './maintenanceReportImages';
import type { HuoltoReportData, HuomiotImageAttachment } from './huoltoRaportti/types';

export type MaintenancePrintPhoto = {
  href: string;
  comment: string;
};

function isDirectImageUrl(value: string): boolean {
  return value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://');
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
    if (isDirectImageUrl(s)) return s;
    return imageUrls?.[s] ?? '';
  }

  const attachmentUrl = String((item as HuomiotImageAttachment).url ?? '').trim();
  if (isDirectImageUrl(attachmentUrl)) return attachmentUrl;

  const path = photoStoragePathFromAttachment(item as HuomiotImageAttachment);
  if (path && imageUrls?.[path]) return imageUrls[path];
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
  if (/^https?:\/\//i.test(url)) return true;

  return Boolean(photoStoragePathFromAttachment(item as HuomiotImageAttachment));
}

export function collectMaintenancePrintImagePaths(data: HuoltoReportData): string[] {
  const paths = new Set<string>();

  for (const item of normalizeMaintenanceReportPhotos(data.tiiveyskoeData?.todisteKuvat)) {
    if (item.storagePath) paths.add(item.storagePath);
  }
  for (const item of normalizeMaintenanceReportPhotos(data.tyhjiointiData?.todisteKuvat)) {
    if (item.storagePath) paths.add(item.storagePath);
  }
  for (const item of data.huomiotLiitteet ?? []) {
    const storagePath = photoStoragePathFromAttachment(item);
    const url = String(item.url ?? '').trim();
    if (storagePath) paths.add(storagePath);
    else if (url && !isDirectImageUrl(url)) paths.add(url);
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
