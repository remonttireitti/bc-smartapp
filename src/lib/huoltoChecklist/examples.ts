import type { ChecklistCategoryKey } from '../huoltoCategories';
import { createEmptyChecklistReport, type ChecklistItemState, type ChecklistReportData } from './logic';
import { checklistTemplate } from './templates';

/** Julkiset esimerkkitulosteet: keksitty yritys, asiakas ja mittaukset. */
export const EXAMPLE_COMPANY_NAME = 'Esimerkki yritys';
export const EXAMPLE_CUSTOMER = { name: 'As Oy Esimerkkipuisto', address: 'Esimerkkikatu 12, 00100 Helsinki' };

type Spec = {
  kohde: string;
  laite: { tunnus: string; malli: string; valmistaja: string; sijainti: string };
  /** Poikkeavat kohteet; muut tarkastetut = OK. */
  flagged: Record<string, ChecklistItemState>;
  /** Kohteet, jotka eivät kuulu tähän kohteeseen. */
  na: string[];
  measurements: Record<string, string>;
  toimenpiteet: string;
  suorittajaPatevyys: string;
  mittalaitteet: string;
};

const SPECS: Record<ChecklistCategoryKey, Spec> = {
  lvi: {
    kohde: 'Lämmönjakohuone ja käyttövesiverkosto',
    laite: { tunnus: 'LJH-1', malli: 'Termo 120 kW', valmistaja: 'Esimerkki Oy', sijainti: 'Kellari, lämmönjakohuone' },
    flagged: {
      lkv_kierto: { status: 'ok', comment: 'Kierron paluu kaukaisimmalta nousulta.' },
      patteriventtiilit: { status: 'huom', comment: 'Porras B, as. 14: termostaatti jumissa kiinni-asennossa.' },
      eristykset: { status: 'huom', comment: 'Kellarin LKV-kierron eristys irti n. 2 m matkalta.' },
    },
    na: ['pumppaamo'],
    measurements: {
      lkv_meno_c: '58',
      lkv_kierto_c: '48',
      lkv_kaluste_c: '56',
      kv_c: '12',
      kv_paine_bar: '4,2',
      vesimittari_m3: '18452',
      verkosto_paine_bar: '1,4',
      paisunta_bar: '1,0',
      lammitys_meno_c: '45',
      lammitys_paluu_c: '32',
    },
    toimenpiteet:
      'Kierron tasapainotus: LKV-kierron paluu 48 °C, tavoite vähintään 50 °C (linjasäätöventtiilit nousuilla B ja C).\nVaihda as. 14 patteritermostaatti.\nKorjaa kellarin LKV-kierron eristys.',
    suorittajaPatevyys: 'Kiinteistönhoitaja, LVI-asentaja',
    mittalaitteet: 'Pintalämpömittari Testo 905-T2, painemittari',
  },
  iv: {
    kohde: 'IV-kone TK01, vesikatto',
    laite: { tunnus: 'TK01', malli: 'AHU 2400', valmistaja: 'Esimerkki Air', sijainti: 'Vesikatto, IV-konehuone' },
    flagged: {
      hihnat: { status: 'huom', comment: 'Tulopuhaltimen hihna kulunut, vaihto seuraavalla käynnillä.' },
      ilmamaara_tulo: { status: 'huom', comment: 'Tuloilmavirta alle suunnitellun.' },
    },
    na: ['jaahdytyspatteri', 'liesikuvut'],
    measurements: {
      tulo_suodatin_luokka: 'ePM1 60 %',
      tulo_suodatin_pa: '85',
      poisto_suodatin_luokka: 'ePM10 50 %',
      poisto_suodatin_pa: '60',
      lto_ulko_c: '-2',
      lto_tulo_c: '15',
      lto_poisto_c: '21',
      tulo_ls: '410',
      tulo_suunn_ls: '450',
      poisto_ls: '440',
      poisto_suunn_ls: '450',
    },
    toimenpiteet:
      'Vaihda tulopuhaltimen hihna.\nTuloilmavirran säätö suunnitelman mukaiseksi (−9 %), tarkista päätelaitteiden säätöasennot 3. kerroksessa.',
    suorittajaPatevyys: 'IV-asentaja',
    mittalaitteet: 'Paine-eromittari TSI DP-Calc 5815, lämpömittari',
  },
  sahko: {
    kohde: 'Pääkeskus PK ja ryhmäkeskukset RK1–RK2',
    laite: { tunnus: 'PK', malli: '3x250 A', valmistaja: 'Esimerkki Sähkö', sijainti: 'Kellari, sähköpääkeskus' },
    flagged: {
      merkinnat: { status: 'huom', comment: 'RK2:n ryhmäkuva puuttuu.' },
      eristys: { status: 'vika', comment: 'RK1 ryhmä 5 (pihavalaistus): eristysresistanssi alle raja-arvon.' },
    },
    na: ['kiertosuunta'],
    measurements: {
      jatkuvuus_ohm: '0,32',
      eristys_mohm: '0,6',
      silmukka_ohm: '0,85',
      rcd_ms: '28',
      maadoitus_ohm: '6,4',
      jannite_v: '231',
      lampo_max_c: '41',
      lampo_delta_k: '6',
    },
    toimenpiteet:
      'RK1 ryhmä 5 (pihavalaistus): vianetsintä ja korjaus, ryhmä irti verkosta korjaukseen asti.\nPäivitä RK2:n ryhmäkuva.',
    suorittajaPatevyys: 'S2-sähköpätevyys',
    mittalaitteet: 'Fluke 1664 FC, lämpökamera FLIR E8',
  },
};

