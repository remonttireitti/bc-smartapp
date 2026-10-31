/**
 * MLP (maalämpöpumppu) -tuloste: keruupiiri, latauspiiri, tulistuspiiri, käyttövesi, kiinteistön piirit, energiatehokkuus.
 * Rakennetaan printKit-palikoista: tyhjä rivi / lohko / otsikko jää pois, laskettua arvoa ei näytetä jos se ei ole laskettavissa
 * (ei "0,00 kW", ei "Ei voida laskea" -laatikkoa).
 */
import type { HeatingCircuitData, HeatingElementData, HuoltoReportData, MlpData } from './types';
import { getMlpPumpSyottoValinta } from './sahkoVaiheUtils';
import { isMlpVesiNeste, kayttovesiLisalammitinSijaintiOptions, lampoJakotapaOptions, mlpNestOptions } from './constants';
import { keruupiiriSectionTitle, isChillerLikeDevice } from './deviceModuleLogic';
import { energiatehokkuusSectionTitle, kiinteistoPiiriSectionTitle } from './sectionTitles';
import { computeMlpHeatPumpEnergyBalance } from './mlpEnergyCalc';
import {
  mlpKeruupiiriInspectionStatus,
  mlpLampoInspectionStatus,
  mlpLatauspiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
} from './huoltoInspectionStatus';
import { inspectionChipHtml, renderInspectionHuomioRow } from './inspectionPrint';
import { blk, chk, cmp, esc, kvr as row, pair, warn } from './printKit';
import { hasPrintableValue } from './printFieldVisibility';
import { fiNumber } from './printFormat';
import { phaseCurrentRows } from './printPhaseHelpers';
import { hideMaintenancePrintWarnings } from './defaults';

export type MlpPrintBox = (title: string, inner: string, statusHtml?: string) => string;

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number, digits = 2) => fiNumber(n.toFixed(digits));
const kw = (n: number) => `${fmt(n)}\u00a0kW`;

/** Teho kW = c × virtaus (l/s) × ΔT. null, jos jokin lähtötieto puuttuu. */
function liquidPower(virtaus: unknown, meno: unknown, tulo: unknown, neste: unknown): number | null {
  if (!hasPrintableValue(virtaus) || !hasPrintableValue(meno) || !hasPrintableValue(tulo)) return null;
  const c = num(neste);
  const dT = Math.abs(num(meno) - num(tulo));
  const v = num(virtaus);
  return v > 0 && dT > 0 && c > 0 ? c * v * dT : null;
}

/** Nesteen selite; jos sama c-arvo on usealla nesteellä (3,4 / 3,2 / 3,0), näytetään vain c. */
function nesteText(value: unknown): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const matches = mlpNestOptions.filter((o) => o.value === v);
  if (matches.length === 1) return matches[0].label.replace(/\s*\(c = [^)]*\)/, '');
  return `c = ${fiNumber(v)} kJ/kgK`;
}

function flowText(virtausLs: unknown): string {
  if (!hasPrintableValue(virtausLs)) return '';
  const ls = num(virtausLs);
  if (ls <= 0) return '';
  return `${fmt(ls, ls < 1 ? 2 : 1)} l/s · ${fmt(ls * 3.6, 1)} m³/h`;
}

type PumpInput = {
  valmistaja?: string;
  malli?: string;
  tyyppiVanha?: string;
  nopeus?: string;
  kunnossa?: boolean;
  syotto?: string;
  kolme?: boolean;
  v1?: string;
  l1?: string;
  l2?: string;
  l3?: string;
  tarkastettu?: boolean;
  extra?: Array<string | false | undefined>;
};

function pumpBlock(p: PumpInput, title = 'Pumppu'): string {
  const hasModel = hasPrintableValue(p.valmistaja) || hasPrintableValue(p.malli);
  const sel = getMlpPumpSyottoValinta(p.syotto as never, p.kolme);
  const supply: Array<string | false> =
    sel === '230_1' || sel === '400_3'
      ? [
          row('Syöttö', sel === '400_3' ? '400 V, 3-vaihe' : '230 V, 1-vaihe'),
          sel === '230_1' ? row('Käyntivirta', p.v1, 'A') : false,
          sel === '400_3' ? phaseCurrentRows(p.l1, p.l2, p.l3) : false,
        ]
      : [];
  return blk(title, [
    row('Valmistaja', p.valmistaja),
    row('Malli', p.malli),
    !hasModel && row('Tyyppi', p.tyyppiVanha),
    row('Nopeus / asetus', p.nopeus),
    ...supply,
    chk('Pumppu kunnossa', p.kunnossa),
    ...(p.extra ?? []),
  ]);
}

