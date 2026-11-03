import { isLiquidHeatExchangerCondenser, isKonvektoritDevice, usesRefrigerantServiceExtras } from './deviceModuleLogic';
import { getCondenserCount, getEvaporatorCircuitCount } from './evaporatorHelpers';
import { visibleFieldModules, fieldModuleValues, fieldModuleFieldVisible, FIELD_MODULE_FAULT_VALUE } from './fieldModules';
import {
  compressorInspectionStatus,
  condenserInspectionStatus,
  entityInspectionStatus,
  lauhdutuspiiriInspectionStatus,
  mlpKeruupiiriInspectionStatus,
  mlpLampoInspectionStatus,
  mlpLatauspiiriInspectionStatus,
  nestepiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  ulkoyksikkoInspectionStatus,
  vapaajahdytysInspectionStatus,
} from './huoltoInspectionStatus';
import { konvektoriFaultLabels, konvektoriRowIsFaulty } from './konvektoriTarkastus';
import { refrigerantCircuitComponentLabel } from './refrigerantCircuitComponents';
import { SISAYKSIKKO_TARKASTUS_ITEMS, sisayksikkoTarkastusValue } from './sisayksikkoTarkastus';
import type { CompressorData, HuoltoReportData, RefrigerantCircuitData } from './types';

/** Yksi vika: mikä kohta (moduuli / osa) ja lyhyt kuvaus. */
export type ReportFault = { source: string; note: string };

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

const SISAYKSIKKO_VIKA_LABEL = {
  asennettu: 'asennus ei vaatimusten mukainen',
  kennoPuhdas: 'kenno likainen',
  eiAania: 'sivuääniä',
  kondenssiTestattu: 'kondenssiveden poisto ei toimi',
} as const;

/** Rikasteksti / HTML → yksi rivi pelkkää tekstiä. */
export function plainNoteText(value: unknown): string {
  return String(value ?? '')
    .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}


/**
 * Kaikki raporttiin merkityt viat, kaikille laitetyypeille: ulko- ja sisäyksiköt, kylmäainepiirit ja niiden
 * osat, höyrystimet, lauhduttimet, nestepiirit, MLP-piirit, konvektorit, kenttämoduulien "Vika"-valinnat,
 * hylätty tiiveyskoe / tyhjiöinti sekä "Vika"-luonteinen huomio. Vain nykyisessä rakenteessa näkyvät moduulit.
 */
export function collectReportFaults(data: HuoltoReportData): ReportFault[] {
  const faults: ReportFault[] = [];
  try {
    collectInto(data, faults);
  } catch (error) {
    // Vanha / puutteellinen data ei saa estää tulostusta.
    console.error('collectReportFaults', error);
  }
  return faults;
}