const EXAMPLE_CIRCUITS = [
  { id: 'c1', keskus: 'RK1', ryhma: '1', suoja: 'C16', riso: '>500', zs: '0,62', rcdMs: '22' },
  { id: 'c2', keskus: 'RK1', ryhma: '2', suoja: 'C16', riso: '380', zs: '0,71', rcdMs: '25' },
  { id: 'c3', keskus: 'RK1', ryhma: '5', suoja: 'B10', riso: '0,6', zs: '1,10', rcdMs: '24' },
  { id: 'c4', keskus: 'RK2', ryhma: '3', suoja: 'C16', riso: '450', zs: '0,58', rcdMs: '27' },
];

/** Allekirjoitus (keksitty) SVG-data-URL:na. */
const EXAMPLE_SIGNATURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="130"><path d="M20 90 C60 30 80 120 120 70 S170 40 190 85 S240 60 260 75 S320 95 400 50" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/></svg>',
  );

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildChecklistExampleReport(category: ChecklistCategoryKey, now = new Date()): ChecklistReportData {
  const spec = SPECS[category];
  const data = createEmptyChecklistReport(category, now);
  const next = new Date(now);
  next.setFullYear(next.getFullYear() + 1);
  for (const section of checklistTemplate(category).sections) {
    for (const item of section.items) {
      if (spec.na.includes(item.id)) continue;
      data.items[item.id] = { status: 'ok', comment: '', photos: [], ...spec.flagged[item.id] };
    }
  }
  return {
    ...data,
    asiakas: EXAMPLE_CUSTOMER.name,
    osoite: EXAMPLE_CUSTOMER.address,
    kohde: spec.kohde,
    laiteTunnus: spec.laite.tunnus,
    laiteMalli: spec.laite.malli,
    laiteValmistaja: spec.laite.valmistaja,
    laiteSijainti: spec.laite.sijainti,
    measurements: { ...spec.measurements },
    circuits: category === 'sahko' ? EXAMPLE_CIRCUITS.map((c) => ({ ...c })) : [],
    toimenpiteet: spec.toimenpiteet,
    seuraavaHuolto: ymd(next),
    suorittajaNimi: 'Esimerkki asentaja',
    suorittajaPatevyys: spec.suorittajaPatevyys,
    mittalaitteet: spec.mittalaitteet,
    signature: EXAMPLE_SIGNATURE,
    signedAt: now.toISOString(),
  };
}