function expansionBlock(koko: unknown, esipaine: unknown, tarkistettu: boolean | undefined): string {
  return blk('Paisunta-astia', [row('Koko', koko, 'l'), row('Esipaine', esipaine, 'bar'), chk('Tarkistettu', tarkistettu)]);
}

function measurementsBlock(o: {
  paine?: unknown;
  paineLabel?: string;
  virtaus: unknown;
  meno: unknown;
  paluu: unknown;
  teho: number | null;
}): string {
  const dT = hasPrintableValue(o.meno) && hasPrintableValue(o.paluu) ? Math.abs(num(o.meno) - num(o.paluu)) : 0;
  return blk('Mittaukset', [
    row(o.paineLabel ?? 'Paine', o.paine, 'bar'),
    row('Virtaus', flowText(o.virtaus)),
    pair(['Meno', o.meno, '°C'], ['Paluu', o.paluu, '°C']),
    dT > 0 && row('Lämpötilaero', fmt(dT, 1), 'K'),
    o.teho != null && row('Teho', kw(o.teho)),
  ]);
}

function statusLine(status: unknown): string {
  const chip = inspectionChipHtml(status, esc);
  return chip ? `<div class="kv2"><div class="kvr"><span>Tarkastus</span><span>${chip}</span></div></div>` : '';
}

function withStatus(status: unknown, huomio: string | undefined, body: string): string {
  if (!body.trim()) return '';
  const normalized = normalizeHuoltoInspectionStatus(status);
  return `${statusLine(status)}${body}${normalized === 'faulty' ? renderInspectionHuomioRow(huomio, esc) : ''}`;
}

type Powers = {
  qKeruu: number | null;
  qLataus: number | null;
  qTulistus: number | null;
};

function computePowers(m: MlpData): Powers {
  return {
    qKeruu: liquidPower(m.keruupiiriVirtaus, m.keruupiiriMeno, m.keruupiiriTulo, m.keruupiiriNeste),
    qLataus: liquidPower(m.latausVirtaus, m.latausMeno, m.latausTulo, m.latausNeste || m.latausJarjestelmanNeste),
    qTulistus: m.latausTulistuspiiri
      ? liquidPower(m.latausTulistusVirtaus, m.latausTulistusMeno, m.latausTulistusTulo, m.latausTulistusNeste || m.latausNeste)
      : null,
  };
}

function keruuSection(m: MlpData, powers: Powers, title: string, box: MlpPrintBox): string {
  const status = mlpKeruupiiriInspectionStatus(m);
  const glycol = hasPrintableValue(m.keruupiiriNeste) && !isMlpVesiNeste(m.keruupiiriNeste);
  const body = [
    blk('Neste', [
      row('Neste', nesteText(m.keruupiiriNeste)),
      glycol && row('Pitoisuus', m.keruuNestePitoisuus, '%'),
      glycol && row('Jäätymispiste', m.keruuJaatymispiste, '°C'),
    ]),
    measurementsBlock({
      paine: m.keruupiiriPaineBar,
      paineLabel: 'Piirin paine',
      virtaus: m.keruupiiriVirtaus,
      meno: m.keruupiiriMeno,
      paluu: m.keruupiiriTulo,
      teho: powers.qKeruu,
    }),
    pumpBlock({
      valmistaja: m.keruupiiriPumpunValmistaja,
      malli: m.keruupiiriPumpunMalli,
      tyyppiVanha: m.keruupiirinPumpunTyyppi,
      nopeus: m.keruuPumppuNopeus,
      kunnossa: m.keruuPumppuKunnossa,
      syotto: m.keruupiiriPumpunSyottoValinta,
      kolme: m.keruupiiriPumppuKolmeVaihetta,
      v1: m.keruupiiriPumppuVirta1vaihe,
      l1: m.keruupiiriPumppuVirtaL1,
      l2: m.keruupiiriPumppuVirtaL2,
      l3: m.keruupiiriPumppuVirtaL3,
    }),
    expansionBlock(m.keruuPaisuntaAstiaKoko, m.keruuPaisuntaAstiaEsipaine, m.keruuPaisuntaAstiaTarkistettu),
    blk('Tarkastukset', [
      chk('Paine tarkastettu', m.keruupiirinPaineTarkastettu),
      chk('Suodatin puhdistettu', m.keruupiirissaMutapussiPuhdistettu),
      chk('Pumppu tarkastettu', m.keruupiirinPumppuTarkastettu),
      chk('Eristeet kunnossa', m.keruupiirinEristeetKunnossa),
      chk('Ilmaus tarkistettu', m.keruupiirissaAutomaattinenIlmausTarkistettu),
    ]),
  ].join('');
  return box(title, withStatus(status, m.keruupiiriTarkastusHuomio, body));
}

