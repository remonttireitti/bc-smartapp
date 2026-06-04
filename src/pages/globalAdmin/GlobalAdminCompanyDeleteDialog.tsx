import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Company } from '../../types';

export type CompanyDeletionPreview = {
  company_id: string;
  name: string;
  slug: string;
  user_count: number;
  user_emails: string[];
  data_row_count: number;
};

type Props = {
  company: Company | null;
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (confirmSlug: string) => void;
};

export async function fetchCompanyDeletionPreview(
  companyId: string,
): Promise<CompanyDeletionPreview> {
  const { data, error } = await supabase.rpc('global_admin_company_deletion_preview', {
    p_company_id: companyId,
  });

  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    company_id: String(row.company_id),
    name: String(row.name),
    slug: String(row.slug),
    user_count: Number(row.user_count ?? 0),
    user_emails: Array.isArray(row.user_emails) ? (row.user_emails as string[]) : [],
    data_row_count: Number(row.data_row_count ?? 0),
  };
}

export default function GlobalAdminCompanyDeleteDialog({
  company,
  open,
  busy = false,
  error = null,
  onClose,
  onConfirm,
}: Props) {
  const [confirmSlug, setConfirmSlug] = useState('');
  const [preview, setPreview] = useState<CompanyDeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open || !company) {
      setConfirmSlug('');
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    void fetchCompanyDeletionPreview(company.id)
      .then((nextPreview) => {
        if (!cancelled) setPreview(nextPreview);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Esikatselu epäonnistui');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, company]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open || !company) return null;

  const slugOk = confirmSlug.trim().toLowerCase() === company.slug.toLowerCase();

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog panel global-admin-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-admin-delete-company-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="global-admin-delete-company-title">Poista yritys</h2>
        <p>
          Poistetaanko yritys <strong>{company.name}</strong> (<code>{company.slug}</code>) pysyvästi?
        </p>

        {previewLoading && <p className="muted">Ladataan poiston vaikutuksia…</p>}
        {previewError && <p className="form-error">{previewError}</p>}
        {preview && !previewLoading && (
          <ul className="global-admin-delete-impact">
            <li>
              <strong>{preview.user_count}</strong> käyttäjätiliä poistetaan
            </li>
            <li>
              <strong>{preview.data_row_count}</strong> työ-/huolto-/asiakas-/tarjousriviä poistuu
            </li>
          </ul>
        )}

        {preview?.user_emails?.length ? (
          <p className="muted global-admin-delete-emails">
            Käyttäjät: {preview.user_emails.join(', ')}
          </p>
        ) : null}

        <p className="muted">
          Kirjoita vahvistukseksi yrityksen tunniste: <code>{company.slug}</code>
        </p>
        <label className="global-admin-delete-confirm-label">
          Tunniste (slug)
          <input
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            placeholder={company.slug}
            autoComplete="off"
            disabled={busy || previewLoading || !!previewError}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="leave-draft-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Peruuta
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy || previewLoading || !!previewError || !slugOk}
            onClick={() => onConfirm(confirmSlug.trim())}
          >
            {busy ? 'Poistetaan…' : 'Poista yritys'}
          </button>
        </div>
      </div>
    </div>
  );
}
