import { useCallback, useEffect, useState } from 'react';
import { lauhdutinTypeOptions, puhallinOhjausOptions, LAUHDUTIN_PAINEVENTTIILI_HELP, LAUHDUTIN_PAINEVENTTIILI_LABEL, LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL } from '../../lib/huoltoRaportti/constants';
import type { CondenserData, LauhdutinType, PuhallinOhjausType } from '../../lib/huoltoRaportti/types';
import {
  condenserInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { PRINT_BOX_COLORS } from '../../lib/huoltoRaportti/printBoxColors';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { EvaporatorPuhaltimetFields } from './EvaporatorPuhaltimetFields';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';
import {
  PrintGridField,
  PrintInspectionBlock,
  PrintSubBox,
} from './print/MaintenancePrintLayout';

interface Props {
  index: number;
  titleLabel: string;
  data: CondenserData;
  onChange: (data: CondenserData) => void;
}

export function CondenserModule({ index, titleLabel, data, onChange }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const status = condenserInspectionStatus(data);
  const subtitle = lauhdutinTypeOptions.find((o) => o.value === data.tyyppi)?.label ?? '';

  useEffect(() => {
    if (dialogOpen) setDraft(data);
  }, [dialogOpen, data]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? condenserInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const isAirType = draft.tyyppi === 'koneseen_integroitu' || draft.tyyppi === 'erillinen_ilma';
  const isLiquidType = draft.tyyppi === 'nestekiertoinen';

  const inlineSetDraft = useCallback(
    (updater: CondenserData | ((prev: CondenserData) => CondenserData)) => {
      const next = typeof updater === 'function' ? updater(data) : updater;
      onChange(next);
    },
    [data, onChange],
  );

  const renderDetails = (
    source: CondenserData,
    setSource: (updater: CondenserData | ((prev: CondenserData) => CondenserData)) => void,
    sourceStatus: ReturnType<typeof normalizeHuoltoInspectionStatus>,
  ) => {
    const detailsVisible = sourceStatus === 'ok' || sourceStatus === 'faulty';
    const airType = source.tyyppi === 'koneseen_integroitu' || source.tyyppi === 'erillinen_ilma';
    const liquidType = source.tyyppi === 'nestekiertoinen';

    if (!detailsVisible) return null;

    return (
      <>
        <div className="line-form-grid">
          <label className="huolto-span-all">
            Lauhdutin tyyppi
            <select
              value={source.tyyppi || ''}
              onChange={(e) =>
                setSource((prev) => ({
                  ...prev,
                  tyyppi: (e.target.value || undefined) as LauhdutinType | undefined,
                }))
              }
            >
              {lauhdutinTypeOptions.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <FormCheckbox
            label="Lauhdutin puhdistettu"
            checked={!!source.lauhdutinPuhdistettu}
            onChange={(checked) => setSource((prev) => ({ ...prev, lauhdutinPuhdistettu: checked }))}
          />

          {source.lauhdutinPuhdistettu ? (
            <FormInput
              label="Puhdistustapa"
              value={source.lauhdutinPuhdistusTapa || ''}
              onChange={(v) => setSource((prev) => ({ ...prev, lauhdutinPuhdistusTapa: v }))}
              className="huolto-span-all"
            />
          ) : null}
        </div>

        {airType ? (
          <>
            <div className="line-form-grid">
              <label className="huolto-span-all">
                Puhaltimen ohjaustapa
                <select
                  value={source.puhallinOhjaus || ''}
                  onChange={(e) =>
                    setSource((prev) => ({
                      ...prev,
                      puhallinOhjaus: (e.target.value || undefined) as PuhallinOhjausType | undefined,
                    }))
                  }
                >
                  {puhallinOhjausOptions.map((opt) => (
                    <option key={opt.value || 'empty'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {source.puhallinOhjaus === 'muu' ? (
                <FormInput
                  label="Muu ohjaus"
                  value={source.puhallinOhjausMuu || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, puhallinOhjausMuu: v }))}
                  className="huolto-span-all"
                />
              ) : null}

              {source.puhallinOhjaus === 'nopeussäädin' ? (
                <FormInput
                  label="Nopeussäätimen malli"
                  value={source.nopeussäädinMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, nopeussäädinMalli: v }))}
                />
              ) : null}

              {source.puhallinOhjaus === 'taajusmuuntaja' ? (
                <FormInput
                  label="Taajusmuuntajan malli"
                  value={source.taajusmuuntajaMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, taajusmuuntajaMalli: v }))}
                />
              ) : null}

              {source.puhallinOhjaus === 'kp_pressostaatti' ? (
                <FormInput
                  label="KP-pressostaatin malli"
                  value={source.kpPressostaattiMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, kpPressostaattiMalli: v }))}
                />
              ) : null}

              <FormCheckbox
                label="Talvivarustus"
                checked={!!source.talvivarustus}
                onChange={(checked) => setSource((prev) => ({ ...prev, talvivarustus: checked }))}
              />

              {source.talvivarustus ? (
                <FormInput
                  label="Talvivarustuksen toteutustapa"
                  value={source.talvivarustusTapa || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, talvivarustusTapa: v }))}
                  className="huolto-span-all"
                />
              ) : null}
            </div>

            <EvaporatorPuhaltimetFields
              puhaltimienMaara={source.puhaltimienMaara || 1}
              puhaltimet={source.puhaltimet || []}
              onChange={(patch) =>
                setSource((prev) => ({
                  ...prev,
                  puhaltimienMaara: patch.puhaltimienMaara ?? prev.puhaltimienMaara,
                  puhaltimet: patch.puhaltimet ?? prev.puhaltimet,
                }))
              }
            />
          </>
        ) : null}

        {liquidType ? (
          <div className="huolto-submodule">
            <h4>Nestekiertoinen lauhdutin</h4>
            <p className="muted huolto-help">{LAUHDUTIN_PAINEVENTTIILI_HELP}</p>
            <div className="line-form-grid">
              <FormCheckbox
                label={LAUHDUTIN_PAINEVENTTIILI_LABEL}
                checked={!!source.painesäätimenTarkistettu}
                onChange={(checked) => setSource((prev) => ({ ...prev, painesäätimenTarkistettu: checked }))}
              />

              {source.painesäätimenTarkistettu ? (
                <FormInput
                  label={LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL}
                  value={source.painesäätimenMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, painesäätimenMalli: v }))}
                />
              ) : null}

              <FormCheckbox
                label="Virtaus riittävä"
                checked={source.virtausRiittävä !== false}
                onChange={(checked) => setSource((prev) => ({ ...prev, virtausRiittävä: checked }))}
              />

              {source.virtausRiittävä === false ? (
                <FormInput
                  label="Kuvaile virtausongelma"
                  value={source.virtausOngelma || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, virtausOngelma: v }))}
                  className="huolto-span-all"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {sourceStatus === 'faulty' ? (
          <PrintGridField label="Mikä on vikana?" className="huolto-span-all">
            <textarea
              rows={3}
              value={source.tarkastusHuomio ?? ''}
              onChange={(e) => setSource((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
            />
          </PrintGridField>
        ) : null}
      </>
    );
  };

  if (printLayout) {
    const inlineStatus = normalizeHuoltoInspectionStatus(data.tarkastusTila) ?? condenserInspectionStatus(data);
    return (
      <PrintSubBox title={titleLabel.toUpperCase()} accent={PRINT_BOX_COLORS.condenser}>
        <PrintInspectionBlock label="Tarkastuksen tulos">
          <TriStateInspectionToggle
            name={`cond-${index}-tila-inline`}
            value={inlineStatus}
            onChange={(next: Exclude<HuoltoInspectionStatus, null>) => onChange({ ...data, tarkastusTila: next })}
          />
        </PrintInspectionBlock>
        {renderDetails(data, inlineSetDraft, inlineStatus)}
      </PrintSubBox>
    );
  }

  return (
    <>
      <HuoltoPartInspectionRow
        title={titleLabel}
        subtitle={subtitle || undefined}
        status={status}
        onInspect={() => setDialogOpen(true)}
      />

      {dialogOpen ? (
        <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={() => setDialogOpen(false)}>
          <div
            className="leave-draft-dialog panel konvektori-tarkastus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`cond-dialog-title-${index}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`cond-dialog-title-${index}`}>{titleLabel}</h2>

            <div className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
              <TriStateInspectionToggle
                name={`cond-${index}-tila`}
                value={draftStatus}
                onChange={(next: Exclude<HuoltoInspectionStatus, null>) =>
                  setDraft((prev) => ({ ...prev, tarkastusTila: next }))
                }
              />
            </div>

            {showDetails ? (
              <>
                <div className="line-form-grid">
                  <label className="huolto-span-all">
                    Lauhdutin tyyppi
                    <select
                      value={draft.tyyppi || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          tyyppi: (e.target.value || undefined) as LauhdutinType | undefined,
                        }))
                      }
                    >
                      {lauhdutinTypeOptions.map((opt) => (
                        <option key={opt.value || 'empty'} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <FormCheckbox
                    label="Lauhdutin puhdistettu"
                    checked={!!draft.lauhdutinPuhdistettu}
                    onChange={(checked) => setDraft((prev) => ({ ...prev, lauhdutinPuhdistettu: checked }))}
                  />

                  {draft.lauhdutinPuhdistettu ? (
                    <FormInput
                      label="Puhdistustapa"
                      value={draft.lauhdutinPuhdistusTapa || ''}
                      onChange={(v) => setDraft((prev) => ({ ...prev, lauhdutinPuhdistusTapa: v }))}
                      className="huolto-span-all"
                    />
                  ) : null}
                </div>

                {isAirType ? (
                  <>
                    <div className="line-form-grid">
                      <label className="huolto-span-all">
                        Puhaltimen ohjaustapa
                        <select
                          value={draft.puhallinOhjaus || ''}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              puhallinOhjaus: (e.target.value || undefined) as PuhallinOhjausType | undefined,
                            }))
                          }
                        >
                          {puhallinOhjausOptions.map((opt) => (
                            <option key={opt.value || 'empty'} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {draft.puhallinOhjaus === 'muu' ? (
                        <FormInput
                          label="Muu ohjaus"
                          value={draft.puhallinOhjausMuu || ''}
                          onChange={(v) => setDraft((prev) => ({ ...prev, puhallinOhjausMuu: v }))}
                          className="huolto-span-all"
                        />
                      ) : null}

                      {draft.puhallinOhjaus === 'nopeussäädin' ? (
                        <FormInput
                          label="Nopeussäätimen malli"
                          value={draft.nopeussäädinMalli || ''}
                          onChange={(v) => setDraft((prev) => ({ ...prev, nopeussäädinMalli: v }))}
                        />
                      ) : null}

                      {draft.puhallinOhjaus === 'taajusmuuntaja' ? (
                        <FormInput
                          label="Taajusmuuntajan malli"
                          value={draft.taajusmuuntajaMalli || ''}
                          onChange={(v) => setDraft((prev) => ({ ...prev, taajusmuuntajaMalli: v }))}
                        />
                      ) : null}

                      {draft.puhallinOhjaus === 'kp_pressostaatti' ? (
                        <FormInput
                          label="KP-pressostaatin malli"
                          value={draft.kpPressostaattiMalli || ''}
                          onChange={(v) => setDraft((prev) => ({ ...prev, kpPressostaattiMalli: v }))}
                        />
                      ) : null}

                      <FormCheckbox
                        label="Talvivarustus"
                        checked={!!draft.talvivarustus}
                        onChange={(checked) => setDraft((prev) => ({ ...prev, talvivarustus: checked }))}
                      />

                      {draft.talvivarustus ? (
                        <FormInput
                          label="Talvivarustuksen toteutustapa"
                          value={draft.talvivarustusTapa || ''}
                          onChange={(v) => setDraft((prev) => ({ ...prev, talvivarustusTapa: v }))}
                          className="huolto-span-all"
                        />
                      ) : null}
                    </div>

                    <EvaporatorPuhaltimetFields
                      puhaltimienMaara={draft.puhaltimienMaara || 1}
                      puhaltimet={draft.puhaltimet || []}
                      onChange={(patch) =>
                        setDraft((prev) => ({
                          ...prev,
                          puhaltimienMaara: patch.puhaltimienMaara ?? prev.puhaltimienMaara,
                          puhaltimet: patch.puhaltimet ?? prev.puhaltimet,
                        }))
                      }
                    />
                  </>
                ) : null}

                {isLiquidType ? (
                  <div className="huolto-submodule">
                    <h4>Nestekiertoinen lauhdutin</h4>
                    <p className="muted huolto-help">{LAUHDUTIN_PAINEVENTTIILI_HELP}</p>
                    <div className="line-form-grid">
                      <FormCheckbox
                        label={LAUHDUTIN_PAINEVENTTIILI_LABEL}
                        checked={!!draft.painesäätimenTarkistettu}
                        onChange={(checked) => setDraft((prev) => ({ ...prev, painesäätimenTarkistettu: checked }))}
                      />

                      {draft.painesäätimenTarkistettu ? (
                        <FormInput
                          label={LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL}
                          value={draft.painesäätimenMalli || ''}
                          onChange={(v) => setDraft((prev) => ({ ...prev, painesäätimenMalli: v }))}
                        />
                      ) : null}

                      <FormCheckbox
                        label="Virtaus riittävä"
                        checked={draft.virtausRiittävä !== false}
                        onChange={(checked) => setDraft((prev) => ({ ...prev, virtausRiittävä: checked }))}
                      />

                      {draft.virtausRiittävä === false ? (
                        <FormInput
                          label="Kuvaile virtausongelma"
                          value={draft.virtausOngelma || ''}
                          onChange={(v) => setDraft((prev) => ({ ...prev, virtausOngelma: v }))}
                          className="huolto-span-all"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {draftStatus === 'faulty' ? (
              <label className="konvektori-huomio-field">
                <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
                <textarea
                  rows={3}
                  value={draft.tarkastusHuomio ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
                />
              </label>
            ) : null}

            <div className="leave-draft-actions konvektori-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>
                Peruuta
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={draftStatus === null}
                onClick={() => {
                  onChange(draft);
                  setDialogOpen(false);
                }}
              >
                Tallenna
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
