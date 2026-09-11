import {
  applyDeviceTypeDefaults,
  createEmptyHuoltoReportData,
} from './defaults';
import type { KonvektoriAsennustyyppi } from './konvektoriTypes';
import type { HuoltoReportData, KonvektoriRowData } from './types';
import { generateId } from './utils';

export const KONVEKTORI_EXAMPLE_ROW_COUNT = 35;
export const KONVEKTORI_EXAMPLE_COMPANY_NAME = 'Esimerkki yritys';
export const KONVEKTORI_EXAMPLE_PERFORMER_NAME = 'Esimerkki asentaja';

/** Satunnainen esimerkkipäivä viimeisen vuoden ajalta (ISO yyyy-mm-dd). */
export function buildRandomKonvektoriExampleDate(reference = new Date()): string {
  const daysBack = Math.floor(Math.random() * 365);
  const date = new Date(reference);
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function exampleKonvektoriRow(
  patch: Partial<KonvektoriRowData> & Pick<KonvektoriRowData, 'tyyppi' | 'tunnus'>,
): KonvektoriRowData {
  return {
    id: generateId(),
    tyyppi: patch.tyyppi,
    tunnus: patch.tunnus,
    huone: patch.huone ?? '',
    valmistaja: patch.valmistaja ?? '',
    malli: patch.malli ?? '',
    sarjanumero: patch.sarjanumero ?? '',
    huoneLampotila: patch.huoneLampotila ?? '',
    huoneKosteusRh: patch.huoneKosteusRh ?? '',
    ilmaTehoMittaus: patch.ilmaTehoMittaus ?? 'mittari',
    jaahdytysNeste: patch.jaahdytysNeste ?? '',
    jaahdytysNesteMuu: patch.jaahdytysNesteMuu ?? '',
    virtausLs: patch.virtausLs ?? '',
    ilmanVirtausM3h: patch.ilmanVirtausM3h ?? '',
    tuloLampotila: patch.tuloLampotila ?? '',
    menoLampotila: patch.menoLampotila ?? '',
    puhallusLampotila: patch.puhallusLampotila ?? '',
    puhallusKosteusRh: patch.puhallusKosteusRh ?? '',
    mitattuTeho: patch.mitattuTeho ?? '',
    suodatinPuhdistettu: patch.suodatinPuhdistettu ?? null,
    kennoPuhdistettu: patch.kennoPuhdistettu ?? null,
    kondenssiTarkastettu: patch.kondenssiTarkastettu ?? null,
    puhallinTarkastettu: patch.puhallinTarkastettu ?? null,
    venttiiliTarkastettu: patch.venttiiliTarkastettu ?? null,
    ohjausToimii: patch.ohjausToimii ?? null,
    huomio: patch.huomio ?? '',
    huomioTyyppi: patch.huomioTyyppi ?? 'kommentti',
  };
}

const EXAMPLE_KONVEKTORI_TYPES: KonvektoriAsennustyyppi[] = ['seina', 'katto', 'lattia', 'kanavoitava'];

const EXAMPLE_ROOMS = [
  'Neuvottelu 1',
  'Open office',
  'Aula',
  'IT-tila',
  'Neuvottelu 2',
  'Kokous',
  'Toimisto A',
  'Toimisto B',
  'Käytävä 2. krs',
  'Käytävä 3. krs',
  'Tauhuone',
  'Vastaanotto',
  'Arkisto',
  'Neuvottelu 3',
  'Työhuone',
];

const EXAMPLE_BRANDS = [
  { valmistaja: 'Swegon', malli: 'Parma CL', prefix: 'SW' },
  { valmistaja: 'Lindab', malli: 'Ultra BT', prefix: 'LB' },
  { valmistaja: 'Halton', malli: 'FLO', prefix: 'HT' },
  { valmistaja: 'Systemair', malli: 'DV', prefix: 'SA' },
];

const FAULT_SCENARIOS: Array<Partial<KonvektoriRowData>> = [
  {
    kennoPuhdistettu: false,
    venttiiliTarkastettu: false,
    huomio: '**Vika:** venttiili ei reagoi ohjaukseen. Kenno likainen — puhdistus tilattu.',
    huomioTyyppi: 'vika',
  },
  {
    puhallinTarkastettu: false,
    huomio: 'Puhallimessa sivuääni — tarkistus jatketaan.',
    huomioTyyppi: 'vika',
  },
  {
    kondenssiTarkastettu: false,
    ohjausToimii: false,
    huomio: 'Kondenssiveden poisto ei toimi luotettavasti. Ohjaus ei vastaa asetusta.',
    huomioTyyppi: 'vika',
  },
  {
    suodatinPuhdistettu: false,
    huomio: 'Suodatin vaihdettava — tilaus tehty.',
    huomioTyyppi: 'vika',
  },
  {
    venttiiliTarkastettu: false,
    ohjausToimii: false,
    huomio: 'Venttiilin toimilaite jumissa.',
    huomioTyyppi: 'vika',
  },
  {
    kennoPuhdistettu: false,
    puhallinTarkastettu: false,
    huomio: 'Kenno ja puhallin vaativat huoltoa.',
    huomioTyyppi: 'vika',
  },
  {
    kondenssiTarkastettu: false,
    huomio: 'Kondenssiveden poisto tukossa.',
    huomioTyyppi: 'vika',
  },
];

function formatExampleDecimal(base: number, index: number, spread = 0.08): string {
  const value = base + ((index % 7) - 3) * spread;
  return value.toFixed(1).replace('.', ',');
}

function buildExampleKonvektoriRows(count = KONVEKTORI_EXAMPLE_ROW_COUNT): KonvektoriRowData[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 101;
    const tyyppi = EXAMPLE_KONVEKTORI_TYPES[index % EXAMPLE_KONVEKTORI_TYPES.length];
    const brand = EXAMPLE_BRANDS[index % EXAMPLE_BRANDS.length];
    const huone = `${EXAMPLE_ROOMS[index % EXAMPLE_ROOMS.length]}${index >= EXAMPLE_ROOMS.length ? ` ${Math.floor(index / EXAMPLE_ROOMS.length) + 1}` : ''}`;
    const isFaulty = index % 5 === 2;
    const fault = isFaulty ? FAULT_SCENARIOS[index % FAULT_SCENARIOS.length] : null;

    const baseHuoneLampo = 22 + (index % 4) * 0.4;
    const baseTulo = 14 - (index % 3) * 0.3;
    const baseMeno = 17.5 + (index % 5) * 0.35;
    const baseVirtaus = 0.4 + (index % 6) * 0.03;

    return exampleKonvektoriRow({
      tyyppi,
      tunnus: `K-${number}`,
      huone,
      valmistaja: brand.valmistaja,
      malli: brand.malli,
      sarjanumero: `${brand.prefix}-${44000 + number}`,
      huoneLampotila: formatExampleDecimal(baseHuoneLampo, index, 0.15),
      huoneKosteusRh: String(38 + (index % 8)),
      jaahdytysNeste: 'vesi',
      virtausLs: formatExampleDecimal(baseVirtaus, index, 0.02),
      tuloLampotila: formatExampleDecimal(baseTulo, index, 0.12),
      menoLampotila: formatExampleDecimal(baseMeno, index, 0.12),
      ilmanVirtausM3h: tyyppi === 'katto' || tyyppi === 'kanavoitava' ? String(360 + (index % 9) * 25) : '',
      puhallusLampotila:
        tyyppi === 'katto' || tyyppi === 'kanavoitava'
          ? formatExampleDecimal(16.5 + (index % 4) * 0.2, index, 0.1)
          : '',
      suodatinPuhdistettu: fault?.suodatinPuhdistettu ?? true,
      kennoPuhdistettu: fault?.kennoPuhdistettu ?? true,
      kondenssiTarkastettu: fault?.kondenssiTarkastettu ?? true,
      puhallinTarkastettu: fault?.puhallinTarkastettu ?? true,
      venttiiliTarkastettu: fault?.venttiiliTarkastettu ?? true,
      ohjausToimii: fault?.ohjausToimii ?? true,
      huomio:
        fault?.huomio
        ?? (index % 11 === 0
          ? 'Hieman alhaisempi ilmavirtaus — seuranta seuraavalla huollolla.'
          : index === 0
            ? 'Toimii normaalisti.'
            : ''),
      huomioTyyppi: fault?.huomioTyyppi ?? 'kommentti',
    });
  });
}

