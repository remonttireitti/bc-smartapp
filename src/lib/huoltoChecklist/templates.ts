import type { ChecklistCategoryKey } from '../huoltoCategories';

export type ChecklistStatus = 'ok' | 'huom' | 'vika';

export type ChecklistMeasurement = {
  id: string;
  label: string;
  unit: string;
  /** Raja-arvot: alitus/ylitys näytetään ja lasketaan havainnoksi (severity). */
  min?: number;
  max?: number;
  severity?: Exclude<ChecklistStatus, 'ok'>;
  /** Tekstikenttä (esim. suodatinluokka), ei numeroa. */
  text?: boolean;
};

export type ChecklistItem = {
  id: string;
  label: string;
  measurements?: ChecklistMeasurement[];
};

export type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

export type ChecklistTemplate = {
  category: ChecklistCategoryKey;
  title: string;
  /** Tulosteen alaotsikko / perusta. */
  basis: string;
  sections: ChecklistSection[];
  /** Pätevyyskentän otsikko. */
  qualificationLabel: string;
  /** Sähkö: ryhmäkohtainen mittaustaulukko. */
  circuitTable?: boolean;
};

const LVI: ChecklistTemplate = {
  category: 'lvi',
  title: 'LVI-huoltoraportti',
  basis: 'Käyttövesi, lämmitys ja viemäröinti',
  qualificationLabel: 'Pätevyys',
  sections: [
    {
      id: 'kayttovesi',
      title: 'Käyttövesi',
      items: [
        {
          id: 'lkv_meno',
          label: 'Lämpimän käyttöveden menolämpötila (vähintään 55 °C)',
          measurements: [{ id: 'lkv_meno_c', label: 'Menolämpötila', unit: '°C', min: 55, severity: 'huom' }],
        },
        {
          id: 'lkv_kierto',
          label: 'Lämpimän käyttöveden kierto, paluulämpötila (vähintään 50 °C)',
          measurements: [{ id: 'lkv_kierto_c', label: 'Kierron paluu', unit: '°C', min: 50, severity: 'huom' }],
        },
        {
          id: 'lkv_kaluste',
          label: 'Lämmin vesi vesikalusteella (50–65 °C)',
          measurements: [{ id: 'lkv_kaluste_c', label: 'Kalusteella', unit: '°C', min: 50, max: 65, severity: 'huom' }],
        },
        {
          id: 'kv_lampo',
          label: 'Kylmän käyttöveden lämpötila (enintään 20 °C)',
          measurements: [{ id: 'kv_c', label: 'Kylmä vesi', unit: '°C', max: 20, severity: 'huom' }],
        },
        { id: 'sekoitus', label: 'Sekoitusventtiilit ja termostaattihanat' },
        {
          id: 'paine_kv',
          label: 'Verkostopaine ja paineenalennusventtiili',
          measurements: [{ id: 'kv_paine_bar', label: 'Verkostopaine', unit: 'bar' }],
        },
        { id: 'lkv_varoventtiili', label: 'Lämmönsiirtimen / varaajan varoventtiili ja takaiskuventtiilit' },
        {
          id: 'vesimittari',
          label: 'Vesimittari',
          measurements: [{ id: 'vesimittari_m3', label: 'Lukema', unit: 'm³' }],
        },
      ],
    },
    {
      id: 'lammitys',
      title: 'Lämmitysverkosto',
      items: [
        {
          id: 'verkosto_paine',
          label: 'Lämmitysverkoston paine',
          measurements: [{ id: 'verkosto_paine_bar', label: 'Paine', unit: 'bar' }],
        },
        {
          id: 'paisunta',
          label: 'Paisunta-astia (esipaine, toiminta)',
          measurements: [{ id: 'paisunta_bar', label: 'Esipaine', unit: 'bar' }],
        },
        { id: 'varoventtiilit', label: 'Lämmitysverkoston varoventtiilit (koestus)' },
        {
          id: 'lammonsiirrin',
          label: 'Lämmönsiirrin / lämmönjakokeskus',
          measurements: [
            { id: 'lammitys_meno_c', label: 'Menovesi', unit: '°C' },
            { id: 'lammitys_paluu_c', label: 'Paluuvesi', unit: '°C' },
          ],
        },
        { id: 'kiertopumput', label: 'Kiertopumput (ääni, toiminta)' },
        { id: 'saato', label: 'Säätölaitteet ja lämmityskäyrä' },
        { id: 'ilmaus', label: 'Ilmanpoisto ja ilmaus' },
        { id: 'patteriventtiilit', label: 'Patteriventtiilit, termostaatit ja jakotukit' },
      ],
    },
    {
      id: 'venttiilit',
      title: 'Venttiilit ja vuodot',
      items: [
        { id: 'paasulut', label: 'Pääsulkuventtiilit (toiminta)' },
        { id: 'linjasulut', label: 'Linja- ja huoneistosulut' },
        { id: 'vuodot', label: 'Vuodot ja kosteusjäljet (putkistot, liitokset)' },
        { id: 'eristykset', label: 'Putkieristykset' },
      ],
    },
    {
      id: 'viemarit',
      title: 'Viemäröinti',
      items: [
        { id: 'lattiakaivot', label: 'Lattiakaivot (puhdistus, hajulukko)' },
        { id: 'vesilukot', label: 'Vesilukot ja viemärien toiminta' },
        { id: 'puhdistusluukut', label: 'Tarkastus- ja puhdistusluukut' },
        { id: 'pumppaamo', label: 'Jätevesi- / salaojapumppaamo' },
      ],
    },
  ],
};

