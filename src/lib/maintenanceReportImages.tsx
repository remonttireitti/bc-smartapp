import { useEffect, useState, type MouseEvent } from 'react';
import { MaintenanceReportImageLightbox } from '../components/huoltoRaportti/MaintenanceReportImageLightbox';
import { prepareImageFileForUpload } from './prepareUploadImage';
import {
  normalizeMaintenanceReportPhotos,
  type MaintenanceReportPhotoItem,
} from './maintenanceReportPhotoUtils';
import { toSupabaseStoragePath } from './storageUrl';
import { supabase } from './supabase';

export const BUCKET = 'maintenance-report-images';
export const MAX_IMAGES = 6;
/** Tallennusraja pakattulle kuvalle. */
export const MAX_IMAGE_BYTES = 800 * 1024;

export type MaintenanceReportImageSection = 'tiiveyskoe' | 'tyhjiointi' | 'huomiot';

export type { MaintenanceReportPhotoItem };
export { normalizeMaintenanceReportPhotos };

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

function useSignedImageUrl(path: string) {
  const storagePath = toSupabaseStoragePath(path);
  const [url, setUrl] = useState<string | undefined>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!path) {
      setUrl(undefined);
      setMissing(true);
      return () => {
        cancelled = true;
      };
    }

    if (!storagePath) {
      setUrl(undefined);
      setMissing(true);
      return () => {
        cancelled = true;
      };
    }

    setMissing(false);
    void (async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setUrl(undefined);
        setMissing(true);
        return;
      }
      setUrl(data.signedUrl);
      setMissing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [path, storagePath]);

  return { url, missing };
}

function useSignedImageUrls(paths: string[]) {
  const pathsKey = paths.join('\0');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const pathList = pathsKey ? pathsKey.split('\0') : [];

    async function loadUrls() {
      const next: Record<string, string> = {};
      for (const path of pathList) {
        const storagePath = toSupabaseStoragePath(path);
        if (!storagePath) continue;
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
        if (data?.signedUrl) next[path] = data.signedUrl;
      }
      if (!cancelled) setUrls(next);
    }

    if (pathList.length > 0) void loadUrls();
    else setUrls({});

    return () => {
      cancelled = true;
    };
  }, [pathsKey]);

  return urls;
}

export function MaintenanceReportImageThumb({ path }: { path: string }) {
  const { url, missing } = useSignedImageUrl(path);
  const [previewOpen, setPreviewOpen] = useState(false);

  function openPreview(event: MouseEvent) {
    event.preventDefault();
    if (url) setPreviewOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="image-thumb huolto-evidence-thumb"
        disabled={!url}
        onClick={openPreview}
        aria-label="Avaa kuva"
      >
        {url ? (
          <img src={url} alt="" />
        ) : (
          <span className="muted">{missing ? 'Kuva puuttuu' : 'Ladataan…'}</span>
        )}
      </button>
      {previewOpen && url ? (
        <MaintenanceReportImageLightbox url={url} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </>
  );
}

function GalleryThumb({ url }: { url: string | undefined }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="image-thumb"
        disabled={!url}
        onClick={() => url && setPreviewOpen(true)}
        aria-label="Avaa kuva"
      >
        {url ? <img src={url} alt="" /> : <span className="muted">Ladataan…</span>}
      </button>
      {previewOpen && url ? (
        <MaintenanceReportImageLightbox url={url} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </>
  );
}

export function MaintenanceReportImageGallery({ paths }: { paths: string[] }) {
  const urls = useSignedImageUrls(paths);

  if (paths.length === 0) return null;

  return (
    <div className="image-gallery">
      {paths.map((path) => (
        <GalleryThumb key={path} url={urls[path]} />
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
