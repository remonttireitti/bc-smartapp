/**
 * Ilmalämpöpumpun (yksi laite / pöytäkirja) huoltopöytäkirjan tuloste.
 * Hillitty A4-asettelu: musta/harmaa teksti, ohuet harmaat viivat, vaaleanharmaat otsikot,
 * väri vain tilassa (Kunnossa / Vika). Tulostuu hyvin myös mustavalkoisena.
 */
import type { HuoltoReportData, MittausSisayksikkoData, SisayksikkoData } from './types';
import type { MaintenanceReportPhotoItem } from '../maintenanceReportImages';
import { resolveMaintenancePrintPhotoHref } from '../maintenanceReportPrintImages';
import { formatHuomioPrintHtml } from './formatHuomioPrintHtml';
import {
  normalizeHuoltoInspectionStatus,
  normalizeLegacyInspectionStatus,
  ulkoyksikkoInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';
import { formatTyhjiointiLoppupaine, laskeKokeLoppuaikaFi, resolveKoePaivamaaraJaKello } from './kokeAikaUtils';
import { hasPrintableValue, normalizePrintText } from './printFieldVisibility';
import { SISAYKSIKKO_TARKASTUS_ITEMS, sisayksikkoKohtaEiTarkastettu } from './sisayksikkoTarkastus';
import {
  sisayksikkoImageUrl,
  sisayksikkoOverlayPositions,
  sisayksikkoSupportsSchematic,
  sisayksikkoTyyppiLabel,
} from './sisayksikkoTypes';
import { getRefrigerantGWP } from './utils';
import { ilpDeviceModel, ilpDeviceSerial } from './ilpIdentity';
import { PRINT_SHELL_CSS } from './printShell';

export interface IlpPrintMeta {
  companyName: string;
  logoUrl?: string;
  imageUrls?: Record<string, string>;
  docTitle: string;
  fault: boolean;
  companyLines?: string[];
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function txt(v: unknown): string {
  return normalizePrintText(v);
}

/** Avain–arvo-rivi; tyhjät jätetään pois. */
function kv(label: string, value: unknown, unit = ''): string {
  if (!hasPrintableValue(value)) return '';
  return `<tr><th>${esc(label)}</th><td>${esc(txt(value))}${unit ? ` ${esc(unit)}` : ''}</td></tr>`;
}
function kvTable(rows: string[]): string {
  const body = rows.filter(Boolean).join('');
  return body ? `<table class="kv">${body}</table>` : '';
}
function section(title: string, inner: string, extraClass = ''): string {
  if (!inner.trim()) return '';
  return `<section class="sec ${extraClass}"><h2>${esc(title)}</h2>${inner}</section>`;
}

function statusCell(status: HuoltoInspectionStatus): string {
  if (status === 'ok') return '<span class="st st-ok">✓ Kunnossa</span>';
  if (status === 'faulty') return '<span class="st st-bad">✗ Vika</span>';
  if (status === 'na') return '<span class="st st-na">Ei kuulu</span>';
  return '';
}

function checkTable(rows: Array<{ label: string; status: HuoltoInspectionStatus; neutralText?: string }>): string {
  const body = rows
    .map((r) => {
      const cell = r.neutralText ? `<span class="st st-na">${esc(r.neutralText)}</span>` : statusCell(r.status);
      return cell ? `<tr><th>${esc(r.label)}</th><td class="st-col">${cell}</td></tr>` : '';
    })
    .join('');
  return body ? `<table class="kv checks">${body}</table>` : '';
}

const ASENNUSTAPA: Record<string, string> = {
  maateline: 'Maateline',
  seinateline: 'Seinäteline',
  sokkeliteline: 'Sokkeliteline',
  parveketeline: 'Parveketeline',
};

function renderOutdoor(data: HuoltoReportData): string {
  const status = normalizeHuoltoInspectionStatus(data.ulkoyksikkoTarkastusTila) ?? ulkoyksikkoInspectionStatus(data);
  const asennus =
    data.ulkoyksikkoAsennustapa === 'muu'
      ? data.ulkoyksikkoAsennustapaMuu
      : ASENNUSTAPA[data.ulkoyksikkoAsennustapa ?? ''] ?? data.ulkoyksikkoAsennustapa;
  const ticks = [
    data.ulkoyksikkoKennosPuhdas
      ? `Kenno puhdas / puhdistettu${hasPrintableValue(data.ulkoyksikkoKennoPuhdistustapa) ? ` (${txt(data.ulkoyksikkoKennoPuhdistustapa)})` : ''}`
      : '',
    data.ulkoyksikkoSulatausVedenKeraily
      ? `Sulatusveden keräily${data.ulkoyksikkoSulatausVedenTarkistettu ? ' tarkistettu' : ''}`
      : '',
    data.ulkoyksikkoTurvakytkin ? 'Turvakytkin' : '',
    data.ulkoyksikkoSuojakotelo ? 'Suojakotelo' : '',
  ].filter(Boolean);
  const rows = [
    status ? `<tr><th>Tarkastus</th><td class="st-col">${statusCell(status)}</td></tr>` : '',
    kv('Jäähdytysteho', data.ulkoyksikkoJaahdytysTeho, 'kW'),
    kv('Lämmitysteho', data.ulkoyksikkoLammitysTeho, 'kW'),
    kv('Asennustapa', asennus),
    ticks.length ? `<tr><th>Todettu</th><td>${ticks.map(esc).join(' · ')}</td></tr>` : '',
    status === 'faulty' && hasPrintableValue(data.ulkoyksikkoTarkastusHuomio)
      ? `<tr><th>Vika</th><td class="fault-text">${esc(txt(data.ulkoyksikkoTarkastusHuomio))}</td></tr>`
      : '',
  ];
  return kvTable(rows);
}

function renderRefrigerant(data: HuoltoReportData): string {
  const tyyppi = txt(data.kylmaaineTyyppi);
  const gwp = tyyppi ? getRefrigerantGWP(tyyppi) : 0;
  const valm = parseFloat(String(data.kylmaaineValmistajaMaara ?? '')) || 0;
  const lis = parseFloat(String(data.kylmaaineLisattyMaara ?? '')) || 0;
  const co2 = txt(data.kylmaaineCO2Ekv);
  return kvTable([
    kv('Kylmäaine', tyyppi ? `${tyyppi}${gwp > 0 ? ` (GWP ${gwp})` : ''}` : ''),
    valm > 0 ? kv('Valmistajan täyttö', valm, 'kg') : '',
    lis > 0 ? kv('Lisätty', lis, 'kg') : '',
    valm + lis > 0 && lis > 0 ? kv('Yhteensä', (valm + lis).toFixed(2), 'kg') : '',
    kv('Putkimatka', data.kylmaainePutkimatka, 'm'),
    kv('CO₂-ekvivalentti', co2, 't'),
    data.huoltoKylmaaineVuotoTarkastus ? `<tr><th>Vuototarkastus</th><td class="st-col"><span class="st st-ok">✓ Ei vuotoja</span></td></tr>` : '',
  ]);
}

function deg(v: unknown): string {
  const s = txt(v);
  return s ? `${s} °C` : '';
}
function bar(v: unknown): string {
  const s = txt(v);
  return s ? `${s} bar` : '';
}
/** "J 15 °C · L 16 °C" tai yksi arvo, jos tiloja on vain yksi / arvot samat. */
function modePair(j: string, l: string): string {
  if (j && l) return j === l ? j : `J ${j} · L ${l}`;
  return j || l;
}

function anchorStyle(a: { top?: string; bottom?: string; left?: string; right?: string }): string {
  return ['position:absolute', a.top ? `top:${a.top}` : '', a.bottom ? `bottom:${a.bottom}` : '', a.left ? `left:${a.left}` : '', a.right ? `right:${a.right}` : '']
    .filter(Boolean)
    .join(';');
}
function chip(label: string, value: string): string {
  return value ? `<div class="chip"><span>${esc(label)}</span> ${esc(value)}</div>` : '';
}

function renderIndoorUnit(
  unit: SisayksikkoData,
  m: MittausSisayksikkoData | undefined,
  index: number,
  origin: string,
): string {
  const mm = (m ?? {}) as unknown as Record<string, unknown>;
  const pick = (a: string, legacy: string) => txt(mm[a]) || txt(mm[legacy]);
  const huone = modePair(deg(pick('sisalampotilaJaahdytys', 'sisalampotila')), deg(pick('sisalampotilaLammitys', 'sisalampotila')));
  const paluu = modePair(deg(pick('paluuLampotilaJaahdytys', 'paluuLampotila')), deg(pick('paluuLampotilaLammitys', 'paluuLampotila')));
  const puhallus = modePair(deg(pick('puhallusLampotilaJaahdytys', 'puhallusLampotila')), deg(pick('puhallusLampotilaLammitys', 'puhallusLampotila')));
  const imu = modePair(bar(mm.imupaineJaahdytys), bar(mm.imupaineLammitys));
  const kp = modePair(bar(mm.korkeapaineJaahdytys), bar(mm.korkeapaineLammitys));
  const ilma = modePair(pick('ilmanmaaraM3hJaahdytys', 'ilmanmaaraM3h'), pick('ilmanmaaraM3hLammitys', 'ilmanmaaraM3h'));

  let figure = '';
  if (sisayksikkoSupportsSchematic(unit.tyyppi)) {
    const pos = sisayksikkoOverlayPositions(unit.tyyppi);
    figure = `<div class="unit-fig">
      <img src="${escAttr(sisayksikkoImageUrl(unit.tyyppi, origin))}" alt="" />
      ${huone ? `<div style="${anchorStyle(pos.huone)}">${chip('Huone', huone)}</div>` : ''}
      ${puhallus ? `<div style="${anchorStyle(pos.puhallus)}">${chip('Puhallus', puhallus)}</div>` : ''}
      ${paluu ? `<div style="${anchorStyle(pos.paluu)}">${chip('Paluu', paluu)}</div>` : ''}
    </div>`;
  }
  const kondenssi =
    unit.kondenssivesi === 'pumpulla'
      ? `Pumppu${hasPrintableValue(unit.pumppuMalli) ? ` (${txt(unit.pumppuMalli)})` : ''}`
      : unit.kondenssivesi === 'painovoimainen'
        ? 'Painovoimainen'
        : '';
  const ident = kvTable([
    kv('Malli', unit.malli),
    kv('Sarjanumero', unit.sarjanumero),
    kv('Kondenssivesi', kondenssi),
    // Kuvaton tyyppi: mittaukset taulukkoon.
    figure ? '' : kv('Huone', huone),
    figure ? '' : kv('Paluu', paluu),
    figure ? '' : kv('Puhallus', puhallus),
    kv('Imupaine', imu),
    kv('Korkeapaine', kp),
    kv('Ilmanmäärä', ilma, 'm³/h'),
  ]);
  const checks = checkTable(
    SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => ({
      label: item.label,
      status: normalizeLegacyInspectionStatus(unit[item.field]),
      neutralText: sisayksikkoKohtaEiTarkastettu(unit, item.field) ? 'Ei tarkastettu' : undefined,
    })),
  );
  const note = hasPrintableValue(unit.huomio)
    ? `<div class="note${unit.huomioTyyppi === 'vika' ? ' fault-text' : ''}">${formatHuomioPrintHtml(String(unit.huomio), esc)}</div>`
    : '';
  const title = `Sisäyksikkö ${index + 1}${sisayksikkoTyyppiLabel(unit.tyyppi) ? ` · ${sisayksikkoTyyppiLabel(unit.tyyppi)}` : ''}`;
  return `<div class="unit"><h3>${esc(title)}</h3>${figure}${ident}${checks}${note}</div>`;
}

function renderIndoor(data: HuoltoReportData, origin: string): string {
  const count = data.sisayksikkoMaara > 0 ? data.sisayksikkoMaara : 1;
  const units = (data.sisayksikkoData ?? []).slice(0, count);
  if (!units.length) return '';
  const cards = units.map((u, i) => renderIndoorUnit(u, data.mittausSisayksikot?.[i], i, origin)).join('');
  return `<div class="units units-${Math.min(units.length, 2)}">${cards}</div>`;
}

function renderTestRun(data: HuoltoReportData): string {
  const modes = [data.mittausJaahdytysTestattu ? 'Jäähdytys' : '', data.mittausLammitysTestattu ? 'Lämmitys' : ''].filter(Boolean).join(' + ');
  const virrat = ['mittausAmpeeriL1', 'mittausAmpeeriL2', 'mittausAmpeeriL3']
    .map((k) => txt((data as unknown as Record<string, unknown>)[k]))
    .filter(Boolean);
  return kvTable([
    kv('Koeajo', modes),
    kv('Testauslämpötila', deg(data.mittausTestausLampotila)),
    kv('Ulkolämpötila', deg(data.mittausUlkoLampotila)),
    virrat.length ? kv('Ulkoyksikön virta', `${virrat.join(' / ')} A`) : '',
  ]);
}

function photoHref(item: unknown, imageUrls?: Record<string, string>): string {
  return resolveMaintenancePrintPhotoHref(item as MaintenanceReportPhotoItem, imageUrls);
}
function photoGrid(items: unknown, caption: string, imageUrls?: Record<string, string>): string {
  const figs = photoFigures(items, caption, imageUrls).join('');
  return figs ? `<div class="photos">${figs}</div>` : '';
}
function photoFigures(items: unknown, caption: string, imageUrls?: Record<string, string>): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, i) => {
      const href = photoHref(item, imageUrls);
      if (!href) return '';
      const comment = item && typeof item === 'object' ? txt((item as { comment?: string }).comment) : '';
      return `<figure><img src="${escAttr(href)}" alt="" /><figcaption>${esc(caption)} ${i + 1}${comment ? ` — ${esc(comment)}` : ''}</figcaption></figure>`;
    })
    .filter(Boolean);
}