const IV: ChecklistTemplate = {
  category: 'iv',
  title: 'IV-huoltoraportti',
  basis: 'Ilmanvaihtokone ja kanavisto',
  qualificationLabel: 'Pätevyys',
  sections: [
    {
      id: 'suodattimet',
      title: 'Suodattimet',
      items: [
        {
          id: 'tulo_suodatin',
          label: 'Tuloilmasuodatin',
          measurements: [
            { id: 'tulo_suodatin_luokka', label: 'Luokka', unit: '', text: true },
            { id: 'tulo_suodatin_pa', label: 'Painehäviö', unit: 'Pa' },
          ],
        },
        {
          id: 'poisto_suodatin',
          label: 'Poistoilmasuodatin',
          measurements: [
            { id: 'poisto_suodatin_luokka', label: 'Luokka', unit: '', text: true },
            { id: 'poisto_suodatin_pa', label: 'Painehäviö', unit: 'Pa' },
          ],
        },
        { id: 'suodatin_vaihto', label: 'Suodattimet vaihdettu' },
      ],
    },
    {
      id: 'kone',
      title: 'Ilmanvaihtokone',
      items: [
        {
          id: 'lto',
          label: 'Lämmöntalteenotto (kenno / roottori, jäätymisenesto)',
          measurements: [
            { id: 'lto_ulko_c', label: 'Ulkoilma', unit: '°C' },
            { id: 'lto_tulo_c', label: 'Tuloilma LTO:n jälkeen', unit: '°C' },
            { id: 'lto_poisto_c', label: 'Poistoilma ennen LTO:ta', unit: '°C' },
          ],
        },
        { id: 'puhaltimet', label: 'Tulo- ja poistopuhaltimet (laakerit, siipipyörä, värinä)' },
        { id: 'hihnat', label: 'Hihnat ja kiinnitykset' },
        { id: 'lammityspatteri', label: 'Lämmityspatteri ja jäätymissuoja' },
        { id: 'jaahdytyspatteri', label: 'Jäähdytyspatteri' },
        { id: 'kondenssi', label: 'Kondenssiveden poisto ja vesilukko' },
        { id: 'pellit', label: 'Pellit ja toimilaitteet' },
        { id: 'saato', label: 'Säätö ja automaatio (aikaohjelmat, asetusarvot, hälytykset)' },
        { id: 'kone_puhdistus', label: 'Koneen sisäpuhtaus' },
      ],
    },
    {
      id: 'ilmamaarat',
      title: 'Ilmamäärät',
      items: [
        {
          id: 'ilmamaara_tulo',
          label: 'Tuloilmavirta',
          measurements: [
            { id: 'tulo_ls', label: 'Mitattu', unit: 'l/s' },
            { id: 'tulo_suunn_ls', label: 'Suunniteltu', unit: 'l/s' },
          ],
        },
        {
          id: 'ilmamaara_poisto',
          label: 'Poistoilmavirta',
          measurements: [
            { id: 'poisto_ls', label: 'Mitattu', unit: 'l/s' },
            { id: 'poisto_suunn_ls', label: 'Suunniteltu', unit: 'l/s' },
          ],
        },
        { id: 'paatelaitteet', label: 'Päätelaitteet ja venttiilit (puhtaus, säätöasento)' },
        { id: 'saleikot', label: 'Ulko- ja jäteilmasäleiköt' },
      ],
    },
    {
      id: 'kanavisto',
      title: 'Kanavisto',
      items: [
        { id: 'kanava_puhtaus', label: 'Kanavien puhtaus' },
        { id: 'kanava_tiiveys', label: 'Kanavien tiiveys ja eristykset' },
        { id: 'palopellit', label: 'Palopellit (toiminta)' },
        { id: 'vaimentimet', label: 'Äänenvaimentimet' },
        { id: 'liesikuvut', label: 'Liesikuvut ja rasvasuodattimet' },
      ],
    },
  ],
};

