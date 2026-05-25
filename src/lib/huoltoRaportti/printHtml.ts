import type { CompressorData, EvaporatorData, HuoltoReportData, RefrigerantCircuitData } from './types';
import { isChillerLikeDevice } from './deviceModuleLogic';
import {
  formatTyhjiointiLoppupaine,
  laskeKokeLoppuaikaFi,
  resolveKoePaivamaaraJaKello,
} from './kokeAikaUtils';
import { getCompressorVaiheValinta } from './sahkoVaiheUtils';
import {
  calculateSubcoolingFromMeasurements,
  calculateSuperheatFromMeasurements,
  getRefrigerantGWP,
  renderCheckbox,
} from './utils';

export interface MaintenancePrintMeta {
  companyName: string;
  logoUrl?: string;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function normalizePrintText(val: unknown): string {
  if (val == null) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

function hasPrintableValue(val: unknown): boolean {
  const s = normalizePrintText(val);
  if (!s || s === '-' || s === '—' || s === '–') return false;
  return !/^[-–—]\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\/h)?$/i.test(s);
}

function field(data: HuoltoReportData, key: string): unknown {
  return data[key];
}

function strField(data: HuoltoReportData, key: string): string {
  return normalizePrintText(field(data, key));
}

function box(title: string, color: string, inner: string): string {
  if (!inner.trim()) return '';
  return `
  <div class="box-content" style="border-color:${color};page-break-inside:avoid;margin-top:8px;">
    <div style="border-bottom:2px solid ${color};padding-bottom:2px;margin-bottom:4px;">
      <strong style="font-size:14px;color:${color};">${esc(title)}</strong>
    </div>
    <div style="font-size:11px;line-height:1.45;">${inner}</div>
  </div>`;
}

function row(label: string, val: unknown, borderColor = '#ccc'): string {
  if (!hasPrintableValue(val)) return '';
  return `<div style="border-bottom:1px solid ${borderColor};padding:2px 0;">${esc(label)}: ${esc(val)}</div>`;
}

function gridField(label: string, val: unknown): string {
  if (!hasPrintableValue(val)) return '';
  return `<div><div style="color:#666;margin-bottom:2px;">${esc(label)}</div>
    <div style="padding:6px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;">${esc(val)}</div></div>`;
}

function checkRow(checked: boolean | undefined, label: string): string {
  const html = renderCheckbox(checked, label);
  return html ? `<div style="padding:2px 0;">${html}</div>` : '';
}

function getSulatusText(sulatus: string): string {
  if (sulatus === 'ilma') return 'Ilmasulatus';
  if (sulatus === 'sahko') return 'Sähkösulatus';
  return 'Kuumakaasu sulatus';
}

function getLauhdutinTypeText(tyyppi: string): string {
  if (tyyppi === 'koneseen_integroitu') return 'Koneseen integroitu ilmalauhdutin';
  if (tyyppi === 'erillinen_ilma') return 'Erillinen ilmalauhdutin';
  return 'Nestekiertoinen lauhdutin';
}

function getOhjausText(ohjaus: string, muu?: string): string {
  const map: Record<string, string> = {
    nopeussäädin: 'Nopeussäädin',
    taajusmuuntaja: 'Taajusmuuntaja',
    kp_pressostaatti: 'KP-pressostaatti',
    kompressorin_yhtaaikaa: 'Puhallin toimii kompressorin kanssa yhtä aikaa',
    muu: muu ? `Muu: ${muu}` : 'Muu',
  };
  return map[ohjaus] ?? ohjaus;
}

function renderCompressorBlock(comp: Partial<CompressorData>, index: number): string {
  const parts = [
    gridField('Valmistaja', comp.valmistaja),
    gridField('Malli', comp.malli),
    gridField('Ohjaustapa', comp.ohjaustapa),
    gridField('Kontaktori', comp.kontaktoriTyyppi),
    gridField('Pehmokäynnistin', comp.pehmokaynnistinTyyppi),
    gridField('Taajuusmuuttaja', comp.taajuusmuuttajaTyyppi),
  ].filter(Boolean);
  const checks = [checkRow(comp.oljyMaaraOikea, 'Öljy määrä oikea'), checkRow(comp.oljyKirkas, 'Öljy kirkas')].filter(Boolean);
  const vv = getCompressorVaiheValinta(comp);
  const syotto =
    vv === '1' || vv === '3'
      ? `<div style="margin:4px 0;font-size:11px;">Syöttö: <strong>${vv === '3' ? '3-vaiheinen' : '1-vaiheinen'}</strong></div>`
      : '';
  const virta =
    vv === '1' && hasPrintableValue(comp.virta1vaihe)
      ? gridField('Virta (A)', comp.virta1vaihe)
      : vv === '3'
        ? [gridField('L1 (A)', comp.virtaL1), gridField('L2 (A)', comp.virtaL2), gridField('L3 (A)', comp.virtaL3)]
            .filter(Boolean)
            .join('')
        : '';
  if (!parts.length && !checks.length && !syotto && !virta) return '';
  return `<div style="margin-bottom:8px;padding:8px;background:#fff8f0;border:1px solid #ffe0b2;border-radius:4px;">
    <div style="font-weight:bold;color:#E64A19;margin-bottom:4px;">Kompressori ${index}</div>
    ${parts.length ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:6px;">${parts.join('')}</div>` : ''}
    ${checks.join('')}${syotto}${virta ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${virta}</div>` : ''}
  </div>`;
}

function renderCircuitHtml(
  circuitNum: number,
  kp: RefrigerantCircuitData | null | undefined,
  refrigerant: string,
): string {
  if (!kp || !kp.onKaytossa) return '';
  const sh =
    calculateSuperheatFromMeasurements(
      parseFloat(kp.imupaine) || 0,
      parseFloat(kp.imuLampotila) || 0,
      refrigerant,
    )?.toFixed(1) ?? '-';
  const sc =
    calculateSubcoolingFromMeasurements(
      parseFloat(kp.korkeapaine) || 0,
      parseFloat(kp.nestePutkiLampotila) || 0,
      refrigerant,
    )?.toFixed(1) ?? '-';

  const paineGrid = [
    gridField('Imupaine (bar)', kp.imupaine),
    gridField('Korkeapaine (bar)', kp.korkeapaine),
    gridField('Imulämpötila (°C)', kp.imuLampotila),
    gridField('Nesteputki (°C)', kp.nestePutkiLampotila),
    gridField('Kuumakaasu (°C)', kp.kuumakaasuLampotila),
  ]
    .filter(Boolean)
    .join('');

  const compCount = parseInt(kp.kompressorienMaara || '1', 10) || 1;
  let compressors = '';
  for (let i = 1; i <= compCount; i++) {
    const comp = kp[`kompressori${i}` as keyof RefrigerantCircuitData] as CompressorData | undefined;
    if (comp) compressors += renderCompressorBlock(comp, i);
  }

  const configRows = [
    row('Ohjaustapa', kp.ohjaustapa, '#E64A19'),
    row('Paisuntaventtiili', kp.paisuntaventtiiliTyyppi, '#E64A19'),
    row('PV valmistaja', kp.paisuntaventtiiliValmistaja, '#E64A19'),
    row('PV malli', kp.paisuntaventtiiliMalli, '#E64A19'),
    row('Kuivain valmistaja', kp.kuivainValmistaja, '#E64A19'),
    row('Kuivain malli', kp.kuivainMalli, '#E64A19'),
    checkRow(kp.magneettiventtiiliTestattu, 'Magneettiventtiili testattu'),
    checkRow(kp.nestelasiKuiva, 'Nestelasi kuiva'),
    checkRow(kp.kuivainOK, 'Kuivain OK'),
  ]
    .filter(Boolean)
    .join('');

  return box(
    `KYLMÄAINEPIIRI ${circuitNum}`,
    '#E64A19',
    `
    ${paineGrid ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">${paineGrid}</div>` : ''}
    <div style="margin-bottom:6px;font-size:11px;">Tulistus: <strong>${esc(sh)} K</strong> · Alijäähdytys: <strong>${esc(sc)} K</strong></div>
    ${configRows}
    ${compressors ? `<div style="margin-top:8px;"><strong>Kompressorit</strong>${compressors}</div>` : ''}
  `,
  );
}

function renderSingleEvaporatorHtml(ev: EvaporatorData, index: number, deviceType: string): string {
  const title =
    deviceType === 'kylmäkoneikko' ? `HÖYRYSTIN ${index + 1}` : `HÖYRYSTIN — PIIRI ${index + 1}`;
  const inner = [
    gridField('Tyyppi', ev.tyyppi === 'puhallin' ? 'Puhallinhöyrystin' : 'Staattinen höyrystin'),
    gridField('Huoneen tunnus', ev.huoneenTunnus),
    gridField('Sulatus', getSulatusText(ev.sulatus)),
    gridField('Valmistaja', ev.valmistaja),
    gridField('Malli', ev.malli),
    gridField('Sarjanumero', ev.sarjanumero),
    checkRow(ev.sahkoVirtaMitattu, 'Sähkövirta mitattu'),
  ]
    .filter(Boolean)
    .join('');
  return box(title, '#00838F', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${inner}</div>`);
}