function koeTulos(t: string | undefined): string {
  if (t === 'hyvaksytty') return '<span class="st st-ok">✓ Hyväksytty</span>';
  if (t === 'hylatty') return '<span class="st st-bad">✗ Hylätty</span>';
  return '';
}

function renderTests(data: HuoltoReportData, imageUrls?: Record<string, string>): string {
  const pvm = txt(data.huoltoPaivamaara);
  const parts: string[] = [];
  const photos: string[] = [];
  if (data.selectedModules?.tiiveyskoe) {
    const tv = data.tiiveyskoeData;
    const res = resolveKoePaivamaaraJaKello(tv.koeAlkaaPvm, tv.koeAlkaaKlo, pvm);
    const alku = res.pvmIso && res.klo ? `${res.pvmIso} klo ${res.klo}` : '';
    const tulos = koeTulos(tv.tulos);
    const t = kvTable([
      tulos ? `<tr><th>Tulos</th><td class="st-col">${tulos}</td></tr>` : '',
      kv('Koepaine', tv.testipaineBar, 'bar'),
      kv('Alkoi', alku),
      kv('Kesto', tv.kestoMin, 'min'),
      alku ? kv('Päättyi', laskeKokeLoppuaikaFi(res.pvmIso, res.klo, tv.kestoMin)) : '',
      kv('Lämpötila', deg(tv.testauslampotila)),
      kv('Menetelmä', tv.menetelma),
      kv('Huom', tv.huom),
    ]);
    if (t) parts.push(`<div class="keep"><h3>Tiiveyskoe</h3>${t}</div>`);
    photos.push(...photoFigures(tv.todisteKuvat, 'Tiiveyskoe', imageUrls));
  }
  if (data.selectedModules?.tyhjiointi) {
    const ty = data.tyhjiointiData;
    const res = resolveKoePaivamaaraJaKello(ty.koeAlkaaPvm, ty.koeAlkaaKlo, pvm);
    const alku = res.pvmIso && res.klo ? `${res.pvmIso} klo ${res.klo}` : '';
    const tulos = koeTulos(ty.tulos);
    const t = kvTable([
      tulos ? `<tr><th>Tulos</th><td class="st-col">${tulos}</td></tr>` : '',
      kv('Loppupaine', formatTyhjiointiLoppupaine(ty.loppupaineArvo, ty.loppupaineYksikko)),
      kv('Alkoi', alku),
      kv('Kesto', ty.kestoMin, 'min'),
      alku ? kv('Päättyi', laskeKokeLoppuaikaFi(res.pvmIso, res.klo, ty.kestoMin)) : '',
      kv('Painemittari', ty.kaytettyPainemittari),
      kv('Huom', ty.huom),
    ]);
    if (t) parts.push(`<div class="keep"><h3>Tyhjiöinti</h3>${t}</div>`);
    photos.push(...photoFigures(ty.todisteKuvat, 'Tyhjiöinti', imageUrls));
  }
  if (!parts.length) return '';
  const grid = photos.length ? `<div class="photos">${photos.join('')}</div>` : '';
  return section('Painekoe ja tyhjiöinti', `<div class="cols-2 keep">${parts.join('')}</div>${grid}`);
}



