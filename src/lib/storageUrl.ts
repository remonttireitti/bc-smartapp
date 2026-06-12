/** Legacy Firestore/Firebase Storage links — no longer served (Spark plan). */
export function isLegacyFirebaseStorageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return (
    v.includes('firebasestorage.googleapis.com')
    || v.includes('storage.googleapis.com/v0/b/')
    || v.startsWith('gs://')
  );
}

/** Vanha Firestore-tallennuspolku (ei Supabase-buckettia). */
export function isLegacyFirestoreStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value.includes('huolto_raportti_liitteet/')
    || value.startsWith('companies/main/')
  );
}

export function isHttpUrl(value: string | null | undefined): boolean {
  return !!value && /^https?:\/\//i.test(value);
}

/** Suora img-src (data:, blob:) — ei Supabase-polku. */
export function isInlineImageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith('data:image/') || value.startsWith('blob:');
}

/** Huoltoraportin bucket-polku: reportId/section/tiedosto */
export function isMaintenanceReportStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f-]{36}\/(tiiveyskoe|tyhjiointi|huomiot)\/.+/i.test(value);
}

/** Supabase bucket path (not a full URL). */
export function isSupabaseStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  if (isHttpUrl(value) || value.startsWith('data:') || value.startsWith('blob:')) return false;
  return true;
}

export function isAllowedExternalStorageUrl(value: string | null | undefined): boolean {
  if (!value || !isHttpUrl(value)) return false;
  if (isLegacyFirebaseStorageUrl(value)) return false;
  return value.includes('.supabase.co/storage/v1/object/');
}

/** Normalize DB value to a Supabase storage path, or null if legacy/external URL. */
export function toSupabaseStoragePath(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (isLegacyFirebaseStorageUrl(trimmed)) return null;
  if (isLegacyFirestoreStoragePath(trimmed)) return null;
  if (isInlineImageUrl(trimmed)) return null;
  if (isAllowedExternalStorageUrl(trimmed)) {
    const match = trimmed.match(/\/storage\/v1\/object\/(?:sign|public)\/[^/]+\/(.+?)(?:\?|$)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
  if (isHttpUrl(trimmed)) return null;
  return trimmed;
}