/** Esimerkkidata konvektoriverkoston huoltopöytäkirjan tulosteeseen. */
export function buildKonvektoriExampleReportData(options?: {
  huoltoPaivamaara?: string;
  rowCount?: number;
}): HuoltoReportData {
  const base = createEmptyHuoltoReportData();
  const huoltoPaivamaara = options?.huoltoPaivamaara ?? buildRandomKonvektoriExampleDate();
  const konvektoriRows = buildExampleKonvektoriRows(options?.rowCount ?? KONVEKTORI_EXAMPLE_ROW_COUNT);

  const withBasics: HuoltoReportData = {
    ...base,
    asiakas: 'Esimerkki asiakas Oy',
    osoite: 'Esimerkkikatu 12, 00100 Helsinki',
    asiakasYhteyshenkilo: 'Matti Meikäläinen',
    asiakasPuhelin: '040 123 4567',
    asiakasEmail: 'matti@esimerkki.fi',
    laiteKayttotarkoitus: 'Toimistoverkoston vuosihuolto',
    laiteSijainti: 'Rakennus A, 2.–4. kerros',
    laiteTunnus: 'KV-VERKOSTO-1',
    konvektoriRows,
    huoltoSuoritettu: true,
    huoltoLaiteessaVika: true,
    huoltoSuorittajaNimi: KONVEKTORI_EXAMPLE_PERFORMER_NAME,
    huoltoSuorittajaTUKES: '',
    huoltoPaivamaara,
    huomiot:
      'Tämä on esimerkkipöytäkirja. Raportissa on sekä kunnossa olevia että viallisia konvektoreita — voit tulostaa vain vialliset erillisellä toiminnolla.',
    huomiotLuonne: 'kommentti',
  };

  return applyDeviceTypeDefaults(withBasics, 'konvektorit');
}