function jaahdytysSection(m: MlpData, box: MlpPrintBox): string {
  const vls = num(m.keruuJaahdytysVirtaus);
  const dT = Math.abs(num(m.keruuJaahdytysMenoLampotila) - num(m.keruuJaahdytysPaluuLampotila));
  const teho =
    hasPrintableValue(m.keruuJaahdytysVirtaus) &&
    hasPrintableValue(m.keruuJaahdytysMenoLampotila) &&
    hasPrintableValue(m.keruuJaahdytysPaluuLampotila) &&
    vls > 0 &&
    dT > 0
      ? 4.18 * vls * dT
      : null;
  const body = [
    blk('Tiedot', [chk('Erillinen keruu- / jäähdytyspiiri', m.keruuJaahdytysPiiri)]),
    pumpBlock({
      valmistaja: m.keruuJaahdytysPumpunValmistaja,
      malli: m.keruuJaahdytysPumpunMalli,
      tyyppiVanha: m.keruuJaahdytysPumppuTyyppi,
      syotto: m.keruuJaahdytysPumpunSyottoValinta,
      kolme: m.keruuJaahdytysPumppuKolmeVaihetta,
      v1: m.keruuJaahdytysPumppuVirta1vaihe,
      l1: m.keruuJaahdytysPumppuVirtaL1,
      l2: m.keruuJaahdytysPumppuVirtaL2,
      l3: m.keruuJaahdytysPumppuVirtaL3,
    }),
    measurementsBlock({
      virtaus: m.keruuJaahdytysVirtaus,
      meno: m.keruuJaahdytysMenoLampotila,
      paluu: m.keruuJaahdytysPaluuLampotila,
      teho,
    }),
    blk('Sähkö', [row('Käyntivirta', m.keruuJaahdytysKayntivirta, 'A')]),
  ].join('');
  return box('Erillinen keruu- / jäähdytyspiiri', body);
}

function latausSection(m: MlpData, powers: Powers, box: MlpPrintBox): string {
  const status = mlpLatauspiiriInspectionStatus(m);
  const glycol = hasPrintableValue(m.latausNeste) && !isMlpVesiNeste(m.latausNeste);
  const body = [
    blk('Neste', [
      row('Neste', m.latausNeste ? nesteText(m.latausNeste) : m.latausJarjestelmanNeste),
      glycol && row('Pakkaskestävyys', m.latausGlykoliPakkaskestavyys, '°C'),
    ]),
    measurementsBlock({
      paine: m.latausPaineBar,
      paineLabel: 'Järjestelmän paine',
      virtaus: m.latausVirtaus,
      meno: m.latausMeno,
      paluu: m.latausTulo,
      teho: powers.qLataus,
    }),
    pumpBlock(
      {
        valmistaja: m.latausPumpunValmistaja,
        malli: m.latausPumpunMalli,
        tyyppiVanha: m.latausPumpunTyyppi,
        nopeus: m.latausPumppuNopeus,
        kunnossa: m.latausPumppuKunnossa,
        syotto: m.latausPumpunSyottoValinta,
        kolme: m.latausPumppuKolmeVaihetta,
        v1: m.latausPumppuVirta1vaihe,
        l1: m.latausPumppuVirtaL1,
        l2: m.latausPumppuVirtaL2,
        l3: m.latausPumppuVirtaL3,
      },
      'Latauspumppu',
    ),
    expansionBlock(m.latausPaisuntaAstiaKoko, m.latausPaisuntaAstiaEsipaine, m.latausPaisuntaAstiaTarkistettu),
    blk('Tarkastukset', [
      chk('Paine tarkastettu', m.latausPaineTarkastettu),
      chk('Suodatin puhdistettu', m.latausMutapussiPuhdistettu),
      chk('Pumppu tarkastettu', m.latausPumppuTarkastettu),
      chk('Varoventtiili tarkastettu', m.latausVaroventtiiliTarkastettu),
      chk('Vaihtoventtiilin toiminta OK', m.latausVaihtoventtiiliToimii),
      chk('Eristeet kunnossa', m.latausEristeetKunnossa),
      chk('Ilmaus tarkistettu', m.latausAutomaattinenIlmausTarkistettu),
    ]),
  ].join('');
  return box('Latauspiiri', withStatus(status, m.latausTarkastusHuomio, body));
}

