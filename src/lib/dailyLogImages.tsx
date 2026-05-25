import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { DailyLogImage } from '../types';

export const BUCKET = 'work-report-images';

export async function resolveDailyLogImageUrls(
  images: DailyLogImage[],
  expiresIn = 86400,
): Promise<Array<{ fileName: string; url: string }>> {
  const result: Array<{ fileName: string; url: string }> = [];

  for (const image of images) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(image.storage_path, expiresIn);
    if (data?.signedUrl) {
      result.push({ fileName: image.file_name, url: data.signedUrl });
    }
  }

  return result;
}

export async function resolveDailyLogImagesByLogId(
  logs: Array<{ id: string; images?: DailyLogImage[] }>,
  expiresIn = 86400,
): Promise<Record<string, Array<{ fileName: string; url: string }>>> {
  const entries = await Promise.all(
    logs.map(async (log) => [
      log.id,
      await resolveDailyLogImageUrls(log.images ?? [], expiresIn),
    ] as const),
  );

  return Object.fromEntries(entries);
}

export async function uploadDailyLogImages(
  reportId: string,
  dailyLogId: string,
  files: File[],
  userId: string,
) {
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${reportId}/${dailyLogId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { error: metaError } = await supabase.from('work_report_daily_log_images').insert({
      daily_log_id: dailyLogId,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      uploaded_by: userId,
    });

    if (metaError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw new Error(metaError.message);
    }
  }
}

export async function deleteDailyLogImage(image: DailyLogImage) {
  await supabase.storage.from(BUCKET).remove([image.storage_path]);
  await supabase.from('work_report_daily_log_images').delete().eq('id', image.id);
}

export function DailyLogImageGallery({ images }: { images: DailyLogImage[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadUrls() {
      const next: Record<string, string> = {};
      for (const image of images) {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(image.storage_path, 3600);
        if (data?.signedUrl) next[image.id] = data.signedUrl;
      }
      if (!cancelled) setUrls(next);
    }

    if (images.length > 0) void loadUrls();
    else setUrls({});

    return () => {
      cancelled = true;
    };
  }, [images]);

  if (images.length === 0) return null;

  return (
    <div className="image-gallery">
      {images.map((image) => (
        <a
          key={image.id}
          href={urls[image.id] ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="image-thumb"
          title={image.file_name}
        >
          {urls[image.id] ? (
            <img src={urls[image.id]} alt={image.file_name} />
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
  dailyLogId: string;
  userId: string;
  onUploaded: () => void;
}

export function AddDailyLogImages({ reportId, dailyLogId, userId, onUploaded }: AddImagesProps) {
  const [busy, setBusy] = useState(false);

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await uploadDailyLogImages(reportId, dailyLogId, Array.from(files), userId);
      onUploaded();
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
        disabled={busy}
        onChange={(e) => void onFilesSelected(e.target.files)}
      />
    </label>
  );
}
