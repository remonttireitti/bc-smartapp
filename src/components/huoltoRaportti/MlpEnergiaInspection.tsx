import type { HuoltoReportData, KompressorinVaiheValinta, MlpData } from '../../lib/huoltoRaportti/types';
import {
  showMlpMaalampoSubsections,
  showChillerPropertySubsections,
} from '../../lib/huoltoRaportti/deviceModuleLogic';
import { hideMaintenancePrintWarnings } from '../../lib/huoltoRaportti/defaults';
import { computeChillerEnergyFromMlp } from '../../lib/huoltoRaportti/mlpEnergyCalc';
import { getKokoLaiteSahkoVaiheValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { MlpEnergyDashboard } from './MlpEnergyDashboard';

interface Props {
  title: string;
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

export function MlpEnergiaForm({
  form,
  draft,
  patchDraft,
}: {
  form: HuoltoReportData;
  draft: MlpData;
  patchDraft: (patch: Partial<MlpData>) => void;
}) {
  const showMaalampoOnly = showMlpMaalampoSubsections(form.laiteTyyppi);
  const showChillerParts = showChillerPropertySubsections(form.laiteTyyppi);

  return (
    <>
      <FormCheckbox
        label="Mittaan koko laitteiston sähkönkulutuksen COP-laskentaan"
        checked={draft.mittaaKokoLaiteSahko}
        onChange={(v) => patchDraft({ mittaaKokoLaiteSahko: v })}
      />
      {draft.mittaaKokoLaiteSahko ? (
        <div className="line-form-grid">
          <label className="huolto-span-all">
            Koko laitteiston virrankulutus
            <select
              value={getKokoLaiteSahkoVaiheValinta(draft)}
              onChange={(e) => {
                const v = e.target.value as KompressorinVaiheValinta;
                patchDraft({
                  kokoLaiteSahkoVaiheValinta: v,
                  kokoLaiteSahkoKolmeVaihetta: v === '3' ? true : v === '1' ? false : undefined,
                });
              }}
            >
              <option value="">Valitse…</option>
              <option value="1">230 V (1-vaihe)</option>
              <option value="3">400 V (3-vaihe)</option>
            </select>
          </label>
          {getKokoLaiteSahkoVaiheValinta(draft) === '1' ? (
            <FormInput label="1-vaihe (A)" value={draft.kokoLaiteVirta1vaihe} onChange={(v) => patchDraft({ kokoLaiteVirta1vaihe: v })} type="number" />
          ) : null}
          {getKokoLaiteSahkoVaiheValinta(draft) === '3' ? (
            <>
              <FormInput label="L1 (A)" value={draft.kokoLaiteVirtaL1} onChange={(v) => patchDraft({ kokoLaiteVirtaL1: v })} type="number" />
              <FormInput label="L2 (A)" value={draft.kokoLaiteVirtaL2} onChange={(v) => patchDraft({ kokoLaiteVirtaL2: v })} type="number" />
              <FormInput label="L3 (A)" value={draft.kokoLaiteVirtaL3} onChange={(v) => patchDraft({ kokoLaiteVirtaL3: v })} type="number" />
            </>
          ) : null}
        </div>
      ) : null}
      {showMaalampoOnly ? (
        <MlpEnergyDashboard
          mlp={draft}
          kp1={form.kylmaainePiiri1}
          wholeDeviceElectric={!!draft.mittaaKokoLaiteSahko}
          hideWarnings={hideMaintenancePrintWarnings(form)}
        />
      ) : null}
      {showChillerParts && !showMaalampoOnly ? (() => {
        const chiller = computeChillerEnergyFromMlp(draft, form.kylmaainePiiri1);
        return (
          <div className="huolto-energy-summary">
            <div className="huolto-energy-cop">
              <span className="huolto-energy-cop-label">Jäähdytyksen COP</span>
              <strong className="huolto-energy-cop-value">
                {chiller.cop != null && chiller.cop > 0 ? chiller.cop.toFixed(2) : '—'}
              </strong>
            </div>
            <div className="line-form-grid huolto-energy-grid">
              {chiller.qCoolKw != null && chiller.qCoolKw > 0 ? (
                <div className="huolto-alert huolto-alert-success">
                  Jäähdytysteho: {chiller.qCoolKw.toFixed(2)} kW
                </div>
              ) : null}
              {chiller.pInKw != null ? (
                <div className="huolto-alert">Sähköteho: {chiller.pInKw.toFixed(2)} kW</div>
              ) : null}
            </div>
          </div>
        );
      })() : null}
    </>
  );
}

export function MlpEnergiaInspection({
  title,
  form,
  onChange,
  documentUnitKey,
  hidePartRow = false,
}: Props) {
  const mlp = form.mlpData;
  if (!mlp) return null;

  const status = mlp.mittaaKokoLaiteSahko
    && !mlp.kokoLaiteVirta1vaihe?.trim()
    && !mlp.kokoLaiteVirtaL1?.trim()
    ? null
    : 'ok';

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: mlp,
    onChange: (next) => onChange({ mlpData: next }),
  });

  const patchDraft = (patch: Partial<MlpData>) => setDraft((prev) => ({ ...prev, ...patch }));

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  return (
    <>
      {!hidePartRow ? (
        <HuoltoPartInspectionRow title={title} status={status} onInspect={openDialog} />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title={title} titleId="mlp-energia-dialog-title" onClose={closeDialog}>
        <MlpEnergiaForm form={form} draft={draft} patchDraft={patchDraft} />
      </HuoltoInspectionDialogShell>
    </>
  );
}