function tulistusSection(m: MlpData, powers: Powers, box: MlpPrintBox): string {
  if (!m.latausTulistuspiiri) return '';
  const body = [
    blk('Neste', [row('Neste', nesteText(m.latausTulistusNeste))]),
    measurementsBlock({
      virtaus: m.latausTulistusVirtaus,
      meno: m.latausTulistusMeno,
      paluu: m.latausTulistusTulo,
      teho: powers.qTulistus,
    }),
    pumpBlock({
      valmistaja: m.latausTulistusPumpunValmistaja,
      malli: m.latausTulistusPumpunMalli,
      tyyppiVanha: m.latausTulistusPumppuTyyppi,
      syotto: m.latausTulistusPumpunSyottoValinta,
      kolme: m.latausTulistusPumppuKolmeVaihetta,
      v1: m.latausTulistusPumppuVirta1vaihe,
      l1: m.latausTulistusPumppuVirtaL1,
      l2: m.latausTulistusPumppuVirtaL2,
      l3: m.latausTulistusPumppuVirtaL3,
    }),
  ].join('');
  return box('Tulistuspiiri', body);
}

function elementLine(v: HeatingElementData, idx: number): string {
  const parts = [
    hasPrintableValue(v.tunnus) ? String(v.tunnus).trim() : '',
    hasPrintableValue(v.teho) ? `${fiNumber(v.teho)} kW` : '',
    hasPrintableValue(v.jannite) ? `${fiNumber(v.jannite)} V` : '',
    hasPrintableValue(v.asetusarvo) ? `asetus ${fiNumber(v.asetusarvo)} °C` : '',
    v.toimintaTestattu ? 'toiminta testattu' : '',
  ].filter(Boolean);
  return parts.length ? row(`Vastus ${idx + 1}`, parts.join(' · ')) : '';
}

function kayttovesiSection(m: MlpData, box: MlpPrintBox): string {
  if (!m.kayttovesiEnabled) return '';
  const sijainti = kayttovesiLisalammitinSijaintiOptions.find((o) => o.value === m.kayttovesiSahkoVastuksetSijainti)?.label ?? '';
  const heaters = m.kayttovesiSahkoVastuksetEnabled
    ? [
        hasPrintableValue(m.kayttovesiSahkoVastuksetSijainti) && row('Lisälämmitin', sijainti),
        m.kayttovesiSahkoVastuksetSijainti === 'integroitu' && row('Lisävastuksen teho', m.kayttovesiLisavastusTeho, 'kW'),
        m.kayttovesiSahkoVastuksetSijainti === 'ulkopuolinen' && row('Lisälämmittimiä', m.kayttovesiSahkoVastuksetMaara, 'kpl'),
        ...(m.kayttovesiSahkoVastukset ?? []).map(elementLine),
      ]
    : [];
  const legionella =
    m.kayttovesiLegionellaKaytossa &&
    row(
      'Legionella-asetus',
      [hasPrintableValue(m.kayttovesiLegionellaLampotila) ? `${fiNumber(m.kayttovesiLegionellaLampotila)} °C` : '', hasPrintableValue(m.kayttovesiLegionellaAjastus) ? String(m.kayttovesiLegionellaAjastus).trim() : '']
        .filter(Boolean)
        .join(' · ') || 'käytössä',
    );
  const body = [
    blk('Varaaja', [
      row('Varaajan koko', m.kayttovesiTilavuus, 'l'),
      row('Tyyppi', m.kayttovesiVaraajaTyyppi),
      pair(['Käyttöveden asetus', m.kayttovesiLampotilaAsetus, '°C'], ['Käyttöveden lämpötila', m.kayttovesiLampotilaNykyinen, '°C']),
      legionella,
    ]),
    blk('Lisälämmitin', heaters),
    blk('Käyttövesikierto', [
      m.kayttovesiKiertoEnabled && row('Valmistaja', m.kayttovesiKiertoPumpunValmistaja),
      m.kayttovesiKiertoEnabled && row('Malli', m.kayttovesiKiertoPumpunMalli),
      m.kayttovesiKiertoEnabled && row('Virtaus', flowText(m.kayttovesiKiertoVirtaus)),
      m.kayttovesiKiertoEnabled && row('Käyntivirta', m.kayttovesiKiertoKayntivirta, 'A'),
    ]),
    blk('Tarkastukset', [
      chk('Toimilaitteet OK', m.kayttovesiToimilaitteetOK),
      chk('Varoventtiili tarkastettu', m.kayttovesiVaroventtiiliTarkastettu),
      chk('Sekoitusventtiilin toiminta OK', m.kayttovesiSekoitusventtiiliToimii),
      chk('Lisävastuksen toiminta OK', m.kayttovesiLisavastusToimii),
      chk('Anodi tarkastettu', m.kayttovesiAnodiTarkastettu),
      m.kayttovesiAnodiTarkastettu && row('Anodin kunto', m.kayttovesiAnodiHuomio),
    ]),
  ].join('');
  return box('Käyttövesi', body);
}

