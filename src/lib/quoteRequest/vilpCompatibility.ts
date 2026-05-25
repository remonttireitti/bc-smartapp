import {
  daikinVesiIlmaLampopumput,
  type HeatPumpDevice,
  vesiIlmaLampopumput,
} from '../../data/pumpDeviceCatalog';
import type { QuoteRequestData, VilpIndoorConfig } from './types';

export function getDaikinVilpPackages(): HeatPumpDevice[] {
  return daikinVesiIlmaLampopumput.filter(
    (d) =>
      d.category === 'vesi-ilmalampopumppu' &&
      d.vilpOutdoorModel &&
      d.vilpIndoorModel &&
      d.vilpIndoorType &&
      typeof d.vilpZones === 'number' &&
      typeof d.vilpCooling === 'boolean',
  );
}

export function getDaikinVilpOutdoorOptions(): HeatPumpDevice[] {
  const map = new Map<string, HeatPumpDevice>();
  for (const d of getDaikinVilpPackages()) {
    const key = d.vilpOutdoorModel as string;
    if (!map.has(key)) map.set(key, d);
  }
  return [...map.values()].sort((a, b) => (a.heatingPowerMax || 0) - (b.heatingPowerMax || 0));
}

export function inferIilpNominalKw(device: HeatPumpDevice): number {
  const explicit = Number(device.iilpNominalKw);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit * 10) / 10;

  const invMap: Record<number, number> = { 9: 2.7, 12: 3.6, 18: 5.3, 24: 7.1 };
  if ((device.brand || '').toLowerCase() === 'inventor') {
    const m = String(device.model || device.name || '').match(/\b(09|12|18|24)\b/);
    const code = m ? parseInt(m[1], 10) : NaN;
    if (!Number.isNaN(code) && invMap[code]) return invMap[code];
  }

  if ((device.brand || '').toLowerCase() === 'daikin') {
    const m = String(device.model || '').match(/FTX[A-Z]*?(\d{2})/);
    const code = m ? parseInt(m[1], 10) : NaN;
    if (!Number.isNaN(code) && code >= 20 && code <= 60) return code / 10;
  }

  const v = Math.max(2.0, Math.min(10.0, Number(device.heatingPowerMax) || 0));
  return Math.round(v * 2) / 2;
}

export function normalizeDaikinVilpSelection(q: QuoteRequestData): {
  patch: Partial<QuoteRequestData>;
  selected: HeatPumpDevice | null;
  message: string;
} {
  const outdoor = (q.vilpOutdoorModel || '').trim();
  const patch: Partial<QuoteRequestData> = {};
  let msg = '';

  if (!outdoor) {
    return { patch: {}, selected: null, message: msg };
  }

  const byOutdoor = getDaikinVilpPackages().filter((d) => d.vilpOutdoorModel === outdoor);
  if (!byOutdoor.length) {
    msg = `Ulkoyksikölle ${outdoor} ei löydy määriteltyjä sisäyksikköpaketteja.`;
    return { patch, selected: null, message: msg };
  }

  const desiredIndoorType = (q.vilpIndoorConfig === 'integroitu' ? 'integrated' : 'hydrobox') as
    | 'integrated'
    | 'hydrobox';
  const availableIndoorTypes = Array.from(new Set(byOutdoor.map((d) => d.vilpIndoorType))).filter(
    Boolean,
  ) as Array<'integrated' | 'hydrobox'>;
  const indoorType = availableIndoorTypes.includes(desiredIndoorType)
    ? desiredIndoorType
    : availableIndoorTypes[0] || desiredIndoorType;
  if (indoorType !== desiredIndoorType) {
    patch.vilpIndoorConfig = indoorType === 'integrated' ? 'integroitu' : 'ilman-varaa';
  }
  let candidates = byOutdoor.filter((d) => d.vilpIndoorType === indoorType);

  const availableZones = Array.from(new Set(candidates.map((d) => d.vilpZones))).filter(
    Boolean,
  ) as Array<1 | 2>;
  const zones = availableZones.includes(q.vilpZones) ? q.vilpZones : availableZones[0] || 1;
  if (zones !== q.vilpZones) patch.vilpZones = zones;
  candidates = candidates.filter((d) => d.vilpZones === zones);

  const availableCooling = Array.from(new Set(candidates.map((d) => d.vilpCooling))).filter(
    (v) => typeof v === 'boolean',
  ) as boolean[];
  const cooling = availableCooling.includes(q.vilpCooling)
    ? q.vilpCooling
    : (availableCooling[0] ?? true);
  if (cooling !== q.vilpCooling) patch.vilpCooling = cooling;
  candidates = candidates.filter((d) => d.vilpCooling === cooling);

  const desiredTank = indoorType === 'integrated' ? q.vilpTankLiters || 0 : 0;
  const availableTanks = Array.from(new Set(candidates.map((d) => d.vilpTankLiters || 0))).filter(
    Boolean,
  ) as Array<0 | 180 | 230>;
  const tank =
    indoorType === 'integrated'
      ? availableTanks.includes(desiredTank as 0 | 180 | 230)
        ? (desiredTank as 0 | 180 | 230)
        : availableTanks[0] || 180
      : 0;
  if (tank !== q.vilpTankLiters) patch.vilpTankLiters = tank as 0 | 180 | 230;

  const chosen = candidates.find((d) => (d.vilpTankLiters || 0) === tank) || candidates[0] || null;
  if (chosen) {
    patch.vilpIndoorModel = chosen.vilpIndoorModel || '';
    patch.vilpSeries = chosen.vilpSeries || '';
  }

  return { patch, selected: chosen, message: msg };
}