function renderEvaporators(data: HuoltoReportData): string {
  if (!data.selectedModules.hoyrystin && data.laiteTyyppi !== 'pakastin' && data.laiteTyyppi !== 'kylmäkoneikko') {
    return '';
  }
  if (isChillerLikeDevice(data.laiteTyyppi)) return '';
  return data.evaporatorData
    .map((ev, i) => renderSingleEvaporatorHtml(ev, i, data.laiteTyyppi))
    .join('');
}

function renderCircuitsHtml(data: HuoltoReportData): string {
  if (!data.selectedModules.kylmaainePiiri || data.kylmaainePiireja === '0') return '';

  const inlineEvaporators =
    isChillerLikeDevice(data.laiteTyyppi) &&
    (data.selectedModules.hoyrystin || data.laiteTyyppi === 'pakastin' || data.laiteTyyppi === 'kylmäkoneikko');

  let html = '';
  html += renderCircuitHtml(1, data.kylmaainePiiri1, data.kylmaaineTyyppi);
  if (inlineEvaporators && data.evaporatorData[0]) {
    html += renderSingleEvaporatorHtml(data.evaporatorData[0], 0, data.laiteTyyppi);
  }

  if (data.kylmaainePiireja !== '1' && data.kylmaainePiiri2) {
    html += renderCircuitHtml(2, data.kylmaainePiiri2, data.kylmaaineTyyppi);
    if (inlineEvaporators && data.evaporatorData[1]) {
      html += renderSingleEvaporatorHtml(data.evaporatorData[1], 1, data.laiteTyyppi);
    }
  }

  if ((data.kylmaainePiireja === '3' || data.kylmaainePiireja === '4') && data.kylmaainePiiri3) {
    html += renderCircuitHtml(3, data.kylmaainePiiri3, data.kylmaaineTyyppi);
    if (inlineEvaporators && data.evaporatorData[2]) {
      html += renderSingleEvaporatorHtml(data.evaporatorData[2], 2, data.laiteTyyppi);
    }
  }

  return html;
}

