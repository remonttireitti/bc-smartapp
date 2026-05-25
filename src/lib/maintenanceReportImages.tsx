import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const BUCKET = 'maintenance-report-images';
export const MAX_IMAGES = 6;
const MAX_BYTES = 800 * 1024;

export type MaintenanceReportImageSection = 'tiiveyskoe' | 'tyhjiointi' | 'huomiot';

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
    if (file.size > MAX_BYTES) {
      throw new Error(`Kuva ${file.name} ylittää 800 kt rajan.`);
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${reportId}/${section}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { error: metaError } = await supabase.from('maintenance_report_images').insert({
      maintenance_report_id: reportId,
      section,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
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

export function MaintenanceReportImageGallery({ paths }: { paths: string[] }) {
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
          title={path.split('/').pop() ?? path}
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
  paths: string[];
  onChange: (paths: string[]) => void;
}

export function AddMaintenanceReportImages({
  reportId,
  section,
  userId,
  paths,
  onChange,
}: AddImagesProps) {
  const [busy, setBusy] = useState(false);

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (paths.length >= MAX_IMAGES) {
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
        paths.length,
      );
      onChange([...paths, ...uploaded]);
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
        disabled={busy || paths.length >= MAX_IMAGES}
        onChange={(e) => void onFilesSelected(e.target.files)}
      />
    </label>
  );
}
