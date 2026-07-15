import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { toSupabaseStoragePath } from './storageUrl';
import type { InstallationPlanAttachment } from './installationPlan/types';

export const BUCKET = 'installation-plan-files';

export const INSTALLATION_PLAN_ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf';

export function isInstallationPlanImageMime(mimeType: string | null | undefined) {
  return !!mimeType && mimeType.startsWith('image/');
}

export async function loadInstallationPlanAttachments(
  planId: string,
): Promise<InstallationPlanAttachment[]> {
  const { data, error } = await supabase
    .from('installation_plan_attachments')
    .select('id, installation_plan_id, storage_path, file_name, mime_type, created_at')
    .eq('installation_plan_id', planId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as InstallationPlanAttachment[]) ?? [];
}

export async function uploadInstallationPlanAttachments(
  planId: string,
  files: File[],
  userId: string,
) {
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${planId}/attachments/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { error: metaError } = await supabase.from('installation_plan_attachments').insert({
      installation_plan_id: planId,
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

export async function deleteInstallationPlanAttachment(attachment: InstallationPlanAttachment) {
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
  await supabase.from('installation_plan_attachments').delete().eq('id', attachment.id);
}

async function resolveAttachmentUrl(storagePath: string, expiresIn = 3600) {
  const path = toSupabaseStoragePath(storagePath);
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export function InstallationPlanAttachmentGallery({
  attachments,
  onDelete,
  deleteBusy,
}: {
  attachments: InstallationPlanAttachment[];
  onDelete?: (attachment: InstallationPlanAttachment) => void;
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

  const images = attachments.filter((item) => isInstallationPlanImageMime(item.mime_type));
  const files = attachments.filter((item) => !isInstallationPlanImageMime(item.mime_type));

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

export function InstallationPlanAttachmentsField({
  planId,
  userId,
  savedAttachments,
  pendingFiles,
  disabled,
  onSavedAttachmentsChange,
  onPendingFilesChange,
}: {
  planId: string | null;
  userId: string;
  savedAttachments: InstallationPlanAttachment[];
  pendingFiles: File[];
  disabled?: boolean;
  onSavedAttachmentsChange: (attachments: InstallationPlanAttachment[]) => void;
  onPendingFilesChange: (files: File[]) => void;
}) {
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

    if (!planId) {
      onPendingFilesChange([...pendingFiles, ...selected]);
      return;
    }

    setBusy(true);
    try {
      await uploadInstallationPlanAttachments(planId, selected, userId);
      onSavedAttachmentsChange(await loadInstallationPlanAttachments(planId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Liitteen lataus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function removeSaved(attachment: InstallationPlanAttachment) {
    if (!planId || disabled) return;
    setBusy(true);
    try {
      await deleteInstallationPlanAttachment(attachment);
      onSavedAttachmentsChange(await loadInstallationPlanAttachments(planId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Liitteen poisto epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="installation-plan-attachments-field">
      <label className="btn btn-secondary btn-sm">
        {busy ? 'Ladataan…' : '+ Lisää liite'}
        <input
          type="file"
          multiple
          accept={INSTALLATION_PLAN_ATTACHMENT_ACCEPT}
          disabled={disabled || busy}
          hidden
          onChange={(event) => void onFilesSelected(event.target.files)}
        />
      </label>
      {!planId && pendingFiles.length > 0 && (
        <p className="muted">Liitteet tallentuvat, kun suunnitelma on ensin tallennettu.</p>
      )}
      {pendingFiles.length > 0 && (
        <ul className="attachment-file-list">
          {pendingFiles.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              {file.type.startsWith('image/') && pendingPreviewUrls[index] ? (
                <img src={pendingPreviewUrls[index]} alt={file.name} style={{ maxWidth: 120 }} />
              ) : (
                file.name
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={disabled}
                onClick={() =>
                  onPendingFilesChange(pendingFiles.filter((_, fileIndex) => fileIndex !== index))
                }
              >
                Poista
              </button>
            </li>
          ))}
        </ul>
      )}
      <InstallationPlanAttachmentGallery
        attachments={savedAttachments}
        onDelete={planId ? removeSaved : undefined}
        deleteBusy={busy}
      />
    </div>
  );
}
