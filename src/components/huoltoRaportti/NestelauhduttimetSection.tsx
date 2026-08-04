import { useEffect } from 'react';
import type { NestelauhdutinUnitData } from '../../lib/huoltoRaportti/types';
import { createEmptyNestelauhdutinUnit } from '../../lib/huoltoRaportti/defaults';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { NestelauhdutinUnitModule } from './NestelauhdutinUnitModule';
import { nestelauhduttimetSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';

interface Props {
  units: NestelauhdutinUnitData[];
  shared?: boolean;
  laiteTyyppi?: string;
  onChange: (next: NestelauhdutinUnitData[]) => void;
}

export function NestelauhduttimetSection({ units, shared = false, laiteTyyppi = '', onChange }: Props) {
  const lkm = shared ? 1 : Math.min(4, Math.max(1, units.length || 1));

  useEffect(() => {
    if (units.length > 0) return;
    onChange([createEmptyNestelauhdutinUnit()]);
  }, [units.length, onChange]);

  const setLkm = (n: number) => {
    const nextN = Math.min(4, Math.max(1, n));
    const next = [...units];
    if (nextN > next.length) {
      while (next.length < nextN) next.push(createEmptyNestelauhdutinUnit());
    } else {
      next.length = nextN;
    }
    onChange(next);
  };

  const patchUnit = (idx: number, unit: NestelauhdutinUnitData) => {
    const next = [...units];
    next[idx] = unit;
    onChange(next);
  };

  return (
    <HuoltoModuleSection moduleKey="nestelauhduttimet" title={nestelauhduttimetSectionTitle(laiteTyyppi)}>
      {!shared && (
        <div className="huolto-submodule">
          <label>
            Nestelauhduttimien lukumäärä
            <select value={lkm} onChange={(e) => setLkm(parseInt(e.target.value, 10))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} kpl
                </option>
              ))}
            </select>
          </label>
          <p className="muted huolto-help">Valitse 1–4 moduulia vastaamaan ulkona olevia nestelauhdutinyksiköitä.</p>
        </div>
      )}
      {shared && (
        <p className="muted huolto-help">
          Yhteinen nestelauhdutus kaikille kylmäainepiireille — yksi nestelauhdutinyksikkö.
        </p>
      )}

      <div className="huolto-part-inspection-list">
        {units.slice(0, lkm).map((unit, uidx) => (
          <NestelauhdutinUnitModule
            key={unit.id}
            index={uidx}
            unit={unit}
            onChange={(next) => patchUnit(uidx, next)}
          />
        ))}
      </div>
    </HuoltoModuleSection>
  );
}