export function generateIlpPrintHtml(data: HuoltoReportData, meta: IlpPrintMeta): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pvm = txt(data.huoltoPaivamaara) || new Date().toLocaleDateString('fi-FI');
  const logo = meta.logoUrl ? `<img src="${escAttr(meta.logoUrl)}" alt="" />` : '';
  const companyLine = [meta.companyName, ...(meta.companyLines ?? [])].filter(Boolean).join(' · ');

  const verdict = meta.fault
    ? '<span class="verdict st-bad">✗ Vika havaittu</span>'
    : data.huoltoSuoritettu || data.huoltoLaiteessaVika === false
      ? '<span class="verdict st-ok">✓ Ei vikaa havaittu</span>'
      : '';
  const bandItems = [
    verdict,
    data.huoltoSuoritettu ? '<span>Huolto suoritettu</span>' : '',
    `<span class="muted">${esc(pvm)}</span>`,
    hasPrintableValue(data.huoltoSuorittajaNimi) ? `<span class="muted">${esc(txt(data.huoltoSuorittajaNimi))}</span>` : '',
  ].filter(Boolean);

  const customer = kvTable([
    kv('Asiakas', data.asiakas),
    kv('Osoite', data.osoite),
    kv('Y-tunnus', data.asiakasYtunnus),
    kv('Yhteyshenkilö', data.asiakasYhteyshenkilo),
    kv('Puhelin', data.asiakasPuhelin),
    kv('Sähköposti', data.asiakasEmail),
  ]);
  const device = kvTable([
    kv('Tunnus', data.laiteTunnus),
    kv('Sijainti', data.laiteSijainti),
    kv('Valmistaja', data.laiteValmistaja),
    kv('Malli', ilpDeviceModel(data)),
    kv('Sarjanumero', ilpDeviceSerial(data)),
  ]);
  const testRun = renderTestRun(data);

  const outdoor = renderOutdoor(data);
  const refrigerant = renderRefrigerant(data);

  const huom = txt(data.huomiot);
  const notesInner = [
    huom ? `<div class="note${data.huomiotLuonne === 'vika' ? ' fault-text' : ''}">${formatHuomioPrintHtml(huom, esc)}</div>` : '',
    photoGrid(data.huomiotLiitteet, 'Liite', meta.imageUrls),
  ].join('');

  return `<style>${PRINT_SHELL_CSS}</style>
<div class="rp ilp-print">
  <header class="hdr">
    <div>${logo}${companyLine ? `<div class="co">${esc(companyLine)}</div>` : ''}</div>
    <div class="ttl"><h1>${esc(meta.docTitle)}</h1><div class="sub">Ilmalämpöpumppu${hasPrintableValue(data.laiteTunnus) ? ` · ${esc(txt(data.laiteTunnus))}` : ''}</div></div>
  </header>
  <div class="band">${bandItems.join('')}</div>
  <div class="info keep">
    <div><h2>Asiakas</h2>${customer}</div>
    <div><h2>Laite</h2>${device}</div>
    <div><h2>Koeajo</h2>${testRun || '<table class="kv"><tr><td>—</td></tr></table>'}</div>
  </div>
  ${outdoor || refrigerant
    ? `<section class="sec keep cols-2">
        <div><h2>Ulkoyksikkö</h2>${outdoor || '<table class="kv"><tr><td>—</td></tr></table>'}</div>
        <div><h2>Kylmäaine</h2>${refrigerant || '<table class="kv"><tr><td>—</td></tr></table>'}</div>
      </section>`
    : ''}
  ${section('Sisäyksiköt ja mittaukset', renderIndoor(data, origin))}
  ${renderTests(data, meta.imageUrls)}
  ${section('Huomiot', notesInner)}
  <div class="sign">
    <div><strong>${esc(txt(data.huoltoSuorittajaNimi) || '')}</strong>Suorittaja${hasPrintableValue(data.huoltoSuorittajaTUKES) ? ` · TUKES ${esc(txt(data.huoltoSuorittajaTUKES))}` : ''}</div>
    <div><strong>${esc(pvm)}</strong>Päivämäärä</div>
    <div><strong></strong>Allekirjoitus</div>
  </div>
</div>`;
}