function renderCondensers(data: HuoltoReportData): string {
  if (!data.selectedModules.lauhdutin && data.laiteTyyppi !== 'pakastin' && data.laiteTyyppi !== 'kylmäkoneikko') {
    return '';
  }
  return data.condenserData
    .map((co, i) => {
      const inner = [
        gridField('Tyyppi', co.tyyppi ? getLauhdutinTypeText(co.tyyppi) : ''),
        gridField('Puhaltimien määrä', co.puhaltimienMaara),
        gridField('Ohjaus', co.puhallinOhjaus ? getOhjausText(co.puhallinOhjaus, co.puhallinOhjausMuu) : ''),
        gridField('Nopeussäädin', co.nopeussäädinMalli),
        gridField('Taajuusmuuntaja', co.taajusmuuntajaMalli),
        checkRow(co.lauhdutinPuhdistettu, 'Lauhdutin puhdistettu'),
        checkRow(co.painesäätimenTarkistettu, 'Painesäädin tarkistettu'),
        checkRow(co.virtausRiittävä, 'Virtaus riittävä'),
        checkRow(co.talvivarustus, 'Talvivarustus'),
      ]
        .filter(Boolean)
        .join('');
      return box(`LAUHDUTIN ${i + 1}`, '#1565C0', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${inner}</div>`);
    })
    .join('');
}

function renderNestelauhduttimet(data: HuoltoReportData): string {
  const units = field(data, 'nestelauhduttimetVj');
  if (!Array.isArray(units) || units.length === 0) return '';
  return units
    .map((u: Record<string, unknown>, i: number) => {
      const inner = [
        gridField('Valmistaja', u.valmistaja),
        gridField('Malli', u.malli),
        gridField('Sarjanumero', u.sarjanumero),
        gridField('Puhaltimien määrä', u.puhaltimienMaara),
        checkRow(u.lauhdutinPuhdistettu as boolean | undefined, 'Puhdistettu'),
        checkRow(u.painesäädinTarkistettu as boolean | undefined, 'Painesäädin tarkistettu'),
      ]
        .filter(Boolean)
        .join('');
      return box(`NESTELAUHDUTIN ${i + 1}`, '#5D4037', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${inner}</div>`);
    })
    .join('');
}

