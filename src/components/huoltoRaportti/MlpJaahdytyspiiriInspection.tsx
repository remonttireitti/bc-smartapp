import type { MlpData, PumpunSyottoValinta } from '../../lib/huoltoRaportti/types';
import { getMlpPumpSyottoValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { PumpSupplyMeasurementBlock } from './PumpSupplyMeasurementBlock';

interface Props {
  title: string;
  mlp: MlpData;
  onChange: (patch: Partial<MlpData>) => void;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

export function MlpJaahdytyspiiriForm({
  draft,
  patchDraft,
}: {
  draft: MlpData;
  patchDraft: (patch: Partial<MlpData>) => void;
}) {
  const setPumpSyotto = (v: PumpunSyottoValinta) => {
    patchDraft({
      keruuJaahdytysPumpunSyottoValinta: v,
      keruuJaahdytysPumppuKolmeVaihetta: v === '400_3' ? true : v === '230_1' ? false : undefined,
    });
  };

  return (
    <>
      <div className="checkbox-grid huolto-toggle-grid">
        <FormCheckbox label="Erillinen piiri" checked={draft.keruuJaahdytysPiiri} onChange={(v) => patchDraft({ keruuJaahdytysPiiri: v })} />
        <FormCheckbox label="Piirissä pumppu" checked={draft.keruuJaahdytysPiiriPumppu} onChange={(v) => patchDraft({ keruuJaahdytysPiiriPumppu: v })} />
      </div>
      {draft.keruuJaahdytysPiiriPumppu ? (
        <>
          <div className="line-form-grid">
            <FormInput label="Pumpun valmistaja" value={draft.keruuJaahdytysPumpunValmistaja} onChange={(v) => patchDraft({ keruuJaahdytysPumpunValmistaja: v })} />
            <FormInput label="Pumpun malli" value={draft.keruuJaahdytysPumpunMalli} onChange={(v) => patchDraft({ keruuJaahdytysPumpunMalli: v })} />
          </div>
          <PumpSupplyMeasurementBlock
            syottoValinta={getMlpPumpSyottoValinta(draft.keruuJaahdytysPumpunSyottoValinta, draft.keruuJaahdytysPumppuKolmeVaihetta)}
            onSyottoValintaChange={setPumpSyotto}
            virta1vaihe={draft.keruuJaahdytysPumppuVirta1vaihe}
            virtaL1={draft.keruuJaahdytysPumppuVirtaL1}
            virtaL2={draft.keruuJaahdytysPumppuVirtaL2}
            virtaL3={draft.keruuJaahdytysPumppuVirtaL3}
            onVirta1vaihe={(v) => patchDraft({ keruuJaahdytysPumppuVirta1vaihe: v })}
            onVirtaL1={(v) => patchDraft({ keruuJaahdytysPumppuVirtaL1: v })}
            onVirtaL2={(v) => patchDraft({ keruuJaahdytysPumppuVirtaL2: v })}
            onVirtaL3={(v) => patchDraft({ keruuJaahdytysPumppuVirtaL3: v })}
          />
        </>
      ) : null}
      <div className="line-form-grid">
        <FormInput label="Virtaus (l/s)" value={draft.keruuJaahdytysVirtaus} onChange={(v) => patchDraft({ keruuJaahdytysVirtaus: v })} type="number" />
        <FormInput label="Meno (°C)" value={draft.keruuJaahdytysMenoLampotila} onChange={(v) => patchDraft({ keruuJaahdytysMenoLampotila: v })} type="number" />
        <FormInput label="Paluu (°C)" value={draft.keruuJaahdytysPaluuLampotila} onChange={(v) => patchDraft({ keruuJaahdytysPaluuLampotila: v })} type="number" />
        <FormInput label="Käyntivirta (A)" value={draft.keruuJaahdytysKayntivirta} onChange={(v) => patchDraft({ keruuJaahdytysKayntivirta: v })} type="number" />
      </div>
    </>
  );
}

export function MlpJaahdytyspiiriInspection({
  title,
  mlp,
  onChange,
  documentUnitKey,
  hidePartRow = false,
}: Props) {
  const status = !mlp.keruuJaahdytysPiiri ? 'na' : mlp.keruuJaahdytysVirtaus?.trim() ? 'ok' : null;
  const subtitle = mlp.keruuJaahdytysVirtaus?.trim()
    ? `${mlp.keruuJaahdytysVirtaus} l/s`
    : undefined;

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: mlp,
    onChange,
  });

  const patchDraft = (patch: Partial<MlpData>) => setDraft((prev) => ({ ...prev, ...patch }));

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  return (
    <>
      {!hidePartRow ? (
        <HuoltoPartInspectionRow title={title} subtitle={subtitle} status={status} onInspect={openDialog} />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title={title} titleId="mlp-jaahdytys-dialog-title" onClose={closeDialog}>
        <MlpJaahdytyspiiriForm draft={draft} patchDraft={patchDraft} />
      </HuoltoInspectionDialogShell>
    </>
  );
}