function collectInto(data: HuoltoReportData, faults: ReportFault[]): void {
  const add = (source: string, ...notes: unknown[]) => {
    const note = [...new Set(notes.map(plainNoteText).filter(Boolean))].join('; ');
    if (faults.some((f) => f.source === source && f.note === note)) return;
    faults.push({ source, note });
  };
  const sel = data.selectedModules ?? ({} as HuoltoReportData['selectedModules']);
  const faulty = (status: unknown) => normalizeHuoltoInspectionStatus(status) === 'faulty';

  // Lämpöpumppu: ulkoyksikkö + sisäyksiköt
  if (data.laiteTyyppi === 'lämpöpumppu') {
    const ulko = normalizeHuoltoInspectionStatus(data.ulkoyksikkoTarkastusTila) ?? ulkoyksikkoInspectionStatus(data);
    if (ulko === 'faulty') add('Ulkoyksikkö', data.ulkoyksikkoTarkastusHuomio);
    const count = data.sisayksikkoMaara > 0 ? data.sisayksikkoMaara : 1;
    const units = (data.sisayksikkoData ?? []).slice(0, count);
    units.forEach((u, i) => {
      const badItems = SISAYKSIKKO_TARKASTUS_ITEMS.filter((item) => sisayksikkoTarkastusValue(u, item.field) === 'faulty').map((item) => SISAYKSIKKO_VIKA_LABEL[item.field]);
      const isFault = u.huomioTyyppi === 'vika' || badItems.length > 0;
      if (!isFault) return;
      add(units.length > 1 ? `Sisäyksikkö ${i + 1}` : 'Sisäyksikkö', badItems.join(', '), u.huomio);
    });
  }

  // Konvektorit
  if (isKonvektoritDevice(data.laiteTyyppi)) {
    (data.konvektoriRows ?? []).forEach((row, i) => {
      if (!row || !konvektoriRowIsFaulty(row)) return;
      const tunnus = String(row.tunnus ?? '').trim();
      add(`Konvektori ${tunnus || i + 1}`, ...konvektoriFaultLabels(row), row.huomio);
    });
  }

  // Kylmäainepiirit
  if (sel.kylmaainePiiri && data.kylmaainePiireja !== '0' && !isKonvektoritDevice(data.laiteTyyppi)) {
    const n = Math.min(3, Math.max(1, parseInt(data.kylmaainePiireja, 10) || 1));
    const circuits: Array<RefrigerantCircuitData | null | undefined> = [data.kylmaainePiiri1, data.kylmaainePiiri2, data.kylmaainePiiri3];
    circuits.slice(0, n).forEach((kp, ci) => {
      if (!kp || !kp.onKaytossa) return;
      const prefix = n > 1 ? `Piiri ${ci + 1} · ` : '';
      const comps = Math.min(6, Math.max(1, parseInt(kp.kompressorienMaara, 10) || 1));
      for (let k = 1; k <= comps; k += 1) {
        const comp = kp[`kompressori${k}` as keyof RefrigerantCircuitData] as CompressorData | undefined;
        if (comp && compressorInspectionStatus(comp) === 'faulty') add(`${prefix}Kompressori ${k}`, comp.tarkastusHuomio);
      }
      if (faulty(kp.paisuntaventtiiliTila)) add(`${prefix}Paisuntaventtiili`, kp.paisuntaventtiiliHuomio);
      if (faulty(kp.magneettiventtiiliTila)) add(`${prefix}Magneettiventtiili`, kp.magneettiventtiiliHuomio);
      if (faulty(kp.kuivainTila)) add(`${prefix}Kuivain`, kp.kuivainLisatieto);
      for (const c of kp.kompponentit ?? []) {
        if (faulty(c.tila)) add(`${prefix}${refrigerantCircuitComponentLabel(c)}`, c.kommentti);
      }
    });
  }

  // Höyrystimet, lauhduttimet ja nestepiirit
  if (sel.hoyrystin) {
    const count = getEvaporatorCircuitCount(data);
    (data.evaporatorData ?? []).slice(0, count).forEach((ev, i) => {
      if (entityInspectionStatus(ev) === 'faulty') add(count > 1 ? `Höyrystin ${i + 1}` : 'Höyrystin', ev.tarkastusHuomio);
    });
  }
  if (sel.lauhdutin) {
    if (isLiquidHeatExchangerCondenser(data.lauhdutinTyyppiLaite)) {
      if (data.lauhdutuspiiriData && lauhdutuspiiriInspectionStatus(data.lauhdutuspiiriData) === 'faulty') {
        add('Lauhdutuspiiri', data.lauhdutuspiiriData.tarkastusHuomio);
      }
    } else {
      const count = getCondenserCount(data);
      (data.condenserData ?? []).slice(0, count).forEach((co, i) => {
        if (condenserInspectionStatus(co) === 'faulty') add(count > 1 ? `Lauhdutin ${i + 1}` : 'Lauhdutin', co.tarkastusHuomio);
      });
    }
  }
  if (sel.nestelauhduttimet) {
    (data.nestelauhduttimetVj ?? []).forEach((u, i) => {
      if (faulty(u.tarkastusTila)) add(`Nestelauhdutin ${i + 1}`, u.tarkastusHuomio);
    });
  }
  if (sel.vedenjajahdytyskone && data.jaahdytysvesiData && nestepiiriInspectionStatus(data.jaahdytysvesiData) === 'faulty') {
    add('Jäähdytyspiiri', data.jaahdytysvesiData.tarkastusHuomio);
  }
  if (sel.vapaajahdytys && data.vapaajahdytysData && vapaajahdytysInspectionStatus(data.vapaajahdytysData) === 'faulty') {
    add('Vapaajäähdytys', data.vapaajahdytysData.tarkastusHuomio);
  }

  // MLP-piirit
  const mlp = data.mlpData;
  if (mlp && (sel.mlpPiirit || data.laiteTyyppi === 'mlp' || data.laiteTyyppi === 'vesiilmalampopumppu')) {
    if (mlpKeruupiiriInspectionStatus(mlp) === 'faulty') add('Keruupiiri', mlp.keruupiiriTarkastusHuomio);
    if (mlpLatauspiiriInspectionStatus(mlp) === 'faulty') add('Latauspiiri', mlp.latausTarkastusHuomio);
    if (mlpLampoInspectionStatus(mlp) === 'faulty') add('Lämpöpiiri', mlp.lampoTarkastusHuomio);
  }

  // Kenttämoduulien "Vika"-valinnat (VAK, kylmiö, ...)
  for (const def of visibleFieldModules(data)) {
    const values = fieldModuleValues(data, def.id);
    const bad = def.fields
      .filter((f) => f.type === 'select' && fieldModuleFieldVisible(f, values, data) && values[f.id] === FIELD_MODULE_FAULT_VALUE)
      .map((f) => f.label);
    if (bad.length) {
      const textarea = def.fields.find((f) => f.type === 'textarea');
      add(def.title, `vika: ${bad.join(', ')}`, textarea ? values[textarea.id] : '');
    }
  }

  // Hylätty tiiveyskoe / tyhjiöinti
  if (usesRefrigerantServiceExtras(data.laiteTyyppi) || data.laiteTyyppi === 'lämpöpumppu') {
    if (sel.tiiveyskoe && data.tiiveyskoeData?.tulos === 'hylatty') add('Tiiveyskoe hylätty', data.tiiveyskoeData.huom);
    if (sel.tyhjiointi && data.tyhjiointiData?.tulos === 'hylatty') add('Tyhjiöinti hylätty', data.tyhjiointiData.huom);
  }

  // Vika-luonteinen huomio / yleinen vikamerkintä
  const huomiot = plainNoteText(data.huomiot);
  if (data.huomiotLuonne === 'vika' && huomiot) {
    if (!faults.some((f) => f.note === huomiot)) add('Huomio', huomiot);
  } else if (data.huoltoLaiteessaVika && faults.length === 0) {
    add('Laitteessa vika', huomiot);
  }
}

/** Lyhyt yksirivinen muoto: "Ulkoyksikkö — tärisee; Sisäyksikkö 1 — …". */
export function formatFaultsShort(faults: ReportFault[]): string {
  return faults.map((f) => (f.note ? `${f.source} — ${f.note}` : f.source)).join('; ');
}

export function hasReportFaults(data: HuoltoReportData): boolean {
  return collectReportFaults(data).length > 0;
}

