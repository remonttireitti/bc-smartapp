import { koeTulosOptions } from '../../lib/huoltoRaportti/constants';
import {
  KLO_PUOLI_TUNNIN_VAIHTOEHDOT,
  laskeKokeLoppuaikaFi,
  resolveKoePaivamaaraJaKello,
} from '../../lib/huoltoRaportti/kokeAikaUtils';
import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import type {
  HuoltoReportData,
  TiiveyskoeTulos,
  TyhjiointiData,
  TyhjiointiPaineYksikko,
} from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { EvidencePhotoUpload } from './EvidencePhotoUpload';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { RichCommentEditor } from './RichCommentEditor';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string | null;
  userId?: string;
  documentModuleKey?: string;
}

function tyhjiointiStatus(data: TyhjiointiData): HuoltoInspectionStatus {
  if (data.tulos?.trim()) return data.tulos === 'hyvaksytty' ? 'ok' : 'faulty';
  if (data.loppupaineArvo?.trim()) return 'ok';
  return null;
}

function tyhjiointiSubtitle(data: TyhjiointiData): string {
  const unit = data.loppupaineYksikko === 'mbar' ? 'mbar' : 'µm';
  const pressure = data.loppupaineArvo?.trim();
  const parts = [pressure ? `${pressure} ${unit}` : '', data.tulos?.trim()].filter(Boolean);
  return parts.join(' · ');
}

function TyhjiointiFields({
  data,
  huoltoPaivamaara,
  onPatch,
  reportId,
  userId,
}: {
  data: TyhjiointiData;
  huoltoPaivamaara: string;
  onPatch: (patch: Partial<TyhjiointiData>) => void;
  reportId?: string | null;
  userId?: string;
}) {
  const resolved = resolveKoePaivamaaraJaKello(data.koeAlkaaPvm, data.koeAlkaaKlo, huoltoPaivamaara);
  const loppuaika = laskeKokeLoppuaikaFi(resolved.pvmIso, resolved.klo, data.kestoMin);

  return (
    <>
      <div className="line-form-grid huolto-measurement-grid">
        <FormInput
          label="Loppupaine (arvo)"
          value={data.loppupaineArvo}
          onChange={(v) => onPatch({ loppupaineArvo: v })}
          placeholder="Esim. 500 tai 0,05"
        />
        <label>
          Loppupaineen yksikkö
          <select
            value={data.loppupaineYksikko}
            onChange={(e) =>
              onPatch({
                loppupaineYksikko: (e.target.value === 'mbar' ? 'mbar' : 'micron') as TyhjiointiPaineYksikko,
              })
            }
          >
            <option value="micron">µm (micron)</option>
            <option value="mbar">mbar (millibar)</option>
          </select>
        </label>
        <label>
          Koe alkoi — päivämäärä
          <input
            type="date"
            value={data.koeAlkaaPvm}
            onChange={(e) => onPatch({ koeAlkaaPvm: e.target.value })}
          />
        </label>
        <label>
          Koe alkoi — kellonaika (puolen tunnin tarkkuus)
          <select value={data.koeAlkaaKlo} onChange={(e) => onPatch({ koeAlkaaKlo: e.target.value })}>
            <option value="">—</option>
            {KLO_PUOLI_TUNNIN_VAIHTOEHDOT.map((k) => (
              <option key={`tyhj-${k}`} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <FormInput label="Kesto (min)" value={data.kestoMin} onChange={(v) => onPatch({ kestoMin: v })} />
        <label>
          Koe päättyi (laskettu alusta + kesto)
          <div className="huolto-readonly-field">{loppuaika || '—'}</div>
        </label>
        <label>
          Tulos
          <select
            value={data.tulos}
            onChange={(e) => onPatch({ tulos: e.target.value as TiiveyskoeTulos })}
          >
            {koeTulosOptions.map((opt) => (
              <option key={opt.value || 'empty'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="Käytetty painemittari"
          value={data.kaytettyPainemittari}
          onChange={(v) => onPatch({ kaytettyPainemittari: v })}
          placeholder="Malli / tunniste"
          className="huolto-span-all"
        />
        <label className="huolto-span-all">
          Huomiot
          <RichCommentEditor value={data.huom} onChange={(huom) => onPatch({ huom })} rows={3} />
        </label>
      </div>
      {reportId && userId ? (
        <EvidencePhotoUpload
          reportId={reportId}
          section="tyhjiointi"
          items={data.todisteKuvat ?? []}
          userId={userId}
          onChange={(todisteKuvat) => onPatch({ todisteKuvat })}
        />
      ) : (
        <p className="muted">Tallenna luonnos ensin, jotta voit liittää kuvatodisteita.</p>
      )}
    </>
  );
}

export function TyhjiointiInspection({ form, onChange, reportId, userId, documentModuleKey }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;
  const data = form.tyhjiointiData;
  const status = tyhjiointiStatus(data);
  const subtitle = tyhjiointiSubtitle(data);

  const applyDraft = (next: TyhjiointiData) => onChange({ tyhjiointiData: next });

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange: applyDraft,
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<TyhjiointiData>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (!printLayout) {
    return (
      <TyhjiointiFields
        data={data}
        huoltoPaivamaara={form.huoltoPaivamaara}
        onPatch={(patch) => onChange({ tyhjiointiData: { ...data, ...patch } })}
        reportId={reportId}
        userId={userId}
      />
    );
  }

  return (
    <>
      {!hideLauncher ? (
        <HuoltoPartInspectionRow
          title="Tyhjiöinti"
          subtitle={subtitle || undefined}
          status={status}
          onInspect={openDialog}
        />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title="Tyhjiöinti" titleId="tyhjiointi-dialog-title" onClose={closeDialog}>
        <TyhjiointiFields
          data={draft}
          huoltoPaivamaara={form.huoltoPaivamaara}
          onPatch={patchDraft}
          reportId={reportId}
          userId={userId}
        />
      </HuoltoInspectionDialogShell>
    </>
  );
}
