import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { MaintenanceReportImageLightbox } from '../components/huoltoRaportti/MaintenanceReportImageLightbox';
import { prepareImageFileForUpload } from './prepareUploadImage';
import { toSupabaseStoragePath } from './storageUrl';
import { supabase } from './supabase';
import type { DailyLogImage, PendingDailyLogImage } from '../types';

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
): Promise<Array<{ fileName: string; url: string; caption: string }>> {
  const result: Array<{ fileName: string; url: string; caption: string }> = [];

  for (const image of images) {
    const path = toSupabaseStoragePath(image.storage_path);
    if (!path) continue;
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresIn);
    if (data?.signedUrl) {
      result.push({
        fileName: image.file_name,
        url: data.signedUrl,
        caption: image.caption?.trim() ?? '',
      });
    }
  }

  return result;
}

export async function resolveDailyLogImagesByLogId(
  logs: Array<{ id: string; images?: DailyLogImage[] }>,
  expiresIn = 86400,
): Promise<Record<string, Array<{ fileName: string; url: string; caption: string }>>> {
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
  files: Array<PendingDailyLogImage | File>,
  userId: string,
) {
  for (const entry of files) {
    const file = entry instanceof File ? entry : entry.file;
    const caption = entry instanceof File ? '' : entry.caption.trim();
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
      caption,
      uploaded_by: userId,
    });

    if (metaError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw new Error(metaError.message);
    }
  }
}

export async function updateDailyLogImageCaption(imageId: string, caption: string) {
  const { error } = await supabase
    .from('work_report_daily_log_images')
    .update({ caption: caption.trim() })
    .eq('id', imageId);
  if (error) throw new Error(error.message);
}

export async function deleteDailyLogImage(image: DailyLogImage) {
  await supabase.storage.from(BUCKET).remove([image.storage_path]);
  await supabase.from('work_report_daily_log_images').delete().eq('id', image.id);
}

function DailyLogImageThumb({
  url,
  label,
  caption,
}: {
  url: string | undefined;
  label: string;
  caption?: string;
}) {
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
        title={caption?.trim() || label}
        aria-label={`Avaa kuva: ${caption?.trim() || label}`}
      >
        {url ? <img src={url} alt={caption?.trim() || label} /> : <span className="muted">Ladataan…</span>}
      </button>
      {caption?.trim() ? <p className="daily-log-image-caption">{caption.trim()}</p> : null}
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
        <div key={image.id} className="daily-log-image-card">
          <DailyLogImageThumb
            url={urls[image.id]}
            label={image.file_name}
            caption={image.caption ?? ''}
          />
        </div>
      ))}
    </div>
  );
}

