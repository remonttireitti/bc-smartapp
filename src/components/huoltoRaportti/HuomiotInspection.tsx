import { huomioLuonneOptions } from '../../lib/huoltoRaportti/constants';
import { ensureHuomiotLiite } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import type { HuoltoReportData, HuomioLuonne, HuomiotImageAttachment } from '../../lib/huoltoRaportti/types';
import type { MaintenanceReportPhotoItem } from '../../lib/maintenanceReportImages';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { EvidencePhotoUpload } from './EvidencePhotoUpload';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { RichCommentEditor } from './RichCommentEditor';
import { huomiotSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';

type DraftData = Pick<HuoltoReportData, 'huomiotLuonne' | 'huomiot' | 'huomiotLiitteet'>;

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string;
  userId?: string;
  documentModuleKey?: string;
}

function liitteetToPhotoItems(liitteet: HuomiotImageAttachment[] | undefined): MaintenanceReportPhotoItem[] {
  return (liitteet ?? [])
    .map((a) => ({
      storagePath: String(a.storagePath ?? a.id ?? '').trim(),
      comment: a.comment ?? '',
    }))
    .filter((item) => item.storagePath);
}

function photoItemsToLiitteet(
  items: MaintenanceReportPhotoItem[],
  prev: HuomiotImageAttachment[] | undefined,
): HuomiotImageAttachment[] {
  const previous = prev ?? [];
  return items.map((item) => {
    const existing = previous.find((a) => (a.storagePath ?? a.id) === item.storagePath);
    return ensureHuomiotLiite({
      ...existing,
      id: item.storagePath,
      storagePath: item.storagePath,
      comment: item.comment,
      fileName: existing?.fileName ?? item.storagePath.split('/').pop(),
      contentType: existing?.contentType ?? 'image/jpeg',
    });
  });
}

function pickDraft(form: HuoltoReportData): DraftData {
  return {
    huomiotLuonne: form.huomiotLuonne,
    huomiot: form.huomiot,
    huomiotLiitteet: form.huomiotLiitteet,
  };
}

function huomiotStatus(form: HuoltoReportData): HuoltoInspectionStatus {
  if (form.huomiot?.trim()) return 'ok';
  if ((form.huomiotLiitteet ?? []).length > 0) return 'ok';
  return null;
}

function huomiotSubtitle(form: HuoltoReportData): string {
  const luonne = huomioLuonneOptions.find((opt) => opt.value === (form.huomiotLuonne ?? 'kommentti'))?.label;
  const text = form.huomiot?.trim();
  if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  return luonne ?? '';
}

function HuomiotFields({
  draft,
  onPatch,
  reportId,
  userId,
}: {
  draft: DraftData;
  onPatch: (patch: Partial<DraftData>) => void;
  reportId?: string;
  userId?: string;
}) {
  const luonne = draft.huomiotLuonne ?? 'kommentti';
  const photoItems = liitteetToPhotoItems(draft.huomiotLiitteet);

  return (
    <>
      <div className="huolto-submodule">
        <label style={{ maxWidth: '360px' }}>
          Tekstin luonne
          <select
            value={luonne}
            onChange={(e) => onPatch({ huomiotLuonne: e.target.value as HuomioLuonne })}
          >
            {huomioLuonneOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="huolto-span-all">
          Huomiot ja suositukset
          <RichCommentEditor
            value={draft.huomiot}
            onChange={(huomiot) => onPatch({ huomiot })}
            rows={5}
            placeholder="Kirjoita huomiot…"
          />
        </label>
      </div>

      {reportId && userId ? (
        <EvidencePhotoUpload
          reportId={reportId}
          section="huomiot"
          items={photoItems}
          onChange={(next) => onPatch({ huomiotLiitteet: photoItemsToLiitteet(next, draft.huomiotLiitteet) })}
          userId={userId}
        />
      ) : (
        <div className="huolto-submodule">
          <p className="muted">Kuvien liittäminen vaatii tallennetun raportin.</p>
          {photoItems.length > 0 && (
            <ul className="huolto-evidence-photo-list">
              {photoItems.map((item) => (
                <li key={item.storagePath}>
                  {item.comment.trim() || <span className="muted">(ei kommenttia)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

export function HuomiotInspection({ form, onChange, reportId, userId, documentModuleKey }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;
  const title = huomiotSectionTitle(form.laiteTyyppi);
  const status = huomiotStatus(form);
  const subtitle = huomiotSubtitle(form);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: pickDraft(form),
    onChange: (next) => onChange(next),
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<DraftData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <>
      {!hideLauncher ? (
        <HuoltoPartInspectionRow title={title} subtitle={subtitle || undefined} status={status} onInspect={openDialog} />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title={title} titleId="huomiot-dialog-title" onClose={closeDialog}>
        <HuomiotFields draft={draft} onPatch={patchDraft} reportId={reportId} userId={userId} />
      </HuoltoInspectionDialogShell>
    </>
  );
}