function heatingCircuitCard(p: HeatingCircuitData & { nimi?: string }, index: number): string {
  const jako = lampoJakotapaOptions.find((o) => o.value === p.jakotapa)?.label ?? '';
  const jakoText = p.jakotapa === 'muu' ? String(p.jakotapaMuu ?? '').trim() || 'Muu' : jako;
  const title = [`Piiri ${index + 1}`, hasPrintableValue(p.nimi) ? p.nimi : '', jakoText].filter(Boolean).join(' — ');
  const body =
    measurementsBlock({
      virtaus: p.virtaus,
      meno: p.meno,
      paluu: p.tulo,
      teho: liquidPower(p.virtaus, p.meno, p.tulo, p.neste),
    }) +
    blk('Neste', [row('Neste', nesteText(p.neste))]) +
    pumpBlock({
      valmistaja: p.pumppuValmistaja,
      malli: p.pumppuMalli,
      tyyppiVanha: p.pumppuTyyppi,
      syotto: p.pumppuSyottoValinta,
      kolme: p.pumppuKolmeVaihetta,
      v1: p.pumppuVirta1vaihe,
      l1: p.pumppuVirtaL1,
      l2: p.pumppuVirtaL2,
      l3: p.pumppuVirtaL3,
    }) +
    blk('Tarkastukset', [chk('Pumppu tarkastettu', p.pumppuTarkastettu)]);
  return cmp(title, '', body);
}

function lampoSection(m: MlpData, laiteTyyppi: string, box: MlpPrintBox): string {
  if (m.kiinteistoPiiritSisallytetaan === false || !m.lampoPiirit?.length) return '';
  const cards = m.lampoPiirit.map(heatingCircuitCard).join('');
  const status = mlpLampoInspectionStatus(m);
  const shared = [
    expansionBlock(m.lampoPaisuntaAstiaKoko, m.lampoPaisuntaAstiaEsipaine, m.lampoPaisuntaAstiaTarkistettu),
    blk('Tarkastukset', [
      chk('Toimilaitteet testattu', m.lampoToimilaitteetOK),
      chk('Ilmaus tarkistettu', m.lampoAutomaattinenIlmausTarkistettu),
      chk('Suodatin puhdistettu', m.lampoMutapussiPuhdistettu),
    ]),
    blk('Sähkökattila', [
      m.lampoSahkoKattilaVaralampitykseen && row('Varalämmitys', 'käytössä'),
      m.lampoSahkoKattilaVaralampitykseen && row('Teho', m.lampoSahkoKattilaTeho, 'kW'),
      m.lampoSahkoKattilaVaralampitykseen && row('Tyyppi', m.lampoSahkoKattilaTyyppi),
    ]),
  ].join('');
  const body = `${cards}${shared}`;
  return box(kiinteistoPiiriSectionTitle(laiteTyyppi), withStatus(status, m.lampoTarkastusHuomio, body));
}

