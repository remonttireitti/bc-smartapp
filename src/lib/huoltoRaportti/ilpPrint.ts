/** Ilmalämpöpumput: yksi pöytäkirja, kortti per laite (vrt. konvektoriPrint). */
import { sisayksikkoTyyppiOptions, ulkoyksikkoAsennustapaOptions } from './constants';
import { formatHuomioPrintHtml } from './formatHuomioPrintHtml';
import { normalizeLegacyInspectionStatus } from './huoltoInspectionStatus';
import { ilpDeviceLabel, ilpDeviceState, ilpDeviceTestEnabled, ilpUlkoyksikkoStatus } from './ilpLaitteet';
import { formatTyhjiointiLoppupaine, laskeKokeLoppuaikaFi, resolveKoePaivamaaraJaKello } from './kokeAikaUtils';
import { inspectionStatusMark } from './inspectionPrint';
import { SISAYKSIKKO_TARKASTUS_ITEMS } from './sisayksikkoTarkastus';
import { calculateCO2Ekv, getRefrigerantGWP, resolveKylmaaineTyyppi } from './utils';
import type { MaintenanceReportPhotoItem } from '../maintenanceReportPhotoUtils';
import type { HuoltoReportData, MittausSisayksikkoData, SisayksikkoData } from './types';

export type IlpPrintOptions = {
  /** Laitteiden yhteinen käyttötarkoitus (yhteenvetorivi). */
  kohde?: string;
  /** Kuvatodisteen img-src (tulosteen signed URL -kartasta). */
  resolvePhotoHref?: (item: MaintenanceReportPhotoItem) => string;
  escAttr?: (v: unknown) => string;
};

type Esc = (v: unknown) => string;

const ACCENT = '#00838F';

const CHECK_SHORT: Record<string, string> = {
  asennettu: 'As',
  kennoPuhdas: 'Kenno',
  eiAania: 'Ääni',
  kondenssiTestattu: 'Kond',
};

function text(value: unknown): string {
  const s = String(value ?? '').trim();
  return s === '-' ? '' : s;
}