function PendingDailyLogImageThumb({
  item,
  previewUrl,
  onCaptionChange,
  onRemove,
}: {
  item: PendingDailyLogImage;
  previewUrl: string;
  onCaptionChange: (caption: string) => void;
  onRemove: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <li className="daily-log-image-edit-row">
      <div className="image-thumb pending">
        <button
          type="button"
          className="image-thumb-preview-btn"
          onClick={() => setPreviewOpen(true)}
          aria-label={`Avaa kuva: ${item.file.name}`}
        >
          <img src={previewUrl} alt={item.file.name} />
        </button>
      </div>
      <label className="daily-log-image-comment">
        Kommentti
        <input
          type="text"
          value={item.caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Kuvaile kuvaa…"
        />
      </label>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
        Poista
      </button>
      {previewOpen ? (
        <MaintenanceReportImageLightbox url={previewUrl} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </li>
  );
}

function SavedDailyLogImageRow({
  image,
  url,
  disabled,
  onCaptionSaved,
  onDeleted,
  onError,
}: {
  image: DailyLogImage;
  url?: string;
  disabled?: boolean;
  onCaptionSaved: () => void;
  onDeleted: () => void;
  onError?: (message: string) => void;
}) {
  const [caption, setCaption] = useState(image.caption ?? '');
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setCaption(image.caption ?? '');
  }, [image.caption, image.id]);

  async function saveCaption() {
    const next = caption.trim();
    if (next === (image.caption ?? '').trim()) return;
    setBusy(true);
    try {
      await updateDailyLogImageCaption(image.id, next);
      onCaptionSaved();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Kommentin tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    if (!window.confirm('Poistetaanko kuva?')) return;
    setBusy(true);
    try {
      await deleteDailyLogImage(image);
      onDeleted();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Kuvan poisto epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="daily-log-image-edit-row">
      <button
        type="button"
        className="image-thumb"
        disabled={!url || busy}
        onClick={() => url && setPreviewOpen(true)}
        aria-label={`Avaa kuva: ${image.file_name}`}
      >
        {url ? <img src={url} alt={image.file_name} /> : <span className="muted">Ladataan…</span>}
      </button>
      <label className="daily-log-image-comment">
        Kommentti
        <input
          type="text"
          value={caption}
          disabled={disabled || busy}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => void saveCaption()}
          placeholder="Kuvaile kuvaa…"
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled || busy}
        onClick={() => void removeImage()}
      >
        Poista
      </button>
      {previewOpen && url ? (
        <MaintenanceReportImageLightbox url={url} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </li>
  );
}

interface DailyLogImageSectionProps {
  reportId: string;
  dailyLogId: string | null;
  userId: string;
  savedImages: DailyLogImage[];
  pendingImages: PendingDailyLogImage[];
  onPendingImagesChange: (files: PendingDailyLogImage[]) => void;
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
  const [savedUrls, setSavedUrls] = useState<Record<string, string>>({});

  const previewUrls = useMemo(
    () => pendingImages.map((item) => URL.createObjectURL(item.file)),
    [pendingImages],
  );

  useEffect(
    () => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)),
    [previewUrls],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadUrls() {
      const next: Record<string, string> = {};
      for (const image of savedImages) {
        const path = toSupabaseStoragePath(image.storage_path);
        if (!path) continue;
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) next[image.id] = data.signedUrl;
      }
      if (!cancelled) setSavedUrls(next);
    }

    if (savedImages.length > 0) void loadUrls();
    else setSavedUrls({});

    return () => {
      cancelled = true;
    };
  }, [savedImages]);

  const totalAfterPick = (extra: number) =>
    savedImages.length + pendingImages.length + extra;

  const countWarning = dailyLogImageCountWarning(
    savedImages.length + pendingImages.length,
  );

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0 || disabled) return;
    const selected = Array.from(files).map((file) => ({ file, caption: '' }));

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
          ? 'Kuvat tallentuvat heti valinnan jälkeen. Lisää kommentti kuville alla.'
          : 'Kuvat tallentuvat työkirjauksen tallennuksen yhteydessä. Voit lisätä kommentin ennen tallennusta.'}
      </p>
      {countWarning && !onNotice && <p className="warning-text">{countWarning}</p>}
      {savedImages.length > 0 && (
        <ul className="daily-log-image-edit-list">
          {savedImages.map((image) => (
            <SavedDailyLogImageRow
              key={image.id}
              image={image}
              url={savedUrls[image.id]}
              disabled={disabled || busy}
              onCaptionSaved={onSavedImagesChange}
              onDeleted={onSavedImagesChange}
              onError={onUploadFailed}
            />
          ))}
        </ul>
      )}
      {pendingImages.length > 0 && (
        <ul className="daily-log-image-edit-list">
          {pendingImages.map((item, index) => (
            <PendingDailyLogImageThumb
              key={`${item.file.name}-${item.file.lastModified}-${index}`}
              item={item}
              previewUrl={previewUrls[index]}
              onCaptionChange={(caption) =>
                onPendingImagesChange(
                  pendingImages.map((entry, i) => (i === index ? { ...entry, caption } : entry)),
                )
              }
              onRemove={() =>
                onPendingImagesChange(pendingImages.filter((_, i) => i !== index))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