function renderMlpSummary(data: HuoltoReportData): string {
  const mlp = data.mlpData;
  if (!mlp || (!data.selectedModules.mlpPiirit && data.laiteTyyppi !== 'mlp')) return '';

  const sections: string[] = [];

  const keruu = [
    row('Keruupiiri paine (bar)', mlp.keruupiiriPaineBar, '#6A1B9A'),
    row('Keruupiiri virtaus', mlp.keruupiiriVirtaus, '#6A1B9A'),
    row('Keruupiiri meno (°C)', mlp.keruupiiriMeno, '#6A1B9A'),
    row('Keruupiiri paluu (°C)', mlp.keruupiiriTulo, '#6A1B9A'),
    row('Pumpun tyyppi', mlp.keruupiirinPumpunTyyppi, '#6A1B9A'),
    row('Pumpun valmistaja', mlp.keruupiiriPumpunValmistaja, '#6A1B9A'),
    row('Pumpun malli', mlp.keruupiiriPumpunMalli, '#6A1B9A'),
    checkRow(mlp.keruupiirinPaineTarkastettu, 'Paine tarkastettu'),
    checkRow(mlp.keruupiirinPumppuTarkastettu, 'Pumppu tarkastettu'),
  ]
    .filter(Boolean)
    .join('');
  if (keruu) sections.push(`<div style="margin-bottom:8px;"><strong>Keruupiiri</strong>${keruu}</div>`);

  const lataus = [
    row('Latauspiiri paine (bar)', mlp.latausPaineBar, '#6A1B9A'),
    row('Lataus virtaus', mlp.latausVirtaus, '#6A1B9A'),
    row('Lataus meno (°C)', mlp.latausMeno, '#6A1B9A'),
    row('Lataus paluu (°C)', mlp.latausTulo, '#6A1B9A'),
    row('Pumpun tyyppi', mlp.latausPumpunTyyppi, '#6A1B9A'),
    checkRow(mlp.latausPaineTarkastettu, 'Paine tarkastettu'),
    checkRow(mlp.latausPumppuTarkastettu, 'Pumppu tarkastettu'),
    checkRow(mlp.kylmaaineVuotoja, 'Kylmäainevuotoja'),
  ]
    .filter(Boolean)
    .join('');
  if (lataus) sections.push(`<div style="margin-bottom:8px;"><strong>Latauspiiri</strong>${lataus}</div>`);

  if (mlp.kayttovesiEnabled) {
    const kv = [
      row('Tilavuus', mlp.kayttovesiTilavuus, '#6A1B9A'),
      row('Lämpötila-asetus', mlp.kayttovesiLampotilaAsetus, '#6A1B9A'),
      row('Nykyinen lämpötila', mlp.kayttovesiLampotilaNykyinen, '#6A1B9A'),
      checkRow(mlp.kayttovesiToimilaitteetOK, 'Toimilaitteet OK'),
    ]
      .filter(Boolean)
      .join('');
    if (kv) sections.push(`<div style="margin-bottom:8px;"><strong>Käyttövesi</strong>${kv}</div>`);
  }

  if (Array.isArray(mlp.lampoPiirit) && mlp.lampoPiirit.length > 0) {
    const rows = mlp.lampoPiirit
      .map(
        (p, i) =>
          `<tr>
        <td style="border:1px solid #ccc;padding:4px;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:4px;">${esc(p.jakotapa || p.jakotapaMuu)}</td>
        <td style="border:1px solid #ccc;padding:4px;">${esc(p.pumppuTyyppi)}</td>
        <td style="border:1px solid #ccc;padding:4px;">${esc(p.virtaus)}</td>
        <td style="border:1px solid #ccc;padding:4px;">${esc(p.meno)} / ${esc(p.tulo)}</td>
      </tr>`,
      )
      .join('');
    sections.push(`
      <div style="margin-bottom:8px;"><strong>Lämpöpiirit</strong>
        <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:4px;">
          <thead><tr style="background:#f5f5f5;">
            <th style="border:1px solid #ccc;padding:4px;">#</th>
            <th style="border:1px solid #ccc;padding:4px;">Jakotapa</th>
            <th style="border:1px solid #ccc;padding:4px;">Pumppu</th>
            <th style="border:1px solid #ccc;padding:4px;">Virtaus</th>
            <th style="border:1px solid #ccc;padding:4px;">Meno/Tulo</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  }

  return box('MLP-PIIRIT', '#6A1B9A', sections.join(''));
}

function renderKonvektoritTable(data: HuoltoReportData): string {
  const rows = field(data, 'konvektoriRows') ?? field(data, 'konvektoritData');
  if (data.laiteTyyppi !== 'konvektorit' || !Array.isArray(rows) || rows.length === 0) return '';

  const renderCheckKonv = (checked: boolean | undefined) => {
    if (checked === true) return '<span style="color:#16a34a;font-weight:700;">✓</span>';
    if (checked === false) return '<span style="color:#dc2626;font-weight:700;">✗</span>';
    return '<span style="color:#9ca3af;">–</span>';
  };

  const body = rows
    .map((r: Record<string, unknown>, idx: number) => {
      const isVika = r.huomioTyyppi === 'vika';
      const huom = r.huomio ? esc(r.huomio) : '—';
      const huomCell = isVika ? `<span style="color:#b91c1c;font-weight:700;">${huom}</span>` : huom;
      return `<tr>
        <td style="border:1px solid #ccc;padding:2px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #ccc;padding:2px;">${esc(r.tunnus)}</td>
        <td style="border:1px solid #ccc;padding:2px;">${esc(r.valmistaja)}</td>
        <td style="border:1px solid #ccc;padding:2px;">${esc(r.malli)}</td>
        <td style="border:1px solid #ccc;padding:2px;">${esc(r.sarjanumero)}</td>
        <td style="border:1px solid #ccc;padding:2px;text-align:center;">${renderCheckKonv(r.suodatinPuhdistettu as boolean | undefined)}</td>
        <td style="border:1px solid #ccc;padding:2px;text-align:center;">${renderCheckKonv(r.kennoPuhdistettu as boolean | undefined)}</td>
        <td style="border:1px solid #ccc;padding:2px;text-align:center;">${renderCheckKonv(r.kondenssiTarkastettu as boolean | undefined)}</td>
        <td style="border:1px solid #ccc;padding:2px;text-align:center;">${renderCheckKonv(r.puhallinTarkastettu as boolean | undefined)}</td>
        <td style="border:1px solid #ccc;padding:2px;text-align:center;">${renderCheckKonv(r.venttiiliTarkastettu as boolean | undefined)}</td>
        <td style="border:1px solid #ccc;padding:2px;font-size:9px;">${huomCell}</td>
      </tr>`;
    })
    .join('');

  return box(
    'KONVEKTORIT (HUOLTOTAULUKKO)',
    '#00838F',
    `<table style="width:100%;border-collapse:collapse;font-size:9px;">
      <thead><tr style="background:#f5f5f5;">
        <th style="border:1px solid #ccc;padding:2px;">#</th>
        <th style="border:1px solid #ccc;padding:2px;">Tunnus</th>
        <th style="border:1px solid #ccc;padding:2px;">Valm.</th>
        <th style="border:1px solid #ccc;padding:2px;">Malli</th>
        <th style="border:1px solid #ccc;padding:2px;">Sarj.</th>
        <th style="border:1px solid #ccc;padding:2px;">Suod.</th>
        <th style="border:1px solid #ccc;padding:2px;">Kenno</th>
        <th style="border:1px solid #ccc;padding:2px;">Kond.</th>
        <th style="border:1px solid #ccc;padding:2px;">Puh.</th>
        <th style="border:1px solid #ccc;padding:2px;">Vent.</th>
        <th style="border:1px solid #ccc;padding:2px;">Huomio</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`,
  );
}

function renderLampopumppuSections(data: HuoltoReportData): string {
  if (data.laiteTyyppi !== 'lämpöpumppu') return '';

  const ulko = [
    row('Malli', strField(data, 'ulkoyksikkoMalli'), '#E64A19'),
    row('Sarjanumero', strField(data, 'ulkoyksikkoSarjanumero'), '#E64A19'),
    row('Jäähdytysteho (kW)', strField(data, 'ulkoyksikkoJaahdytysTeho'), '#E64A19'),
    row('Lämmitysteho (kW)', strField(data, 'ulkoyksikkoLammitysTeho'), '#E64A19'),
    checkRow(field(data, 'ulkoyksikkoKennosPuhdas') as boolean | undefined, 'Kenno puhdistettu'),
    checkRow(field(data, 'ulkoyksikkoTurvakytkin') as boolean | undefined, 'Turvakytkin'),
    checkRow(field(data, 'ulkoyksikkoSuojakotelo') as boolean | undefined, 'Suojakotelo'),
  ]
    .filter(Boolean)
    .join('');

  const sisayksikot = field(data, 'sisayksikkoData');
  let sisaHtml = '';
  if (Array.isArray(sisayksikot) && sisayksikot.length > 0) {
    sisaHtml = sisayksikot
      .map((u: Record<string, unknown>, i: number) => {
        const inner = [
          row('Tyyppi', u.tyyppi, '#00838F'),
          row('Malli', u.malli, '#00838F'),
          row('Sarjanumero', u.sarjanumero, '#00838F'),
          row('Kondenssivesi', u.kondenssivesi, '#00838F'),
          checkRow(u.kennoPuhdas as boolean | undefined, 'Kenno puhdas'),
          checkRow(u.kondenssiTestattu as boolean | undefined, 'Kondenssi testattu'),
        ]
          .filter(Boolean)
          .join('');
        return `<div style="margin-top:6px;padding:6px;background:#e0f7fa;border-radius:4px;"><strong>Sisäyksikkö ${i + 1}</strong>${inner}</div>`;
      })
      .join('');
  }

  const mittaus = [
    checkRow(field(data, 'mittausJaahdytysTestattu') as boolean | undefined, 'Jäähdytys testattu'),
    checkRow(field(data, 'mittausLammitysTestattu') as boolean | undefined, 'Lämmitys testattu'),
    row('Testauslämpötila (°C)', strField(data, 'mittausTestausLampotila'), '#00838F'),
    row('Ulkolämpötila (°C)', strField(data, 'mittausUlkoLampotila'), '#00838F'),
  ]
    .filter(Boolean)
    .join('');

  return [box('ULKOYKSIKKÖ', '#E64A19', ulko), box('SISÄYKSIKÖT', '#00838F', sisaHtml), box('MITTAUKSET', '#00838F', mittaus)]
    .filter(Boolean)
    .join('');
}

function renderRefrigerantCharge(data: HuoltoReportData): string {
  const gwp = data.kylmaaineTyyppi ? getRefrigerantGWP(data.kylmaaineTyyppi) : 0;
  const rows: string[] = [];
  if (hasPrintableValue(data.kylmaaineTyyppi)) {
    rows.push(row('Tyyppi', data.kylmaaineTyyppi, '#FF6D00'));
    if (gwp > 0) rows.push(row('GWP', gwp, '#FF6D00'));
  }

  const piireja = String(data.kylmaainePiireja ?? '').trim();
  const single = piireja === '1' || piireja === '';
  if (single) {
    const valm = parseFloat(strField(data, 'kylmaaineValmistajaMaara')) || 0;
    const lis = parseFloat(strField(data, 'kylmaaineLisattyMaara')) || 0;
    if (valm > 0) rows.push(row('Valmistajan määrä', `${valm.toFixed(0)} g`, '#FF6D00'));
    if (lis > 0) rows.push(row('Lisätty määrä', `${lis.toFixed(0)} g`, '#FF6D00'));
    if (valm + lis > 0) rows.push(row('Yhteensä', `${(valm + lis).toFixed(0)} g`, '#FF6D00'));
    const putki = strField(data, 'kylmaainePutkimatka');
    if (putki) rows.push(row('Putkimatka', `${putki} m`, '#FF6D00'));
  } else {
    for (const [label, key] of [
      ['Piiri 1', 'kylmaaineMaaraPiiri1'],
      ['Piiri 2', 'kylmaaineMaaraPiiri2'],
      ['Piiri 3', 'kylmaaineMaaraPiiri3'],
      ['Piiri 4', 'kylmaaineMaaraPiiri4'],
    ] as const) {
      const v = strField(data, key);
      if (hasPrintableValue(v)) rows.push(row(label, `${v} kg`, '#FF6D00'));
    }
    const total = strField(data, 'kylmaaineMaaraYhteensa');
    if (hasPrintableValue(total)) rows.push(row('Yhteensä', `${total} kg`, '#FF6D00'));
  }

  const co2 = strField(data, 'kylmaaineCO2Ekv');
  if (hasPrintableValue(co2)) rows.push(row('CO₂-ekvivalentti', `${co2} t`, '#FF6D00'));

  if (!rows.length) return '';
  return box('KYLMÄAINE', '#FF6D00', rows.join(''));
}

function renderTiiveyskoe(data: HuoltoReportData): string {
  if (!data.selectedModules.tiiveyskoe) return '';
  const tv = data.tiiveyskoeData;
  const huoltoPvm = String(data.huoltoPaivamaara || '').trim();
  const res = resolveKoePaivamaaraJaKello(tv.koeAlkaaPvm, tv.koeAlkaaKlo, huoltoPvm);
  const alku = res.pvmIso && res.klo ? `${res.pvmIso} klo ${res.klo}` : '';
  const loppu = alku ? laskeKokeLoppuaikaFi(res.pvmIso, res.klo, tv.kestoMin) : '';
  const tulos =
    tv.tulos === 'hyvaksytty' ? 'Hyväksytty' : tv.tulos === 'hylatty' ? 'Hylätty' : '';

  const inner = [
    row('Koepaine (bar)', tv.testipaineBar, '#00695C'),
    alku ? row('Koe alkoi', alku, '#00695C') : '',
    row('Kesto (min)', tv.kestoMin, '#00695C'),
    loppu ? row('Koe päättyi', loppu, '#00695C') : '',
    row('Testauslämpötila (°C)', tv.testauslampotila, '#00695C'),
    tulos ? row('Tulos', tulos, '#00695C') : '',
    row('Menetelmä', tv.menetelma, '#00695C'),
    hasPrintableValue(tv.huom) ? `<div style="white-space:pre-wrap;padding:2px 0;">Huom: ${esc(tv.huom)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  return inner ? box('TIIVEYSKOE', '#00695C', inner) : '';
}

function renderTyhjiointi(data: HuoltoReportData): string {
  if (!data.selectedModules.tyhjiointi) return '';
  const ty = data.tyhjiointiData;
  const huoltoPvm = String(data.huoltoPaivamaara || '').trim();
  const res = resolveKoePaivamaaraJaKello(ty.koeAlkaaPvm, ty.koeAlkaaKlo, huoltoPvm);
  const alku = res.pvmIso && res.klo ? `${res.pvmIso} klo ${res.klo}` : '';
  const loppu = alku ? laskeKokeLoppuaikaFi(res.pvmIso, res.klo, ty.kestoMin) : '';
  const loppupaine = formatTyhjiointiLoppupaine(ty.loppupaineArvo, ty.loppupaineYksikko);

  const inner = [
    hasPrintableValue(loppupaine) ? row('Loppupaine', loppupaine, '#0277BD') : '',
    alku ? row('Koe alkoi', alku, '#0277BD') : '',
    row('Kesto (min)', ty.kestoMin, '#0277BD'),
    loppu ? row('Koe päättyi', loppu, '#0277BD') : '',
    row('Painemittari', ty.kaytettyPainemittari, '#0277BD'),
    hasPrintableValue(ty.huom) ? `<div style="white-space:pre-wrap;padding:2px 0;">Huom: ${esc(ty.huom)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  return inner ? box('TYHJIÖINTI', '#0277BD', inner) : '';
}

function renderHuomiot(data: HuoltoReportData): string {
  const huom = String(data.huomiot || '').trim();
  const luonne = field(data, 'huomiotLuonne');
  if (!huom) return '';

  const style =
    luonne === 'vika'
      ? 'white-space:pre-wrap;font-size:11pt;margin:0;color:#b91c1c;font-weight:700;'
      : 'white-space:pre-wrap;font-size:11pt;margin:0;';

  return box('HUOMIOT JA LISÄTIEDOT', '#7B1FA2', `<p style="${style}">${esc(huom)}</p>`);
}

const PRINT_CSS = `
:root { --text:#111827; --muted:#6b7280; --accent:#F0810F; --accent-strong:#D97706; }
.huolto-print { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.35; color: var(--text); background: #fff; }
.huolto-print .header-row { display: grid; grid-template-columns: 55mm 1fr 55mm; align-items: start; border-bottom: 4px dashed var(--accent-strong); padding-bottom: 4mm; margin-bottom: 8px; }
.huolto-print .h-left { display: flex; align-items: center; min-height: 18mm; }
.huolto-print .h-center { text-align: center; }
.huolto-print .h-right { text-align: right; color: var(--muted); font-size: 10pt; }
.huolto-print h1 { margin: 0; font-size: 18pt; }
.huolto-print .subtitle { margin-top: 1mm; color: var(--muted); font-size: 10.5pt; }
.huolto-print .content-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: stretch; }
.huolto-print .column-box { width: calc(50% - 5px); }
.huolto-print .box-content { border: 1px solid #ccc; padding: 8px; border-radius: 4px; }
.huolto-print .footer { border-top: 1px solid #ccc; padding-top: 8px; margin-top: 15px; font-size: 9pt; color: #666; }
.huolto-print .huolto-status { margin: 8px 0; padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 11px; }
@media print {
  .no-print { display: none !important; }
  .huolto-print { padding: 0; }
  @page { margin: 14mm; size: A4 portrait; }
}
`;

/** Generate printable HTML fragment for a maintenance report. */
export function generateMaintenanceReportHtml(
  data: HuoltoReportData,
  meta: MaintenancePrintMeta,
): string {
  const docKind = data.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto';
  const docTitle = docKind === 'kayttoonotto' ? 'Käyttöönottopöytäkirja' : 'Huoltopöytäkirja';
  const printDate = data.huoltoPaivamaara || new Date().toLocaleDateString('fi-FI');
  const subtitle = [meta.companyName, data.asiakas, data.laiteTunnus].filter(Boolean).join(' – ');

  const logoHtml = meta.logoUrl
    ? `<img src="${escAttr(meta.logoUrl)}" alt="Logo" style="max-height:52px;max-width:170px;" />`
    : '';

  const customerBox = box(
    'ASIAKASTIEDOT',
    '#1976D2',
    [row('', data.asiakas, '#1976D2'), row('', data.osoite, '#1976D2')].filter(Boolean).join(''),
  );

  const deviceBox = box(
    'LAITETIEDOT',
    '#388E3C',
    [
      row('Tyyppi', data.laiteTyyppi, '#388E3C'),
      row('Valmistaja', data.laiteValmistaja, '#388E3C'),
      row('Malli', data.laiteMalli, '#388E3C'),
      row('Tunnus', data.laiteTunnus, '#388E3C'),
      row('Sijainti', data.laiteSijainti, '#388E3C'),
      row('Sarjanumero', data.laiteSarjanumero, '#388E3C'),
      row('Käyttötarkoitus', data.laiteKayttotarkoitus, '#388E3C'),
    ]
      .filter(Boolean)
      .join(''),
  );

  const refrigerantBox = data.selectedModules.kylmaainePiiri || data.kylmaaineTyyppi
    ? renderRefrigerantCharge(data)
    : '';

  let circuitsHtml = renderCircuitsHtml(data);

  const statusHtml = `<div class="huolto-status">
    ${checkRow(data.huoltoSuoritettu, 'Huolto suoritettu')}
    ${checkRow(data.huoltoKylmaaineVuotoTarkastus, 'Kylmäaine-/vuototarkastus')}
    ${data.huoltoLaiteessaVika ? '<span style="color:#b91c1c;font-weight:700;">Laiteessa vika havaittu</span>' : checkRow(data.huoltoLaiteessaVika === false, 'Ei vikaa havaittu')}
  </div>`;

  return `<style>${PRINT_CSS}</style>
<div class="huolto-print">
  <div class="header-row">
    <div class="h-left">${logoHtml}</div>
    <div class="h-center">
      <h1>${esc(docTitle)}</h1>
      <div class="subtitle">${esc(subtitle)}</div>
    </div>
    <div class="h-right">${esc(printDate)}</div>
  </div>

  <div class="content-row">
    <div class="column-box">${customerBox}</div>
    <div class="column-box">${deviceBox}</div>
  </div>

  ${refrigerantBox ? `<div class="content-row"><div class="column-box">${refrigerantBox}</div></div>` : ''}

  ${statusHtml}
  ${renderLampopumppuSections(data)}
  ${circuitsHtml}
  ${renderEvaporators(data)}
  ${renderCondensers(data)}
  ${renderNestelauhduttimet(data)}
  ${renderMlpSummary(data)}
  ${renderKonvektoritTable(data)}
  ${renderTiiveyskoe(data)}
  ${renderTyhjiointi(data)}
  ${renderHuomiot(data)}

  <div class="footer">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <p style="margin:0;"><strong>Suorittaja:</strong> ${esc(data.huoltoSuorittajaNimi || '—')}
        ${data.huoltoSuorittajaTUKES ? `| TUKES: ${esc(data.huoltoSuorittajaTUKES)}` : ''}</p>
      <p style="margin:0;"><strong>Päivämäärä:</strong> ${esc(data.huoltoPaivamaara || '—')}</p>
    </div>
  </div>
</div>`;
}