function num(value: unknown): number {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function optionLabel(options: { value: string; label: string }[], value: unknown): string {
  const v = text(value);
  if (!v) return '';
  return options.find((o) => o.value === v)?.label ?? v;
}

function mark(checked: boolean | undefined, esc: Esc, label: string): string {
  if (checked === undefined || checked === null) return '';
  const color = checked ? '#16a34a' : '#9ca3af';
  return `<div><span style="color:${color};font-weight:700;">${checked ? '✓' : '–'}</span> ${esc(label)}</div>`;
}

function kv(label: string, value: string, esc: Esc): string {
  if (!value) return '';
  return `<div><span style="color:#64748b;">${esc(label)}:</span> ${esc(value)}</div>`;
}

function heading(title: string, esc: Esc): string {
  return `<div style="font-weight:700;color:${ACCENT};border-bottom:1px solid #b2ebf2;margin-bottom:2px;">${esc(title)}</div>`;
}

function refrigerantLine(view: HuoltoReportData): string {
  const tyyppi = text(resolveKylmaaineTyyppi(view.kylmaaineTyyppi, view.kylmaaineLaatu));
  const valm = num(view.kylmaaineValmistajaMaara);
  const lis = num(view.kylmaaineLisattyMaara);
  const total = valm + lis;
  const parts = [tyyppi];
  if (total > 0) parts.push(`${total.toFixed(2).replace(/\.?0+$/, '')} kg${lis > 0 ? ` (lisätty ${lis} kg)` : ''}`);
  const gwp = tyyppi ? getRefrigerantGWP(tyyppi) : 0;
  if (gwp > 0 && total > 0) parts.push(`${calculateCO2Ekv(total, gwp).toFixed(2)} t CO₂e`);
  const putki = text(view.kylmaainePutkimatka);
  if (putki) parts.push(`putkimatka ${putki} m`);
  return parts.filter(Boolean).join(' ');
}

function renderUlkoyksikko(view: HuoltoReportData, esc: Esc): string {
  const status = ilpUlkoyksikkoStatus(view);
  const teho = [text(view.ulkoyksikkoJaahdytysTeho) && `jäähd. ${text(view.ulkoyksikkoJaahdytysTeho)}`, text(view.ulkoyksikkoLammitysTeho) && `lämm. ${text(view.ulkoyksikkoLammitysTeho)}`]
    .filter(Boolean)
    .join(' / ');
  const asennus = view.ulkoyksikkoAsennustapa === 'muu'
    ? text(view.ulkoyksikkoAsennustapaMuu) || 'Muu'
    : optionLabel(ulkoyksikkoAsennustapaOptions, view.ulkoyksikkoAsennustapa);
  const statusHtml = status
    ? (() => {
      const m = inspectionStatusMark(status);
      const label = status === 'ok' ? 'OK' : status === 'faulty' ? 'Vika' : 'Ei koske';
      return `<div><span style="color:${m.color};font-weight:700;">${m.mark}</span> Tarkastus: ${label}</div>`;
    })()
    : '';
  const kenno = view.ulkoyksikkoKennosPuhdas
    ? `Kenno puhdas/puhdistettu${text(view.ulkoyksikkoKennoPuhdistustapa) ? ` (${text(view.ulkoyksikkoKennoPuhdistustapa)})` : ''}`
    : 'Kenno puhdas/puhdistettu';
  const rows = [
    statusHtml,
    kv('Teho kW', teho, esc),
    kv('Asennus', asennus, esc),
    view.ulkoyksikkoKennosPuhdas ? mark(true, esc, kenno) : '',
    view.ulkoyksikkoSulatausVedenKeraily
      ? mark(!!view.ulkoyksikkoSulatausVedenTarkistettu, esc, 'Sulatusveden keräily kunnossa')
      : '',
    view.ulkoyksikkoTurvakytkin ? mark(true, esc, 'Turvakytkin') : '',
    view.ulkoyksikkoSuojakotelo ? mark(true, esc, 'Suojakotelo') : '',
    status === 'faulty' && text(view.ulkoyksikkoTarkastusHuomio)
      ? `<div style="color:#b91c1c;font-weight:600;">Vika: ${esc(text(view.ulkoyksikkoTarkastusHuomio))}</div>`
      : '',
  ].filter(Boolean);
  if (rows.length === 0) return '';
  return `<div>${heading('Ulkoyksikkö', esc)}${rows.join('')}</div>`;
}

function unitCheckCell(unit: SisayksikkoData, field: keyof SisayksikkoData): string {
  const status = normalizeLegacyInspectionStatus(unit[field]);
  const m = inspectionStatusMark(status);
  return `<td style="text-align:center;color:${m.color};font-weight:700;">${m.mark}</td>`;
}

function renderSisayksikot(view: HuoltoReportData, esc: Esc): string {
  const count = view.sisayksikkoMaara > 0 ? view.sisayksikkoMaara : 1;
  const units = (view.sisayksikkoData ?? []).slice(0, count);
  if (units.length === 0) return '';
  const anyContent = units.some(
    (u) => text(u.malli) || text(u.sarjanumero) || text(u.tyyppi)
      || SISAYKSIKKO_TARKASTUS_ITEMS.some((item) => normalizeLegacyInspectionStatus(u[item.field]) !== null),
  );
  if (!anyContent) return '';
  const head = SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => `<th title="${esc(item.label)}">${CHECK_SHORT[item.field]}</th>`).join('');
  const body = units
    .map((u, i) => {
      const ident = [optionLabel(sisayksikkoTyyppiOptions, u.tyyppi), text(u.malli), text(u.sarjanumero) && `S/N ${text(u.sarjanumero)}`]
        .filter(Boolean)
        .join(' · ');
      const kond = u.kondenssivesi === 'pumppu' || u.kondenssivesi === 'pumpulla'
        ? `kond.pumppu${text(u.pumppuMalli) ? ` ${text(u.pumppuMalli)}` : ''}`
        : '';
      const extra = [kond, text(u.huoneLampotila) && `huone ${text(u.huoneLampotila)} °C`].filter(Boolean).join(' · ');
      const huomio = text(u.huomio);
      const huomioHtml = huomio
        ? `<div style="${u.huomioTyyppi === 'vika' ? 'color:#b91c1c;font-weight:600;' : 'color:#334155;'}">${formatHuomioPrintHtml(huomio, esc)}</div>`
        : '';
      return `<tr style="border-top:1px solid #e2e8f0;">
        <td style="vertical-align:top;">${i + 1}</td>
        <td>${esc(ident || '—')}${extra ? `<div style="color:#64748b;">${esc(extra)}</div>` : ''}${huomioHtml}</td>
        ${SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => unitCheckCell(u, item.field)).join('')}
      </tr>`;
    })
    .join('');
  return `<div>${heading('Sisäyksiköt', esc)}
    <table style="width:100%;border-collapse:collapse;font-size:inherit;">
      <thead><tr style="color:#64748b;text-align:left;"><th style="width:12px;">#</th><th>Yksikkö</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

type ModeKey = 'Jaahdytys' | 'Lammitys';

type ModeField = {
  label: string;
  jaahdytys: keyof MittausSisayksikkoData;
  lammitys: keyof MittausSisayksikkoData;
  legacy?: keyof MittausSisayksikkoData;
};

const MODE_FIELDS: ModeField[] = [
  { label: 'Imu bar', jaahdytys: 'imupaineJaahdytys', lammitys: 'imupaineLammitys' },
  { label: 'Korkea bar', jaahdytys: 'korkeapaineJaahdytys', lammitys: 'korkeapaineLammitys' },
  { label: 'Sisä °C', jaahdytys: 'sisalampotilaJaahdytys', lammitys: 'sisalampotilaLammitys', legacy: 'sisalampotila' },
  { label: 'Paluu °C', jaahdytys: 'paluuLampotilaJaahdytys', lammitys: 'paluuLampotilaLammitys', legacy: 'paluuLampotila' },
  { label: 'Puhallus °C', jaahdytys: 'puhallusLampotilaJaahdytys', lammitys: 'puhallusLampotilaLammitys', legacy: 'puhallusLampotila' },
  { label: 'm³/h', jaahdytys: 'ilmanmaaraM3hJaahdytys', lammitys: 'ilmanmaaraM3hLammitys', legacy: 'ilmanmaaraM3h' },
];

/** Vanhat mittaukset ilman tilakohtaisia kenttiä: yhteiset arvot näytetään vain testatulle tilalle. */
function modeValue(m: MittausSisayksikkoData, field: ModeField, mode: ModeKey, legacyMode: ModeKey | null): string {
  const own = text(m[mode === 'Jaahdytys' ? field.jaahdytys : field.lammitys]);
  if (own) return own;
  if (!field.legacy || legacyMode !== mode) return '';
  const hasModeSpecific = MODE_FIELDS.some((f) => text(m[f.jaahdytys]) || text(m[f.lammitys]));
  return hasModeSpecific ? '' : text(m[field.legacy]);
}

function renderMittaukset(view: HuoltoReportData, esc: Esc): string {
  const count = view.sisayksikkoMaara > 0 ? view.sisayksikkoMaara : 1;
  const measurements = (view.mittausSisayksikot ?? []).slice(0, count);
  const modes: { key: ModeKey; label: string }[] = [];
  const legacyMode: ModeKey | null = view.mittausLammitysTestattu && !view.mittausJaahdytysTestattu ? 'Lammitys' : 'Jaahdytys';
  const get = (m: MittausSisayksikkoData, f: ModeField, key: ModeKey) => modeValue(m, f, key, legacyMode);
  const modeHasValues = (key: ModeKey) => measurements.some((m) => MODE_FIELDS.some((f) => get(m, f, key)));
  if (view.mittausJaahdytysTestattu || modeHasValues('Jaahdytys')) modes.push({ key: 'Jaahdytys', label: 'Jäähdytys' });
  if (view.mittausLammitysTestattu || modeHasValues('Lammitys')) modes.push({ key: 'Lammitys', label: 'Lämmitys' });

  const virta = [view.mittausAmpeeriL1, view.mittausAmpeeriL2, view.mittausAmpeeriL3].map(text);
  const virtaText = virta.some(Boolean)
    ? virta.length && view.mittausVaiheMaara === '1'
      ? `${virta[0]} A`
      : virta.map((v, i) => (v ? `L${i + 1} ${v}` : '')).filter(Boolean).join(' / ') + ' A'
    : '';
  const summary = [
    view.mittausJaahdytysTestattu ? mark(true, esc, 'Jäähdytys testattu') : '',
    view.mittausLammitysTestattu ? mark(true, esc, 'Lämmitys testattu') : '',
    kv('Ulko °C', text(view.mittausUlkoLampotila), esc),
    kv('Testaus °C', text(view.mittausTestausLampotila), esc),
    kv('Virta', virtaText, esc),
  ].filter(Boolean);

  const tables = modes
    .map(({ key, label }) => {
      const fields = MODE_FIELDS.filter((f) => measurements.some((m) => get(m, f, key)));
      if (fields.length === 0) return '';
      const rows = measurements
        .map((m, i) => `<tr style="border-top:1px solid #e2e8f0;"><td>${measurements.length > 1 ? `SY ${i + 1}` : ''}</td>${fields.map((f) => `<td>${esc(get(m, f, key) || '—')}</td>`).join('')}</tr>`)
        .join('');
      return `<table style="width:100%;border-collapse:collapse;font-size:inherit;margin-top:2px;">
        <thead><tr style="color:#64748b;text-align:left;"><th>${esc(label)}</th>${fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table>`;
    })
    .filter(Boolean)
    .join('');

  if (summary.length === 0 && !tables) return '';
  return `<div>${heading('Mittaukset', esc)}<div style="display:flex;flex-wrap:wrap;gap:0 10px;">${summary.join('')}</div>${tables}</div>`;
}

function koeAika(pvm: string, klo: string, kestoMin: string, huoltoPvm: string): string {
  const res = resolveKoePaivamaaraJaKello(pvm, klo, huoltoPvm);
  if (!res.pvmIso || !res.klo) return text(kestoMin) ? `${text(kestoMin)} min` : '';
  const loppu = laskeKokeLoppuaikaFi(res.pvmIso, res.klo, kestoMin);
  const loppuKlo = loppu.split(' ').pop() ?? '';
  return `${res.pvmIso} ${res.klo}${loppuKlo ? `–${loppuKlo}` : ''}${text(kestoMin) ? ` (${text(kestoMin)} min)` : ''}`;
}

function tulosHtml(tulos: string): string {
  if (tulos === 'hyvaksytty') return '<span style="color:#16a34a;font-weight:700;">Hyväksytty</span>';
  if (tulos === 'hylatty') return '<span style="color:#b91c1c;font-weight:700;">Hylätty</span>';
  return '';
}

function renderTestPhotos(items: MaintenanceReportPhotoItem[] | undefined, esc: Esc, options: IlpPrintOptions): string {
  const escAttr = options.escAttr ?? esc;
  const photos = (items ?? [])
    .map((item) => {
      const href = options.resolvePhotoHref?.(item) ?? '';
      const comment = text(item.comment);
      if (!href) return comment ? `<div style="color:#475569;">${esc(comment)}</div>` : '';
      return `<figure style="margin:0;width:31%;">
        <img src="${escAttr(href)}" alt="" style="width:100%;max-height:120px;object-fit:contain;border:1px solid #cbd5e1;border-radius:3px;display:block;" />
        ${comment ? `<figcaption style="color:#475569;font-size:9px;">${esc(comment)}</figcaption>` : ''}
      </figure>`;
    })
    .filter(Boolean)
    .join('');
  return photos ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">${photos}</div>` : '';
}

/** Laitekohtainen tiiveyskoe ja tyhjiöinti kortin sisään. */
function renderDeviceTests(view: HuoltoReportData, esc: Esc, options: IlpPrintOptions): string {
  const huoltoPvm = text(view.huoltoPaivamaara);
  const parts: string[] = [];
  if (ilpDeviceTestEnabled(view, 'tiiveyskoe')) {
    const tk = view.tiiveyskoeData;
    const line = [
      text(tk.testipaineBar) && `${text(tk.testipaineBar)} bar`,
      koeAika(tk.koeAlkaaPvm, tk.koeAlkaaKlo, tk.kestoMin, huoltoPvm),
      text(tk.testauslampotila) && `${text(tk.testauslampotila)} °C`,
      text(tk.menetelma),
    ].filter(Boolean).map((v) => esc(v));
    const tulos = tulosHtml(tk.tulos);
    if (tulos) line.push(tulos);
    parts.push(`<div>${heading('Tiiveyskoe', esc)}<div>${line.join(' · ') || '—'}</div>
      ${text(tk.huom) ? `<div style="color:#334155;">${formatHuomioPrintHtml(text(tk.huom), esc)}</div>` : ''}
      ${renderTestPhotos(tk.todisteKuvat, esc, options)}</div>`);
  }
  if (ilpDeviceTestEnabled(view, 'tyhjiointi')) {
    const ty = view.tyhjiointiData;
    const line = [
      formatTyhjiointiLoppupaine(ty.loppupaineArvo, ty.loppupaineYksikko),
      koeAika(ty.koeAlkaaPvm, ty.koeAlkaaKlo, ty.kestoMin, huoltoPvm),
      text(ty.kaytettyPainemittari),
    ].filter(Boolean).map((v) => esc(v));
    const tulos = tulosHtml(ty.tulos);
    if (tulos) line.push(tulos);
    parts.push(`<div>${heading('Tyhjiöinti', esc)}<div>${line.join(' · ') || '—'}</div>
      ${text(ty.huom) ? `<div style="color:#334155;">${formatHuomioPrintHtml(text(ty.huom), esc)}</div>` : ''}
      ${renderTestPhotos(ty.todisteKuvat, esc, options)}</div>`);
  }
  if (parts.length === 0) return '';
  return `<div style="display:grid;grid-template-columns:repeat(${parts.length},minmax(0,1fr));gap:8px;margin-top:4px;">${parts.join('')}</div>`;
}

function renderIlpDeviceCard(view: HuoltoReportData, index: number, esc: Esc, options: IlpPrintOptions): string {
  const state = ilpDeviceState(view);
  const border = state === 'faulty' ? '#dc2626' : state === 'ok' ? '#16a34a' : '#cbd5e1';
  const bg = state === 'faulty' ? '#fef2f2' : '#fff';
  const label = ilpDeviceLabel(view, index);
  const sijainti = text(view.laiteSijainti);
  const meta = [
    text(view.laiteValmistaja),
    text(view.ulkoyksikkoMalli) || text(view.laiteMalli),
    text(view.ulkoyksikkoSarjanumero) && `S/N ${text(view.ulkoyksikkoSarjanumero)}`,
    refrigerantLine(view),
  ]
    .filter(Boolean)
    .join(' · ');
  const title = [label, sijainti && sijainti !== label ? sijainti : ''].filter(Boolean).join(' · ');
  const badge = state === 'faulty'
    ? '<span style="color:#b91c1c;font-weight:700;">VIKA</span>'
    : state === 'ok'
      ? '<span style="color:#16a34a;font-weight:700;">OK</span>'
      : '';
  const ulko = renderUlkoyksikko(view, esc);
  const sisa = renderSisayksikot(view, esc);
  const mittaus = renderMittaukset(view, esc);
  const huom = text(view.ilpLaiteHuomiot);
  const huomHtml = huom
    ? `<div style="margin-top:3px;${view.ilpLaiteHuomiotLuonne === 'vika' ? 'color:#b91c1c;font-weight:600;' : ''}">${formatHuomioPrintHtml(huom, esc)}</div>`
    : '';
  return `
  <div class="ilp-device-card" style="border:1px solid ${border};border-left:4px solid ${border};background:${bg};border-radius:3px;padding:5px 7px;margin-top:6px;page-break-inside:avoid;break-inside:avoid;">
    <div style="display:flex;justify-content:space-between;gap:8px;">
      <strong style="font-size:11px;">${index + 1}. ${esc(title)}</strong>${badge}
    </div>
    ${meta ? `<div style="color:#475569;margin-bottom:3px;">${esc(meta)}</div>` : ''}
    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:8px;">
      ${ulko || '<div></div>'}
      ${sisa || '<div></div>'}
    </div>
    ${mittaus ? `<div style="margin-top:4px;">${mittaus}</div>` : ''}
    ${renderDeviceTests(view, esc, options)}
    ${huomHtml}
  </div>`;
}

/** Laitekortit (yksi tai useampi ilmalämpöpumppu) yhteen laatikkoon. */
export function generateIlpLaitteetPrintHtml(devices: HuoltoReportData[], esc: Esc, options: IlpPrintOptions = {}): string {
  const kohde = text(options.kohde);
  if (devices.length === 0) return '';
  const sisaCount = devices.reduce((sum, d) => sum + (d.sisayksikkoMaara > 0 ? d.sisayksikkoMaara : 1), 0);
  const faults = devices.filter((d) => ilpDeviceState(d) === 'faulty').length;
  const strip = devices.length > 1 || kohde
    ? `<div style="display:flex;flex-wrap:wrap;gap:4px 16px;padding:3px 7px;background:#e0f7fa;border:1px solid #b2ebf2;border-radius:3px;">
        ${devices.length > 1 ? `<div>Laitteita <strong>${devices.length}</strong></div>` : ''}
        ${devices.length > 1 ? `<div>Sisäyksiköitä <strong>${sisaCount}</strong></div>` : ''}
        ${kohde ? `<div>Kohde <strong>${esc(kohde)}</strong></div>` : ''}
        ${faults > 0 ? `<div style="color:#b91c1c;">Vikoja <strong>${faults}</strong></div>` : ''}
      </div>`
    : '';
  const legend = `<div style="color:#64748b;font-size:9px;margin-top:3px;">${SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => `${CHECK_SHORT[item.field]} = ${esc(item.label)}`).join(' · ')}</div>`;
  const cards = devices.map((view, index) => renderIlpDeviceCard(view, index, esc, options)).join('');
  return `
  <div class="box-content" style="border-color:${ACCENT};margin-top:8px;">
    <div style="border-bottom:2px solid ${ACCENT};padding-bottom:2px;margin-bottom:4px;">
      <strong style="font-size:14px;color:${ACCENT};">ILMALÄMPÖPUMPUT</strong>
    </div>
    <div style="font-size:10px;line-height:1.4;">
      ${strip}
      ${legend}
      ${cards}
    </div>
  </div>`;
}
