import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { CompressorData, KompressorinVaiheValinta } from '../../lib/huoltoRaportti/types';
import { ohjaustapaOptions } from '../../lib/huoltoRaportti/constants';
import { compressorKolmeVaijetta, getCompressorVaiheValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import {
  compressorInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { binaryChoiceFromStatus } from '../../lib/huoltoRaportti/circuitPartInspection';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { BinaryInspectionToggle } from './BinaryInspectionToggle';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import {
  PrintGridField,
  PrintInspectionBlock,
} from './print/MaintenancePrintLayout';

interface CompressorModuleProps {
  number: number;
  data: CompressorData;
  onChange: (data: CompressorData) => void;
  lockManufacturerModel?: boolean;
  titleLabel?: string;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

type DraftSetter = Dispatch<SetStateAction<CompressorData>>;

function CompressorFormFields({
  draft,
  setDraft,
  number,
  lockManufacturerModel,
  okChoice,
  onOkChoice,
  variant = 'print',
}: {
  draft: CompressorData;
  setDraft: DraftSetter;
  number: number;
  lockManufacturerModel: boolean;
  okChoice: boolean | null;
  onOkChoice: (next: boolean) => void;
  variant?: 'print' | 'dialog';
}) {
  const vaiheValinta = getCompressorVaiheValinta(draft);
  const kolmeVai = compressorKolmeVaijetta(draft);

  const calculatePhaseImbalance = (): { percentage: number; level: 'ok' | 'warning' | 'danger' } | null => {
    const l1 = parseFloat(draft.virtaL1) || 0;
    const l2 = parseFloat(draft.virtaL2) || 0;
    const l3 = parseFloat(draft.virtaL3) || 0;
    if (l1 <= 0 || l2 <= 0 || l3 <= 0) return null;
    const avg = (l1 + l2 + l3) / 3;
    if (avg <= 0) return null;
    const deviations = [Math.abs(l1 - avg), Math.abs(l2 - avg), Math.abs(l3 - avg)];
    const maxDeviation = Math.max(...deviations);
    const percentage = (maxDeviation / avg) * 100;
    let level: 'ok' | 'warning' | 'danger' = 'ok';
    if (percentage > 10) level = 'danger';
    else if (percentage > 5) level = 'warning';
    return { percentage, level };
  };

  const imbalance = kolmeVai ? calculatePhaseImbalance() : null;

  const setVaiheValinta = (v: KompressorinVaiheValinta) => {
    setDraft((prev) => ({
      ...prev,
      kompressorinVaiheValinta: v,
      onkoKolmeVaihetta: v === '3' ? true : v === '1' ? false : undefined,
    }));
  };

  const syncLegacyTyyppi = (val: string, mall: string) =>
    [val, mall].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');

  return (
    <>
      <div className="line-form-grid">
        <FormInput
          label="Valmistaja"
          value={draft.valmistaja ?? ''}
          onChange={(v) =>
            setDraft((prev) => ({ ...prev, valmistaja: v, tyyppi: syncLegacyTyyppi(v, prev.malli ?? '') }))
          }
          disabled={lockManufacturerModel}
        />
        <FormInput
          label="Malli"
          value={draft.malli ?? ''}
          onChange={(v) =>
            setDraft((prev) => ({ ...prev, malli: v, tyyppi: syncLegacyTyyppi(prev.valmistaja ?? '', v) }))
          }
          disabled={lockManufacturerModel}
        />
        {lockManufacturerModel ? (
          <p className="muted huolto-span-all">Valmistaja ja malli haetaan kompressorista 1.</p>
        ) : null}

        <label className="huolto-span-all">
          Syöttöjännite
          <select
            value={vaiheValinta}
            onChange={(e) => setVaiheValinta(e.target.value as KompressorinVaiheValinta)}
          >
            <option value="">Valitse</option>
            <option value="1">230 V (1-vaihe)</option>
            <option value="3">400 V (3-vaihe)</option>
          </select>
        </label>

        {vaiheValinta === '1' && (
          <FormInput
            label="Ampeeri kulutus (A)"
            value={draft.virta1vaihe}
            onChange={(v) => setDraft((prev) => ({ ...prev, virta1vaihe: v }))}
            placeholder="0.0"
            type="number"
            className="huolto-span-all"
          />
        )}

        {vaiheValinta === '3' && (
          <div className="huolto-span-all">
            <div className="line-form-grid huolto-phase-grid">
              <FormInput label="L1 (A)" value={draft.virtaL1} onChange={(v) => setDraft((prev) => ({ ...prev, virtaL1: v }))} type="number" />
              <FormInput label="L2 (A)" value={draft.virtaL2} onChange={(v) => setDraft((prev) => ({ ...prev, virtaL2: v }))} type="number" />
              <FormInput label="L3 (A)" value={draft.virtaL3} onChange={(v) => setDraft((prev) => ({ ...prev, virtaL3: v }))} type="number" />
            </div>
            {imbalance && imbalance.level !== 'ok' ? (
              <div className={`huolto-alert huolto-alert-${imbalance.level}`}>
                Vaihevirta epätasainen ({imbalance.percentage.toFixed(1)} %)
              </div>
            ) : null}
          </div>
        )}

        <label className="huolto-span-all">
          Ohjaustapa
          <select
            value={draft.ohjaustapa}
            onChange={(e) => setDraft((prev) => ({ ...prev, ohjaustapa: e.target.value }))}
          >
            {ohjaustapaOptions.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        {draft.ohjaustapa === 'suorakaynnistys' && (
          <>
            <FormCheckbox
              label="Kontaktorit tarkastettu"
              checked={draft.kontaktoritTarkastettu}
              onChange={(v) => setDraft((prev) => ({ ...prev, kontaktoritTarkastettu: v }))}
            />
            <FormInput
              label="Kontaktorin tyyppi"
              value={draft.kontaktoriTyyppi}
              onChange={(v) => setDraft((prev) => ({ ...prev, kontaktoriTyyppi: v }))}
            />
          </>
        )}

        {draft.ohjaustapa === 'pehmokaynnistys' && (
          <>
            <FormCheckbox
              label="Pehmokäynnistin tarkastettu"
              checked={draft.pehmokaynnistinTarkastettu}
              onChange={(v) => setDraft((prev) => ({ ...prev, pehmokaynnistinTarkastettu: v }))}
            />
            <FormInput
              label="Pehmokäynnistimen tyyppi/malli"
              value={draft.pehmokaynnistinTyyppi}
              onChange={(v) => setDraft((prev) => ({ ...prev, pehmokaynnistinTyyppi: v }))}
            />
          </>
        )}

        {draft.ohjaustapa === 'taajuusmuuttaja' && (
          <>
            <FormCheckbox
              label="Taajuusmuuttaja tarkastettu"
              checked={draft.taajuusmuuttajaTarkastettu}
              onChange={(v) => setDraft((prev) => ({ ...prev, taajuusmuuttajaTarkastettu: v }))}
            />
            <FormInput
              label="Taajuusmuuttajan tyyppi/malli"
              value={draft.taajuusmuuttajaTyyppi}
              onChange={(v) => setDraft((prev) => ({ ...prev, taajuusmuuttajaTyyppi: v }))}
            />
          </>
        )}

        {draft.ohjaustapa === 'muu' && (
          <FormInput
            label="Ohjaustapa (vapaamuotoinen kuvaus)"
            value={draft.ohjaustapaMuu}
            onChange={(v) => setDraft((prev) => ({ ...prev, ohjaustapaMuu: v }))}
            className="huolto-span-all"
          />
        )}

        <FormCheckbox
          label="Öljy määrä oikea"
          checked={draft.oljyMaaraOikea}
          onChange={(v) => setDraft((prev) => ({ ...prev, oljyMaaraOikea: v }))}
        />
        <FormCheckbox
          label="Öljy kirkas"
          checked={draft.oljyKirkas}
          onChange={(v) => setDraft((prev) => ({ ...prev, oljyKirkas: v }))}
        />
        <FormInput
          label="Öljy määrä/Laatu"
          value={draft.oljyMaaraLaatu}
          onChange={(v) => setDraft((prev) => ({ ...prev, oljyMaaraLaatu: v }))}
        />
      </div>

      {variant === 'print' ? (
        <PrintInspectionBlock label="Tarkastuksen tulos">
          <BinaryInspectionToggle name={`kompressori-${number}-tila`} value={okChoice} onChange={onOkChoice} />
        </PrintInspectionBlock>
      ) : (
        <div className="konvektori-tarkastus-item">
          <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
          <BinaryInspectionToggle name={`kompressori-${number}-tila`} value={okChoice} onChange={onOkChoice} />
        </div>
      )}

      {okChoice === false ? (
        variant === 'print' ? (
          <PrintGridField label="Mikä on vikana?" className="huolto-span-all">
            <textarea
              rows={3}
              value={draft.tarkastusHuomio ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
              placeholder="Kuvaile vika…"
            />
          </PrintGridField>
        ) : (
          <label className="konvektori-huomio-field">
            <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
            <textarea
              rows={3}
              value={draft.tarkastusHuomio ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
              placeholder="Kuvaile vika…"
            />
          </label>
        )
      ) : null}
    </>
  );
}

export function CompressorModule({
  number,
  data,
  onChange,
  lockManufacturerModel = false,
  titleLabel,
  documentUnitKey,
  hidePartRow = false,
}: CompressorModuleProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const [okChoice, setOkChoice] = useState<boolean | null>(null);

  const title = titleLabel ?? `Kompressori ${number}`;
  const status = compressorInspectionStatus(data);
  const subtitle = [data.valmistaja, data.malli].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ');

  const setInspectionOk = useCallback((next: boolean) => {
    const tila: Exclude<HuoltoInspectionStatus, null | 'na'> = next ? 'ok' : 'faulty';
    setOkChoice(next);
    setDraft((prev) => ({ ...prev, tarkastusTila: tila }));
  }, []);

  useEffect(() => {
    if (dialogOpen) {
      setDraft(data);
      setOkChoice(binaryChoiceFromStatus(compressorInspectionStatus(data)));
    }
  }, [dialogOpen, data]);

  const closeDialog = useCallback(() => {
    if (okChoice !== null) onChange(draft);
    setDialogOpen(false);
  }, [okChoice, draft, onChange]);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  return (
    <>
      {!hidePartRow ? (
        <HuoltoPartInspectionRow
          title={title}
          subtitle={subtitle || undefined}
          status={status}
          onInspect={openDialog}
        />
      ) : null}

      <HuoltoInspectionDialogShell
        open={dialogOpen}
        title={title}
        titleId={`compressor-dialog-title-${number}`}
        onClose={closeDialog}
      >
        <p className="muted konvektori-dialog-help">
          Täytä kompressorin tiedot ja merkitse lopuksi kunnossa tai ei kunnossa.
        </p>

        <CompressorFormFields
          draft={draft}
          setDraft={setDraft}
          number={number}
          lockManufacturerModel={lockManufacturerModel}
          okChoice={okChoice}
          onOkChoice={setInspectionOk}
          variant="dialog"
        />
      </HuoltoInspectionDialogShell>
    </>
  );
}
