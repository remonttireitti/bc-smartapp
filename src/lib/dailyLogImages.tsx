import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { MaintenanceReportImageLightbox } from '../components/huoltoRaportti/MaintenanceReportImageLightbox';
import { prepareImageFileForUpload } from './prepareUploadImage';
import { toSupabaseStoragePath } from './storageUrl';
import { supabase } from './supabase';
import type { DailyLogImage } from '../types';

export const BUCKET = 'work-report-images';

/** Varoitus kun kuvia on paljon — ei estä tallennusta. */
export const DAILY_LOG_IMAGE_SOFT_WARN = 20;

/** Pakkaus ennen tallennusta (kamera/tabletti). */
export const DAILY_LOG_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const DAILY_LOG_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';

export function dailyLogImageCountWarning(totalCount: number): string | null {
  if (totalCount <= DAILY_LOG_IMAGE_SOFT_WARN) return null;
  return `Kirjauksessa on jo ${totalCount} kuvaa. Suuri määrä kuvia voi hidastaa latausta ja tulostetta.`;
}

export async function resolveDailyLogImageUrls(
  images: DailyLogImage[],
  expiresIn = 86400,
): Promise<Array<{ fileName: string; url: string }>> {
  const result: Array<{ fileName: string; url: string }> = [];

  for (const image of images) {
    const path = toSupabaseStoragePath(image.storage_path);
    if (!path) continue;
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresIn);
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
    const prepared = await prepareImageFileForUpload(file, DAILY_LOG_MAX_IMAGE_BYTES);
    const safeName = prepared.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${reportId}/${dailyLogId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, prepared, { contentType: prepared.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { error: metaError } = await supabase.from('work_report_daily_log_images').insert({
      daily_log_id: dailyLogId,
      storage_path: storagePath,
      file_name: prepared.name,
      mime_type: prepared.type,
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

function DailyLogImageThumb({ url, label }: { url: string | undefined; label: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  function openPreview(event: MouseEvent) {
    event.preventDefault();
    if (url) setPreviewOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="image-thumb"
        disabled={!url}
        onClick={openPreview}
        title={label}
        aria-label={`Avaa kuva: ${label}`}
      >
        {url ? <img src={url} alt={label} /> : <span className="muted">Ladataan…</span>}
      </button>
      {previewOpen && url ? (
        <MaintenanceReportImageLightbox url={url} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </>
  );
}

export function DailyLogImageGallery({ images }: { images: DailyLogImage[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadUrls() {
      const next: Record<string, string> = {};
      for (const image of images) {
        const path = toSupabaseStoragePath(image.storage_path);
        if (!path) continue;
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, 3600);
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
        <DailyLogImageThumb
          key={image.id}
          url={urls[image.id]}
          label={image.file_name}
        />
      ))}
    </div>
  );
}

function PendingDailyLogImageThumb({
  file,
  previewUrl,
  onRemove,
}: {
  file: File;
  previewUrl: string;
  onRemove: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="image-thumb pending">
      <button
        type="button"
        className="image-thumb-preview-btn"
        onClick={() => setPreviewOpen(true)}
        aria-label={`Avaa kuva: ${file.name}`}
      >
        <img src={previewUrl} alt={file.name} />
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
        Poista
      </button>
      {previewOpen ? (
        <MaintenanceReportImageLightbox url={previewUrl} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </div>
  );
}

interface DailyLogImageSectionProps {
  reportId: string;
  dailyLogId: string | null;
  userId: string;
  savedImages: DailyLogImage[];
  pendingImages: File[];
  onPendingImagesChange: (files: File[]) => void;
  onSavedImagesChange: () => void;
  disabled?: boolean;
  onNotice?: (message: string) => void;
  onUploadFailed?: (message: string) => void;
  onUploadSuccess?: (count: number) => void;
}

export function DailyLogImageSection({
  reportId,
  dailyLogId,
  userId,
  savedImages,
  pendingImages,
  onPendingImagesChange,
  onSavedImagesChange,
  disabled = false,
  onNotice,
  onUploadFailed,
  onUploadSuccess,
}: DailyLogImageSectionProps) {
  const [busy, setBusy] = useState(false);

  const previewUrls = useMemo(
    () => pendingImages.map((file) => URL.createObjectURL(file)),
    [pendingImages],
  );

  useEffect(
    () => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)),
    [previewUrls],
  );

  const totalAfterPick = (extra: number) =>
    savedImages.length + pendingImages.length + extra;

  const countWarning = dailyLogImageCountWarning(
    savedImages.length + pendingImages.length,
  );

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0 || disabled) return;
    const selected = Array.from(files);

    const warn = dailyLogImageCountWarning(totalAfterPick(selected.length));
    if (warn) {
      if (onNotice) onNotice(warn);
      else window.alert(warn);
    }

    if (dailyLogId) {
      setBusy(true);
      try {
        await uploadDailyLogImages(reportId, dailyLogId, selected, userId);
        onSavedImagesChange();
        onUploadSuccess?.(selected.length);
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Kuvien lataus epäonnistui';
        if (onUploadFailed) onUploadFailed(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    onPendingImagesChange([...pendingImages, ...selected]);
  }

  return (
    <div className="image-section">
      <div className="section-head">
        <h3>Kuvat</h3>
        <label className="btn btn-secondary image-upload-btn">
          {busy ? 'Ladataan…' : '+ Lisää kuvia'}
          <input
            type="file"
            accept={DAILY_LOG_IMAGE_ACCEPT}
            multiple
            hidden
            disabled={busy || disabled}
            onChange={(e) => {
              void onFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="muted">
        {dailyLogId
          ? 'Kuvat tallentuvat heti valinnan jälkeen. Voit lisätä useita kerralla.'
          : 'Kuvat tallentuvat työkirjauksen tallennuksen yhteydessä. Voit lisätä useita kerralla.'}
      </p>
      {countWarning && !onNotice && <p className="warning-text">{countWarning}</p>}
      {savedImages.length > 0 && <DailyLogImageGallery images={savedImages} />}
      {pendingImages.length > 0 && (
        <div className="image-gallery">
          {pendingImages.map((file, index) => (
            <PendingDailyLogImageThumb
              key={`${file.name}-${file.lastModified}-${index}`}
              file={file}
              previewUrl={previewUrls[index]}
              onRemove={() =>
                onPendingImagesChange(pendingImages.filter((_, i) => i !== index))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
