/** Kuva + vapaatekstinen kommentti (tallennetaan raportin dataan). */
export type MaintenanceReportPhotoItem = {
  storagePath: string;
  comment: string;
};

/** Vanha tallennusmuoto (polkujono) → kommenttikentälliset rivit. */
export function normalizeMaintenanceReportPhotos(raw: unknown): MaintenanceReportPhotoItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MaintenanceReportPhotoItem[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ storagePath: item.trim(), comment: '' });
      continue;
    }
    if (item && typeof item === 'object') {
      const path = String(
        (item as { storagePath?: string; path?: string; id?: string }).storagePath ??
          (item as { path?: string }).path ??
          (item as { id?: string }).id ??
          '',
      ).trim();
      if (!path) continue;
      const comment = String((item as { comment?: string }).comment ?? '').trim();
      out.push({ storagePath: path, comment });
    }
  }
  return out;
}
