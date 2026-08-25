import { koeTulosOptions } from '../../lib/huoltoRaportti/constants';
import {
  KLO_PUOLI_TUNNIN_VAIHTOEHDOT,
  laskeKokeLoppuaikaFi,
  resolveKoePaivamaaraJaKello,
} from '../../lib/huoltoRaportti/kokeAikaUtils';
import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import type { HuoltoReportData, TiiveyskoeData, TiiveyskoeTulos } from '../../lib/huoltoRaportti/types';
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

function tiiveyskoeStatus(data: TiiveyskoeData): HuoltoInspectionStatus {
  if (data.tulos?.trim()) return data.tulos === 'hyvaksytty' ? 'ok' : 'faulty';
  if (data.testipaineBar?.trim()) return 'ok';
  return null;
}

function tiiveyskoeSubtitle(data: TiiveyskoeData): string {
  const parts = [data.testipaineBar?.trim() ? `${data.testipaineBar} bar` : '', data.tulos?.trim()].filter(Boolean);
  return parts.join(' · ');
}

function TiiveyskoeFields({
  data,
  huoltoPaivamaara,
  onPatch,
  reportId,
  userId,
}: {
  data: TiiveyskoeData;
  huoltoPaivamaara: string;
  onPatch: (patch: Partial<TiiveyskoeData>) => void;
  reportId?: string | null;
  userId?: string;
}) {
  const resolved = resolveKoePaivamaaraJaKello(data.koeAlkaaPvm, data.koeAlkaaKlo, huoltoPaivamaara);
  const loppuaika = laskeKokeLoppuaikaFi(resolved.pvmIso, resolved.klo, data.kestoMin);

  return (
    <>
      <div className="line-form-grid huolto-measurement-grid">
        <FormInput
          label="Koepaine (bar)"
          value={data.testipaineBar}
          onChange={(v) => onPatch({ testipaineBar: v })}
          placeholder="Esim. 42"
        />
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
              <option key={k} value={k}>
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
        <FormInput
          label="Testauslämpötila (°C)"
          value={data.testauslampotila}
          onChange={(v) => onPatch({ testauslampotila: v })}
        />
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
          label="Menetelmä / väline"
          value={data.menetelma}
          onChange={(v) => onPatch({ menetelma: v })}
          placeholder="Esim. paine- / kaasumenetelmä"
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
          section="tiiveyskoe"
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

export function TiiveyskoeInspection({ form, onChange, reportId, userId, documentModuleKey }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;
  const data = form.tiiveyskoeData;
  const status = tiiveyskoeStatus(data);
  const subtitle = tiiveyskoeSubtitle(data);

  const applyDraft = (next: TiiveyskoeData) => onChange({ tiiveyskoeData: next });

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange: applyDraft,
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<TiiveyskoeData>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (!printLayout) {
    return (
      <TiiveyskoeFields
        data={data}
        huoltoPaivamaara={form.huoltoPaivamaara}
        onPatch={(patch) => onChange({ tiiveyskoeData: { ...data, ...patch } })}
        reportId={reportId}
        userId={userId}
      />
    );
  }

  return (
    <>
      {!hideLauncher ? (
        <HuoltoPartInspectionRow title="Tiiveyskoe" subtitle={subtitle || undefined} status={status} onInspect={openDialog} />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title="Tiiveyskoe" titleId="tiiveyskoe-dialog-title" onClose={closeDialog}>
        <TiiveyskoeFields
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