function energySection(
  data: HuoltoReportData,
  m: MlpData,
  powers: Powers,
  hideWarnings: boolean,
  box: MlpPrintBox,
): string {
  const balance = computeMlpHeatPumpEnergyBalance(m, data.kylmaainePiiri1);
  const pIn = balance.pInKw != null && balance.pInKw > 0 ? balance.pInKw : null;
  const output = (powers.qLataus ?? 0) + (powers.qTulistus ?? 0);
  const hasOutput = output > 0;
  const cop = pIn != null && hasOutput ? output / pIn : null;
  const ground = hasOutput && pIn != null ? output - pIn : null;

  const copLabel = cop == null ? '' : cop >= 4 ? 'erinomainen' : cop >= 3 ? 'hyvä' : cop >= 2.5 ? 'tyydyttävä' : 'heikko';
  const items = [
    powers.qKeruu != null && row('Keruupiirin teho', kw(powers.qKeruu)),
    powers.qLataus != null && row('Latauspiirin teho', kw(powers.qLataus)),
    powers.qTulistus != null && row('Tulistuspiirin teho', kw(powers.qTulistus)),
    powers.qLataus != null && powers.qTulistus != null && row('Lämmitysteho yhteensä', kw(output)),
    pIn != null && row('Sähköteho', kw(pIn)),
    ground != null && ground > 0 && row('Maaperästä', kw(ground)),
    cop != null && row('COP', `${fmt(cop)}${copLabel ? ` (${copLabel})` : ''}`),
  ];

  const lines: string[] = [];
  const anyValue = items.some(Boolean);
  if (anyValue && cop == null) {
    const missing = pIn == null && !hasOutput ? 'sähköteho ja lämmitysteho' : pIn == null ? 'sähköteho' : 'lämmitysteho';
    lines.push(`<div class="note">COP: ${missing} puuttuu.</div>`);
  }
  if (!hideWarnings) {
    if (ground != null && ground < 0) lines.push(warn('Sähköteho ylittää lämmitystehon — tarkista mittaukset.'));
    if (cop != null && cop < 2.5) lines.push(warn(`COP matala (${fmt(cop)}) — tarkista kylmäaineen määrä ja paineet.`));
    if (cop != null && cop > 6) lines.push(warn(`COP poikkeuksellisen korkea (${fmt(cop)}) — varmista mittaukset.`));
    if (powers.qKeruu != null) {
      const dT = Math.abs(num(m.keruupiiriMeno) - num(m.keruupiiriTulo));
      if (dT > 5) lines.push(warn('Keruupiirin lämpötilaero yli 5 K — tarkista virtaus.'));
    }
  }
  const body = blk('Mittaukset', items) + lines.join('');
  return box(energiatehokkuusSectionTitle(data.laiteTyyppi), body);
}

function subcoolingSection(m: MlpData, hideWarnings: boolean, box: MlpPrintBox): string {
  if (!hasPrintableValue(m.kylmaaineKyllaestymisLampotila) || !hasPrintableValue(m.kylmaaineNestePutkiLampotila)) return '';
  const sc = num(m.kylmaaineKyllaestymisLampotila) - num(m.kylmaaineNestePutkiLampotila);
  const note = !hideWarnings && sc > 0 && (sc < 4 || sc > 6) ? warn(`Alijäähdytys ${fmt(sc, 1)} K, normaali +4…6 K.`) : '';
  return box(
    'Alijäähdytys',
    blk('Mittaukset', [
      pair(['Kyllästymislämpötila', m.kylmaaineKyllaestymisLampotila, '°C'], ['Nesteputken lämpötila', m.kylmaaineNestePutkiLampotila, '°C']),
      row('Alijäähdytys', fmt(sc, 1), 'K'),
    ]) + note,
  );
}

/** MLP:n osiot tulosteeseen. Palauttaa tyhjän, jos laite ei ole MLP. */
export function renderMlpPrintSections(data: HuoltoReportData, box: MlpPrintBox): string {
  const m = data.mlpData;
  if (!m) return '';
  if (isChillerLikeDevice(data.laiteTyyppi)) return '';
  if (!data.selectedModules.mlpPiirit && data.laiteTyyppi !== 'mlp' && data.laiteTyyppi !== 'vesiilmalampopumppu') return '';
  const hideWarnings = hideMaintenancePrintWarnings(data);
  const powers = computePowers(m);
  return [
    keruuSection(m, powers, keruupiiriSectionTitle(data.laiteTyyppi), box),
    jaahdytysSection(m, box),
    latausSection(m, powers, box),
    tulistusSection(m, powers, box),
    kayttovesiSection(m, box),
    lampoSection(m, data.laiteTyyppi, box),
    energySection(data, m, powers, hideWarnings, box),
    subcoolingSection(m, hideWarnings, box),
  ].join('');
}
