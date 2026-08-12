import { useCallback, useEffect, useState } from 'react';
import type { NestelauhdutinUnitData } from '../../lib/huoltoRaportti/types';
import {
  nestelauhdutinInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { NestelauhdutinUnitFields } from './NestelauhdutinUnitFields';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  index: number;
  unit: NestelauhdutinUnitData;
  onChange: (unit: NestelauhdutinUnitData) => void;
}

export function NestelauhdutinUnitModule({ index, unit, onChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(unit);
  const status = nestelauhdutinInspectionStatus(unit);
  const subtitle = [unit.valmistaja, unit.malli].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ');

  useEffect(() => {
    if (dialogOpen) setDraft(unit);
  }, [dialogOpen, unit]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? nestelauhdutinInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';

  const closeDialog = useCallback(() => {
    const status = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? nestelauhdutinInspectionStatus(draft);
    if (status !== null) onChange(draft);
    setDialogOpen(false);
  }, [draft, onChange]);

  return (
    <>
      <HuoltoPartInspectionRow
        title={`Nestelauhdutin ${index + 1}`}
        subtitle={subtitle || undefined}
        status={status}
        onInspect={() => setDialogOpen(true)}
      />

      <HuoltoInspectionDialogShell
        open={dialogOpen}
        title={`Nestelauhdutin ${index + 1}`}
        titleId={`neste-dialog-title-${index}`}
        onClose={closeDialog}
      >
        <div className="konvektori-tarkastus-item">
          <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
          <TriStateInspectionToggle
            name={`neste-${index}-tila`}
            value={draftStatus}
            onChange={(next: Exclude<HuoltoInspectionStatus, null>) =>
              setDraft((prev) => ({ ...prev, tarkastusTila: next }))
            }
          />
        </div>

        {showDetails ? <NestelauhdutinUnitFields unit={draft} onChange={setDraft} /> : null}

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
      </HuoltoInspectionDialogShell>
    </>
  );
}
