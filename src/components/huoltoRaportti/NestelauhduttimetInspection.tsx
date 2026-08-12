import { useEffect } from 'react';
import { createEmptyNestelauhdutinUnit } from '../../lib/huoltoRaportti/defaults';
import {
  nestelauhduttimetSummaryRows,
  moduleSummaryComplete,
} from '../../lib/huoltoRaportti/moduleSummaryRows';
import {
  nestelauhdutinInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import type { NestelauhdutinUnitData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModuleSummaryPanel } from './HuoltoModuleSummaryPanel';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { NestelauhdutinUnitFields } from './NestelauhdutinUnitFields';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  title: string;
  units: NestelauhdutinUnitData[];
  shared?: boolean;
  onChange: (units: NestelauhdutinUnitData[]) => void;
  documentModuleKey?: string;
}

function unitsComplete(units: NestelauhdutinUnitData[]): boolean {
  if (units.length === 0) return false;
  return units.every((unit) => {
    const status =
      normalizeHuoltoInspectionStatus(unit.tarkastusTila) ?? nestelauhdutinInspectionStatus(unit);
    return moduleSummaryComplete(status);
  });
}

function unitsCanSave(units: NestelauhdutinUnitData[]): boolean {
  return units.length > 0 && units.every((unit) => nestelauhdutinInspectionStatus(unit) !== null);
}

export function NestelauhduttimetInspection({
  title,
  units,
  shared = false,
  onChange,
  documentModuleKey,
}: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;
  const lkm = shared ? 1 : Math.min(4, Math.max(1, units.length || 1));
  const visibleUnits = units.slice(0, lkm);
  const aggregateStatus = unitsComplete(visibleUnits) ? ('ok' as const) : null;

  useEffect(() => {
    if (units.length > 0) return;
    onChange([createEmptyNestelauhdutinUnit()]);
  }, [units.length, onChange]);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: units,
    onChange,
    canSave: unitsCanSave,
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const draftLkm = shared ? 1 : Math.min(4, Math.max(1, draft.length || 1));

  const setDraftLkm = (n: number) => {
    const nextN = Math.min(4, Math.max(1, n));
    setDraft((prev) => {
      const next = [...prev];
      if (nextN > next.length) {
        while (next.length < nextN) next.push(createEmptyNestelauhdutinUnit());
      } else {
        next.length = nextN;
      }
      return next;
    });
  };

  const patchUnit = (idx: number, unit: NestelauhdutinUnitData) => {
    setDraft((prev) => {
      const next = [...prev];
      next[idx] = unit;
      return next;
    });
  };

  const summaryRows = nestelauhduttimetSummaryRows(visibleUnits);

  return (
    <>
      {hideLauncher ? (
        <HuoltoModuleSummaryPanel
          rows={summaryRows}
          complete={unitsComplete(visibleUnits)}
          onEdit={openDialog}
          editLabel="Muokkaa nestelauhduttimet"
        />
      ) : (
        <HuoltoPartInspectionRow title={title} status={aggregateStatus} onInspect={openDialog} />
      )}

      <HuoltoInspectionDialogShell open={open} title={title} onClose={closeDialog}>
        {!shared ? (
          <div className="huolto-submodule">
            <label>
              Nestelauhduttimien lukumäärä
              <select value={draftLkm} onChange={(e) => setDraftLkm(parseInt(e.target.value, 10))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} kpl
                  </option>
                ))}
              </select>
            </label>
            <p className="muted huolto-help">Valitse 1–4 moduulia vastaamaan ulkona olevia nestelauhdutinyksiköitä.</p>
          </div>
        ) : (
          <p className="muted huolto-help">
            Yhteinen nestelauhdutus kaikille kylmäainepiireille — yksi nestelauhdutinyksikkö.
          </p>
        )}

        {draft.slice(0, draftLkm).map((unit, uidx) => {
          const draftStatus =
            normalizeHuoltoInspectionStatus(unit.tarkastusTila) ?? nestelauhdutinInspectionStatus(unit);
          const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';

          return (
            <div key={unit.id} className="huolto-submodule huolto-span-all">
              <h4>Nestelauhdutin {uidx + 1}</h4>
              <div className="konvektori-tarkastus-item">
                <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
                <TriStateInspectionToggle
                  name={`neste-${uidx}-tila`}
                  value={draftStatus}
                  onChange={(next: Exclude<HuoltoInspectionStatus, null>) =>
                    patchUnit(uidx, { ...unit, tarkastusTila: next })
                  }
                />
              </div>

              {showDetails ? (
                <NestelauhdutinUnitFields
                  unit={unit}
                  onChange={(updater) =>
                    patchUnit(uidx, typeof updater === 'function' ? updater(unit) : updater)
                  }
                />
              ) : null}

              {draftStatus === 'faulty' ? (
                <label className="konvektori-huomio-field">
                  <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
                  <textarea
                    rows={3}
                    value={unit.tarkastusHuomio ?? ''}
                    onChange={(e) => patchUnit(uidx, { ...unit, tarkastusHuomio: e.target.value })}
                  />
                </label>
              ) : null}
            </div>
          );
        })}
      </HuoltoInspectionDialogShell>
    </>
  );
}
