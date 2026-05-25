import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { WorkReportAttachment } from '../types';

export const BUCKET = 'work-report-images';

export const ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf';

export function isImageMimeType(mimeType: string | null | undefined) {
  return !!mimeType && mimeType.startsWith('image/');
}

export async function loadWorkReportAttachments(reportId: string): Promise<WorkReportAttachment[]> {
  const { data, error } = await supabase
    .from('work_report_attachments')
    .select('id, work_report_id, storage_path, file_name, mime_type, created_at')
    .eq('work_report_id', reportId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as WorkReportAttachment[]) ?? [];
}

export async function uploadWorkReportAttachments(
  reportId: string,
  files: File[],
  userId: string,
) {
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${reportId}/attachments/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { error: metaError } = await supabase.from('work_report_attachments').insert({
      work_report_id: reportId,
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

export async function deleteWorkReportAttachment(attachment: WorkReportAttachment) {
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
  await supabase.from('work_report_attachments').delete().eq('id', attachment.id);
}

async function resolveAttachmentUrl(storagePath: string, expiresIn = 3600) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  return data?.signedUrl ?? null;
}

export function WorkReportAttachmentGallery({
  attachments,
  onDelete,
  deleteBusy,
}: {
  attachments: WorkReportAttachment[];
  onDelete?: (attachment: WorkReportAttachment) => void;
  deleteBusy?: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadUrls() {
      const next: Record<string, string> = {};
      for (const attachment of attachments) {
        const url = await resolveAttachmentUrl(attachment.storage_path);
        if (url) next[attachment.id] = url;
      }
      if (!cancelled) setUrls(next);
    }

    if (attachments.length > 0) void loadUrls();
    else setUrls({});

    return () => {
      cancelled = true;
    };
  }, [attachments]);

  if (attachments.length === 0) return null;

  const images = attachments.filter((item) => isImageMimeType(item.mime_type));
  const files = attachments.filter((item) => !isImageMimeType(item.mime_type));

  return (
    <div className="work-report-attachments">
      {images.length > 0 && (
        <div className="image-gallery">
          {images.map((attachment) => (
            <div key={attachment.id} className="image-thumb pending">
              <a
                href={urls[attachment.id] ?? '#'}
                target="_blank"
                rel="noreferrer"
                title={attachment.file_name}
              >
                {urls[attachment.id] ? (
                  <img src={urls[attachment.id]} alt={attachment.file_name} />
                ) : (
                  <span className="muted">Ladataan…</span>
                )}
              </a>
              {onDelete && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={deleteBusy}
                  onClick={() => onDelete(attachment)}
                >
                  Poista
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul className="attachment-file-list">
          {files.map((attachment) => (
            <li key={attachment.id}>
              <a href={urls[attachment.id] ?? '#'} target="_blank" rel="noreferrer">
                {attachment.file_name}
              </a>
              {onDelete && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={deleteBusy}
                  onClick={() => onDelete(attachment)}
                >
                  Poista
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PendingPreviewProps {
  files: File[];
  previewUrls: string[];
  onRemove: (index: number) => void;
}

export function PendingWorkReportAttachments({ files, previewUrls, onRemove }: PendingPreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="work-report-attachments">
      <div className="image-gallery">
        {files.map((file, index) => (
          <div key={`${file.name}-${index}`} className="image-thumb pending">
            {file.type.startsWith('image/') && previewUrls[index] ? (
              <img src={previewUrls[index]} alt={file.name} />
            ) : (
              <span className="attachment-file-label">{file.name}</span>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onRemove(index)}
            >
              Poista
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AddAttachmentsProps {
  reportId: string | null;
  userId: string;
  savedAttachments: WorkReportAttachment[];
  pendingFiles: File[];
  disabled?: boolean;
  onSavedAttachmentsChange: (attachments: WorkReportAttachment[]) => void;
  onPendingFilesChange: (files: File[]) => void;
}

export function WorkReportAttachmentsField({
  reportId,
  userId,
  savedAttachments,
  pendingFiles,
  disabled,
  onSavedAttachmentsChange,
  onPendingFilesChange,
}: AddAttachmentsProps) {
  const [busy, setBusy] = useState(false);
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = pendingFiles.map((file) =>
      file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    );
    setPendingPreviewUrls(urls);
    return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [pendingFiles]);

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || disabled) return;
    const selected = Array.from(fileList);

    if (!reportId) {
      onPendingFilesChange([...pendingFiles, ...selected]);
      return;
    }

    setBusy(true);
    try {
      await uploadWorkReportAttachments(reportId, selected, userId);
      onSavedAttachmentsChange(await loadWorkReportAttachments(reportId));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Liitteiden lataus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  async function removeSaved(attachment: WorkReportAttachment) {
    if (disabled) return;
    setBusy(true);
    try {
      await deleteWorkReportAttachment(attachment);
      onSavedAttachmentsChange(savedAttachments.filter((item) => item.id !== attachment.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Liitteen poisto epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-section">
      <div className="section-head">
        <h3>Kuvat ja tiedostot</h3>
        <label className="btn btn-secondary image-upload-btn">
          {busy ? 'Ladataan…' : '+ Lisää liitteitä'}
          <input
            type="file"
            accept={ATTACHMENT_ACCEPT}
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
        Voit liittää kuvia ja PDF-tiedostoja jo luonnin yhteydessä (max 12 MB / tiedosto).
        {!reportId && pendingFiles.length > 0 && ' Liitteet tallentuvat kun luonnos on tallennettu.'}
      </p>
      <WorkReportAttachmentGallery
        attachments={savedAttachments}
        onDelete={disabled ? undefined : (attachment) => void removeSaved(attachment)}
        deleteBusy={busy}
      />
      <PendingWorkReportAttachments
        files={pendingFiles}
        previewUrls={pendingPreviewUrls}
        onRemove={(index) => onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))}
      />
    </div>
  );
}