const SAHKO: ChecklistTemplate = {
  category: 'sahko',
  title: 'Sähkötarkastusraportti',
  basis: 'SFS 6000-6 / SFS 6002',
  qualificationLabel: 'Sähköpätevyys',
  circuitTable: true,
  sections: [
    {
      id: 'silmamaarainen',
      title: 'Silmämääräinen tarkastus',
      items: [
        { id: 'keskukset', label: 'Pää- ja ryhmäkeskukset (kunto, kosketussuojaus)' },
        { id: 'merkinnat', label: 'Merkinnät ja ryhmäkuvat ajan tasalla' },
        { id: 'liitokset', label: 'Liitokset (löysyys, kuumenemisen jäljet)' },
        { id: 'suojalaitteet', label: 'Suojalaitteiden mitoitus johtimiin nähden' },
        { id: 'johdot', label: 'Johdot ja kaapelit (kunto, kiinnitykset)' },
        { id: 'pistorasiat', label: 'Pistorasiat, kytkimet ja valaisimet' },
        { id: 'kotelointi', label: 'Kotelointiluokat kosteissa tiloissa' },
      ],
    },
    {
      id: 'mittaukset',
      title: 'Mittaukset ja testaukset',
      items: [
        {
          id: 'jatkuvuus',
          label: 'Suojajohtimien jatkuvuus',
          measurements: [{ id: 'jatkuvuus_ohm', label: 'Suurin', unit: 'Ω' }],
        },
        {
          id: 'eristys',
          label: 'Eristysresistanssi (vähintään 1 MΩ)',
          measurements: [{ id: 'eristys_mohm', label: 'Pienin', unit: 'MΩ', min: 1, severity: 'vika' }],
        },
        {
          id: 'silmukka',
          label: 'Vikasilmukan impedanssi / oikosulkuvirta',
          measurements: [{ id: 'silmukka_ohm', label: 'Suurin Zs', unit: 'Ω' }],
        },
        {
          id: 'vikavirtasuojat',
          label: 'Vikavirtasuojat (testipainike ja laukaisuaika enintään 300 ms)',
          measurements: [{ id: 'rcd_ms', label: 'Hitain laukaisu', unit: 'ms', max: 300, severity: 'vika' }],
        },
        {
          id: 'maadoitus',
          label: 'Maadoitus ja potentiaalintasaus',
          measurements: [{ id: 'maadoitus_ohm', label: 'Maadoitusresistanssi', unit: 'Ω' }],
        },
        { id: 'kiertosuunta', label: 'Kiertosuunta (3-vaihe)' },
        {
          id: 'jannite',
          label: 'Jännitteet',
          measurements: [{ id: 'jannite_v', label: 'L-N', unit: 'V' }],
        },
      ],
    },
    {
      id: 'lampokamera',
      title: 'Lämpökamerakuvaus',
      items: [
        {
          id: 'lampokuvaus',
          label: 'Keskusten lämpökamerakuvaus kuormitettuna',
          measurements: [
            { id: 'lampo_max_c', label: 'Suurin lämpötila', unit: '°C' },
            { id: 'lampo_delta_k', label: 'Ero vertailukohtaan', unit: 'K' },
          ],
        },
      ],
    },
    {
      id: 'dokumentit',
      title: 'Dokumentaatio',
      items: [
        { id: 'ohjeet', label: 'Käyttö- ja huolto-ohjeet saatavilla' },
        { id: 'edelliset', label: 'Edellisen tarkastuksen puutteet korjattu' },
      ],
    },
  ],
};

export const CHECKLIST_TEMPLATES: Record<ChecklistCategoryKey, ChecklistTemplate> = {
  lvi: LVI,
  iv: IV,
  sahko: SAHKO,
};

export function checklistTemplate(category: ChecklistCategoryKey): ChecklistTemplate {
  return CHECKLIST_TEMPLATES[category];
}

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  ok: 'OK',
  huom: 'Huomautus',
  vika: 'Vika',
};

/** Sähkö: ryhmäkohtaisten mittausten raja-arvot (samat kuin yhteenvetorivillä). */
export const CIRCUIT_LIMITS = { risoMinMohm: 1, rcdMaxMs: 300 } as const;
