import { useEffect, useState } from 'react';
import { prepareImageFileForUpload } from './prepareUploadImage';
import { supabase } from './supabase';

export const BUCKET = 'maintenance-report-images';
export const MAX_IMAGES = 6;
/** Tallennusraja pakattulle kuvalle. */
export const MAX_IMAGE_BYTES = 800 * 1024;

export type MaintenanceReportImageSection = 'tiiveyskoe' | 'tyhjiointi' | 'huomiot';

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

export function photoStoragePaths(items: MaintenanceReportPhotoItem[]): string[] {
  return items.map((i) => i.storagePath).filter(Boolean);
}

export type MaintenanceReportImage = {
  id: string;
  maintenance_report_id: string;
  section: MaintenanceReportImageSection;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
};

export async function uploadMaintenanceReportImages(
  reportId: string,
  section: MaintenanceReportImageSection,
  files: File[],
  userId: string,
  existingCount = 0,
): Promise<string[]> {
  const uploaded: string[] = [];
  const remaining = MAX_IMAGES - existingCount;
  const batch = files.slice(0, Math.max(0, remaining));

  for (const file of batch) {
    const prepared = await prepareImageFileForUpload(file, MAX_IMAGE_BYTES);
    const safeName = prepared.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${reportId}/${section}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, prepared, { contentType: prepared.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { error: metaError } = await supabase.from('maintenance_report_images').insert({
      maintenance_report_id: reportId,
      section,
      storage_path: storagePath,
      file_name: prepared.name,
      mime_type: prepared.type,
      uploaded_by: userId,
    });

    if (metaError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw new Error(metaError.message);
    }
    uploaded.push(storagePath);
  }
  return uploaded;
}

export async function deleteMaintenanceReportImage(storagePath: string) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  await supabase.from('maintenance_report_images').delete().eq('storage_path', storagePath);
}

function useSignedImageUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadUrls() {
      const next: Record<string, string> = {};
      for (const path of paths) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (data?.signedUrl) next[path] = data.signedUrl;
      }
      if (!cancelled) setUrls(next);
    }

    if (paths.length > 0) void loadUrls();
    else setUrls({});

    return () => {
      cancelled = true;
    };
  }, [paths]);

  return urls;
}

export function MaintenanceReportImageThumb({ path }: { path: string }) {
  const urls = useSignedImageUrls([path]);
  const url = urls[path];

  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noreferrer"
      className="image-thumb huolto-evidence-thumb"
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
    >
      {url ? <img src={url} alt="" /> : <span className="muted">Ladataan…</span>}
    </a>
  );
}

export function MaintenanceReportImageGallery({ paths }: { paths: string[] }) {
  const urls = useSignedImageUrls(paths);

  if (paths.length === 0) return null;

  return (
    <div className="image-gallery">
      {paths.map((path) => (
        <a
          key={path}
          href={urls[path] ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="image-thumb"
          onClick={(e) => {
            if (!urls[path]) e.preventDefault();
          }}
        >
          {urls[path] ? (
            <img src={urls[path]} alt="" />
          ) : (
            <span className="muted">Ladataan…</span>
          )}
        </a>
      ))}
    </div>
  );
}

interface AddImagesProps {
  reportId: string;
  section: MaintenanceReportImageSection;
  userId: string;
  items: MaintenanceReportPhotoItem[];
  onChange: (items: MaintenanceReportPhotoItem[]) => void;
}

export function AddMaintenanceReportImages({
  reportId,
  section,
  userId,
  items,
  onChange,
}: AddImagesProps) {
  const [busy, setBusy] = useState(false);

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (items.length >= MAX_IMAGES) {
      alert(`Enintään ${MAX_IMAGES} kuvaa.`);
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadMaintenanceReportImages(
        reportId,
        section,
        Array.from(files),
        userId,
        items.length,
      );
      onChange([
        ...items,
        ...uploaded.map((storagePath) => ({ storagePath, comment: '' })),
      ]);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Kuvien lataus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="btn btn-secondary image-upload-btn">
      {busy ? 'Ladataan…' : '+ Lisää kuvia'}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        multiple
        hidden
        disabled={busy || items.length >= MAX_IMAGES}
        onChange={(e) => void onFilesSelected(e.target.files)}
      />
    </label>
  );
}