function brandMatches(device: HeatPumpDevice, brandChoice: string): boolean {
  if (!brandChoice) return true;
  return (device.brand || '').toLowerCase() === brandChoice.toLowerCase();
}

export function filterCompatibleDevicesForQuote(
  devices: HeatPumpDevice[],
  form: QuoteRequestData,
  heatingNeedKw: number | null,
): HeatPumpDevice[] {
  let list = [...devices];

  if (form.type === 'vesi-ilma') {
    const brand = (form.vilpBrandChoice || '').trim();
    if (brand) {
      list = list.filter((d) => brandMatches(d, brand));
    }

    if (brand === 'Daikin' && form.vilpOutdoorModel.trim()) {
      const { selected } = normalizeDaikinVilpSelection(form);
      if (selected) {
        const compatibleIds = new Set(
          getDaikinVilpPackages()
            .filter((d) => d.vilpOutdoorModel === form.vilpOutdoorModel.trim())
            .map((d) => d.id),
        );
        list = list.filter((d) => compatibleIds.has(d.id));
        if (selected && !list.some((d) => d.id === selected.id)) {
          list = [selected, ...list];
        }
      }
    }
  }

  if (form.type === 'ilma-ilma') {
    const brand = (form.vilpBrandChoice || '').trim();
    if (brand) {
      list = list.filter((d) => brandMatches(d, brand));
    }
    if (heatingNeedKw != null && heatingNeedKw > 0) {
      list = list.filter((d) => {
        const nominal = inferIilpNominalKw(d);
        return nominal >= heatingNeedKw * 0.65;
      });
      if (!list.length) {
        list = [...devices].sort(
          (a, b) => inferIilpNominalKw(b) - inferIilpNominalKw(a),
        );
      }
    }
  }

  if (form.type === 'vesi-ilma' && heatingNeedKw != null && heatingNeedKw > 0 && form.vilpBrandChoice !== 'Daikin') {
    const filtered = list.filter((d) => (d.heatingPowerMax || 0) >= heatingNeedKw * 0.65);
    if (filtered.length) list = filtered;
  }

  return list.sort((a, b) => (a.heatingPowerMax || 0) - (b.heatingPowerMax || 0));
}

export function vilpIndoorConfigLabel(config: VilpIndoorConfig): string {
  if (config === 'integroitu') return 'Integroitu varaaja';
  if (config === 'hydrobox') return 'Hydrobox';
  return 'Ilman varaajaa / monoblock';
}

export function inventorVilpDeviceGroups(): {
  hydrobox: HeatPumpDevice[];
  integrated: HeatPumpDevice[];
  monoblock: HeatPumpDevice[];
} {
  const inventor = vesiIlmaLampopumput.filter((d) => (d.brand || '').toLowerCase() === 'inventor');
  return {
    hydrobox: inventor.filter((d) => (d.name || '').includes('(Hydrobox)')),
    integrated: inventor.filter((d) => (d.name || '').includes('(Integroitu')),
    monoblock: inventor.filter(
      (d) => !(d.name || '').includes('(Hydrobox)') && !(d.name || '').includes('(Integroitu'),
    ),
  };
}
