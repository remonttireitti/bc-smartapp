import { BUCKET } from './maintenanceReportImages';
import {
  isAllowedExternalStorageUrl,
  isInlineImageUrl,
  isMaintenanceReportStoragePath,
  toSupabaseStoragePath,
} from './storageUrl';
import { supabase } from './supabase';

const blobUrlCache = new Map<string, string>();

/** Näytä juuri ladattu kuva heti ennen signed URL -pyyntöä. */
export function primeMaintenanceReportImageBlob(storagePath: string, blob: Blob) {
  const prev = blobUrlCache.get(storagePath);
  if (prev) URL.revokeObjectURL(prev);
  blobUrlCache.set(storagePath, URL.createObjectURL(blob));
}

function cachedBlobUrl(storagePath: string): string | undefined {
  return blobUrlCache.get(storagePath);
}

export function revokeMaintenanceReportImageBlob(storagePath: string) {
  const prev = blobUrlCache.get(storagePath);
  if (prev) {
    URL.revokeObjectURL(prev);
    blobUrlCache.delete(storagePath);
  }
}

async function signedUrlFromStorage(storagePath: string, expiresIn: number, width?: number): Promise<string | null> {
  if (width) {
    // Pienennetty versio (Supabase image transform); epäonnistuessa alkuperäinen.
    const t = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn, { transform: { width, resize: 'contain' } });
    if (!t.error && t.data?.signedUrl) return t.data.signedUrl;
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (!error && data?.signedUrl) return data.signedUrl;
  return null;
}

async function blobUrlFromStorage(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  const url = URL.createObjectURL(data);
  blobUrlCache.set(storagePath, url);
  return url;
}

/** Resolvoi huoltoraportin kuvan esikatselu-/tulostus-URL. */
export async function resolveMaintenanceReportImageUrl(
  rawPath: string,
  expiresIn = 3600,
  width?: number,
): Promise<string | null> {
  const trimmed = String(rawPath ?? '').trim();
  if (!trimmed) return null;

  if (isInlineImageUrl(trimmed)) return trimmed;
  if (isAllowedExternalStorageUrl(trimmed)) return trimmed;

  const storagePath = toSupabaseStoragePath(trimmed);
  if (!storagePath || !isMaintenanceReportStoragePath(storagePath)) return null;

  const cached = cachedBlobUrl(storagePath);
  if (cached) return cached;

  const signed = await signedUrlFromStorage(storagePath, expiresIn, width);
  if (signed) return signed;

  return blobUrlFromStorage(storagePath);
}

export async function resolveMaintenanceReportImageUrls(
  rawPaths: string[],
  expiresIn = 3600,
  width?: number,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  await Promise.all(
    rawPaths.map(async (rawPath) => {
      const url = await resolveMaintenanceReportImageUrl(rawPath, expiresIn, width);
      if (url) map[rawPath] = url;
    }),
  );
  return map;
}
