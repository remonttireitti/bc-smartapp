import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { chillerLauhdutinTypeOptions } from '../../lib/huoltoRaportti/constants';
import { hasExternalNestelauhdutin } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { FormCheckbox } from './FormCheckbox';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';

type DraftData = Pick<
  HuoltoReportData,
  'lauhdutinTyyppiLaite' | 'vjNestelauhdutusJaettu' | 'vapaajahdytysKaytossa'
>;

interface Props {
  form: HuoltoReportData;
  onCondenserTypeChange: (tyyppi: HuoltoReportData['lauhdutinTyyppiLaite']) => void;
  onFreeCoolingChange: (checked: boolean) => void;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

function pickDraft(form: HuoltoReportData): DraftData {
  return {
    lauhdutinTyyppiLaite: form.lauhdutinTyyppiLaite,
    vjNestelauhdutusJaettu: form.vjNestelauhdutusJaettu,
    vapaajahdytysKaytossa: form.vapaajahdytysKaytossa,
  };
}

function vjLauhdutinStatus(form: HuoltoReportData): HuoltoInspectionStatus {
  return form.lauhdutinTyyppiLaite?.trim() ? 'ok' : null;
}

function vjLauhdutinSubtitle(form: HuoltoReportData): string {
  const label = chillerLauhdutinTypeOptions.find((opt) => opt.value === form.lauhdutinTyyppiLaite)?.label;
  const parts = [label?.trim()].filter(Boolean);
  if (form.vapaajahdytysKaytossa) parts.push('Vapaajäähdytys');
  return parts.join(' · ');
}

function VjLauhdutinConfigFields({
  draft,
  onPatch,
  onCondenserTypeChange,
  onFreeCoolingChange,
}: {
  draft: DraftData;
  onPatch: (patch: Partial<DraftData>) => void;
  onCondenserTypeChange: (tyyppi: HuoltoReportData['lauhdutinTyyppiLaite']) => void;
  onFreeCoolingChange: (checked: boolean) => void;
}) {
  const showSharedNestelauhdutin = hasExternalNestelauhdutin(draft.lauhdutinTyyppiLaite);

  return (
    <div className="huolto-chiller-lauhdutin-config">
      <label className="huolto-span-all">
        Lauhdutustapa
        <select
          value={draft.lauhdutinTyyppiLaite ?? ''}
          onChange={(e) => {
            const value = e.target.value as HuoltoReportData['lauhdutinTyyppiLaite'];
            onPatch({ lauhdutinTyyppiLaite: value });
            onCondenserTypeChange(value);
          }}
        >
          {chillerLauhdutinTypeOptions.map((opt) => (
            <option key={opt.value || 'empty'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {showSharedNestelauhdutin ? (
        <FormCheckbox
          label="Yhteinen nestelauhdutus kaikille kylmäainepiireille"
          checked={draft.vjNestelauhdutusJaettu ?? true}
          onChange={(checked) => onPatch({ vjNestelauhdutusJaettu: checked })}
        />
      ) : null}
      <FormCheckbox
        label="Vapaajäähdytys käytössä"
        checked={!!draft.vapaajahdytysKaytossa}
        onChange={(checked) => {
          onPatch({ vapaajahdytysKaytossa: checked });
          onFreeCoolingChange(checked);
        }}
      />
      <p className="muted huolto-help huolto-chiller-lauhdutin-help">
        Ilmalauhdutin (integroitu / erillinen) tai levy-/putkilämmönvaihdin — joko ulkoisen nestelauhduttimen
        kanssa tai ilman.
      </p>
    </div>
  );
}

export function VjLauhdutinConfigInspection({ form, onCondenserTypeChange, onFreeCoolingChange, onChange }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const status = vjLauhdutinStatus(form);
  const subtitle = vjLauhdutinSubtitle(form);

  const applyDraft = (next: DraftData) => {
    onChange(next);
    if (next.lauhdutinTyyppiLaite !== form.lauhdutinTyyppiLaite) {
      onCondenserTypeChange(next.lauhdutinTyyppiLaite);
    }
    if (next.vapaajahdytysKaytossa !== form.vapaajahdytysKaytossa) {
      onFreeCoolingChange(!!next.vapaajahdytysKaytossa);
    }
  };

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: pickDraft(form),
    onChange: applyDraft,
  });

  const patchDraft = (patch: Partial<DraftData>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (!printLayout) {
    return (
      <VjLauhdutinConfigFields
        draft={pickDraft(form)}
        onPatch={(patch) => onChange(patch)}
        onCondenserTypeChange={onCondenserTypeChange}
        onFreeCoolingChange={onFreeCoolingChange}
      />
    );
  }

  return (
    <>
      <HuoltoPartInspectionRow
        title="Lauhdutin-asetukset"
        subtitle={subtitle || undefined}
        status={status}
        onInspect={openDialog}
      />

      <HuoltoInspectionDialogShell
        open={open}
        title="Lauhdutin-asetukset"
        titleId="vj-lauhdutin-config-dialog-title"
        onClose={closeDialog}
      >
        <VjLauhdutinConfigFields
          draft={draft}
          onPatch={patchDraft}
          onCondenserTypeChange={onCondenserTypeChange}
          onFreeCoolingChange={onFreeCoolingChange}
        />
      </HuoltoInspectionDialogShell>
    </>
  );
}
