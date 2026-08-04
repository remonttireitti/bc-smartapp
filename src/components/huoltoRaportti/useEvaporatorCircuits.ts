import { useEffect, useRef } from 'react';

import type { EvaporatorData, HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyEvaporatorData } from '../../lib/huoltoRaportti/defaults';
import { isChillerLikeDevice, isSharedEvaporatorAcrossCircuits } from '../../lib/huoltoRaportti/deviceModuleLogic';
import { getEvaporatorCircuitCount } from '../../lib/huoltoRaportti/evaporatorHelpers';
import { hoyrystinUnitTitle } from '../../lib/huoltoRaportti/sectionTitles';

export function evaporatorTitleForIndex(form: HuoltoReportData, index: number): string {
  if (isSharedEvaporatorAcrossCircuits(form.laiteTyyppi, form.hoyrystinYhteinenPiireissa) && index === 0) {
    if (isChillerLikeDevice(form.laiteTyyppi)) {
      return '4.1 Höyrystin (yhteinen kaikille piireille)';
    }
    return 'Höyrystin (yhteinen kaikille piireille)';
  }
  return hoyrystinUnitTitle(form.laiteTyyppi, index);
}

export { getEvaporatorCircuitCount } from '../../lib/huoltoRaportti/evaporatorHelpers';

export function createEvaporatorActions(
  form: HuoltoReportData,
  onChange: (patch: Partial<HuoltoReportData>) => void,
) {
  function updateEvaporator(index: number, data: EvaporatorData) {
    const next = [...form.evaporatorData];
    next[index] = data;
    onChange({ evaporatorData: next });
  }

  function setCount(count: number) {
    const next =
      count > form.evaporatorData.length
        ? [
            ...form.evaporatorData,
            ...Array.from({ length: count - form.evaporatorData.length }, () =>
              createEmptyEvaporatorData(form.laiteTyyppi),
            ),
          ]
        : form.evaporatorData.slice(0, count);
    onChange({ evaporatorData: next });
  }

  function setSameAsFirst(index: number, value: boolean) {
    const flags = [...form.evaporatorSamaKuinEnsimmainen];
    while (flags.length <= index) flags.push(false);
    flags[index] = value;
    onChange({ evaporatorSamaKuinEnsimmainen: flags });
  }

  return { updateEvaporator, setCount, setSameAsFirst };
}

const SYNC_FIELDS: (keyof EvaporatorData)[] = [
  'tyyppi',
  'valmistaja',
  'malli',
  'sarjanumero',
  'sulatus',
  'sahkoJannite',
  'sulatusOhjaus',
  'sulatusOhjausMuu',
  'sulatusKelloMalli',
  'sulatusSäädinMalli',
];

function copyFromFirst(row: EvaporatorData, first: EvaporatorData): EvaporatorData {
  return {
    ...row,
    tyyppi: first.tyyppi,
    valmistaja: first.valmistaja,
    malli: first.malli,
    sarjanumero: first.sarjanumero,
    sulatus: first.sulatus,
    sahkoJannite: first.sahkoJannite,
    sulatusOhjaus: first.sulatusOhjaus,
    sulatusOhjausMuu: first.sulatusOhjausMuu,
    sulatusKelloMalli: first.sulatusKelloMalli,
    sulatusSäädinMalli: first.sulatusSäädinMalli,
  };
}

function needsCopyFromFirst(row: EvaporatorData, first: EvaporatorData): boolean {
  return SYNC_FIELDS.some((field) => row[field] !== first[field]);
}

export function useEvaporatorCircuitsSync(
  form: HuoltoReportData,
  onChange: (patch: Partial<HuoltoReportData>) => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isKylmakoneikko = form.laiteTyyppi === 'kylmäkoneikko';
  const circuitCount = getEvaporatorCircuitCount(form);
  const sharedEvaporator = isSharedEvaporatorAcrossCircuits(
    form.laiteTyyppi,
    form.hoyrystinYhteinenPiireissa,
  );

  useEffect(() => {
    if (isKylmakoneikko) return;
    const patch: Partial<HuoltoReportData> = {};
    let evaporators = form.evaporatorData;
    const flags = form.evaporatorSamaKuinEnsimmainen;

    if (evaporators.length < circuitCount) {
      evaporators = [
        ...evaporators,
        ...Array.from({ length: circuitCount - evaporators.length }, () =>
          createEmptyEvaporatorData(form.laiteTyyppi),
        ),
      ];
      patch.evaporatorData = evaporators;
    } else if (evaporators.length > circuitCount) {
      patch.evaporatorData = evaporators.slice(0, circuitCount);
    }

    const targetEvaporators = patch.evaporatorData ?? evaporators;
    if (targetEvaporators.length !== flags.length) {
      const next = flags.slice(0, circuitCount);
      while (next.length < circuitCount) next.push(false);
      if (next.length > 0) next[0] = false;
      patch.evaporatorSamaKuinEnsimmainen = next;
    }

    if (Object.keys(patch).length > 0) onChangeRef.current(patch);
  }, [
    circuitCount,
    isKylmakoneikko,
    sharedEvaporator,
    form.evaporatorData,
    form.evaporatorSamaKuinEnsimmainen,
  ]);

  useEffect(() => {
    if (sharedEvaporator || form.evaporatorData.length < 2) return;
    const first = form.evaporatorData[0];
    let changed = false;
    const next = form.evaporatorData.map((row, idx) => {
      if (idx === 0 || !form.evaporatorSamaKuinEnsimmainen[idx]) return row;
      if (!needsCopyFromFirst(row, first)) return row;
      changed = true;
      return copyFromFirst(row, first);
    });
    if (changed) onChangeRef.current({ evaporatorData: next });
  }, [form.evaporatorSamaKuinEnsimmainen, form.evaporatorData]);
}
