import type { CondenserData, EvaporatorData, NestelauhdutinUnitData } from './types';
import {
  LAUHDUTIN_TYYPIT,
  MLP_LAITEKORTTI_ROWS,
  NESTE_VJ_OHJAUS_LAHDE,
  NESTE_VJ_OHJAUS_TAPA,
  circuitCompressorDisplayCount,
  circuitHasStaticRefrigerantFields,
  condenserRowShowsAirLauhdutinSection,
  evapTyyppiLabel,
  evaporatorSnapshotRowIsMeaningful,
  formatPumpSyottoReadout,
  huoltoTechnicalSnapshotShowsEvaporatorHeading,
  kompressoriSnapshotRowMeaningful,
  mlpSnapshotSectionHasContent,
  nestelauhdutinRegistryUnitIsMeaningful,
  showSisayksikotInSnapshot,
  type ParsedEquipmentSnapshot,
} from './equipmentSnapshotDisplay';
import { escapeHtmlPrint } from '../printDocumentShell';

function nonEmpty(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

function snapVal(value: unknown): string {
  const s = value == null ? '' : String(value).trim();
  return s || '—';
}

function isPrintValueFilled(value: string): boolean {
  const v = String(value ?? '').trim();
  return v.length > 0 && v !== '—' && v !== '–' && v !== '-';
}

function filledKvRows(rows: { label: string; value: string }[]): { label: string; value: string }[] {
  return rows.filter((row) => isPrintValueFilled(row.value));
}

function kvRow(label: string, value: string): string {
  return `<tr><th scope="row">${escapeHtmlPrint(label)}</th><td>${escapeHtmlPrint(value.trim())}</td></tr>`;
}

function kvTable(rows: { label: string; value: string }[], whenEmpty: 'message' | 'skip' = 'message'): string {
  const filled = filledKvRows(rows);
  if (filled.length === 0) {
    return whenEmpty === 'skip' ? '' : `<p class="print-card-muted">Ei tietoja</p>`;
  }
  return `<table class="tbl kv-table print-card-tbl"><tbody>${filled.map((row) => kvRow(row.label, row.value)).join('')}</tbody></table>`;
}

function printSubblock(title: string, rows: { label: string; value: string }[]): string {
  const inner = kvTable(rows, 'skip');
  if (!inner) return '';
  return `<div class="print-card-subblock"><h4 class="print-card-h4">${escapeHtmlPrint(title)}</h4>${inner}</div>`;
}

function printSection(title: string, inner: string): string {
  return `<div class="print-card-section"><h2 class="print-card-h2">${escapeHtmlPrint(title)}</h2><div class="print-card-body">${inner}</div></div>`;
}

export function buildEquipmentCardSnapshotPrintHtml(snapshot: ParsedEquipmentSnapshot): string {
  if (snapshot.laiteTyyppi === 'konvektorit') {
    const rows = snapshot.konvektorit ?? [];
    if (rows.length === 0) {
      return `<p class="print-card-muted">Ei tallennettuja konvektoritietoja huoltopöytäkirjasta.</p>`;
    }
    return printSection(
      'Konvektorit',
      rows
        .map((row, index) =>
          printSubblock(`Konvektori ${index + 1}`, [
            { label: 'Tunnus', value: snapVal(row.tunnus) },
            { label: 'Valmistaja', value: snapVal(row.valmistaja) },
            { label: 'Malli', value: snapVal(row.malli) },
            { label: 'Sarjanumero', value: snapVal(row.sarjanumero) },
          ]),
        )
        .filter(Boolean)
        .join(''),
    );
  }

  const parts: string[] = [];
  const ulko = snapshot.ulkoyksikko as Record<string, unknown>;
  const piirejaCount = Math.max(1, parseInt(String(snapshot.kylmaainePiireja || '1').trim(), 10) || 1);
  const compressorCircuitSlots = Math.min(3, piirejaCount);
  const circuits = [
    { label: 'Piiri 1', data: (snapshot.kp1Data ?? {}) as Record<string, unknown> },
    { label: 'Piiri 2', data: (snapshot.kp2Data ?? {}) as Record<string, unknown> },
    { label: 'Piiri 3', data: (snapshot.kp3Data ?? {}) as Record<string, unknown> },
  ].slice(0, compressorCircuitSlots);

  let sumCompressors = 0;
  for (const { data } of circuits) {
    if (data.onKaytossa === false) continue;
    sumCompressors += circuitCompressorDisplayCount(data);
  }

  const tyy = String(snapshot.kylmaaineTyyppi || '').trim();
  const laatu = String(snapshot.kylmaaineLaatu || '').trim();
  const kylmaaineYksiRivi =
    tyy && laatu && laatu.toLowerCase() !== tyy.toLowerCase() ? `${tyy} · ${laatu}` : tyy || laatu || '';

  const piiriMaarat = [
    { label: 'Määrä piiri 1', value: snapVal(snapshot.kylmaaineMaaraPiiri1) },
    { label: 'Määrä piiri 2', value: snapVal(snapshot.kylmaaineMaaraPiiri2) },
    { label: 'Määrä piiri 3', value: snapVal(snapshot.kylmaaineMaaraPiiri3) },
    { label: 'Määrä piiri 4', value: snapVal(snapshot.kylmaaineMaaraPiiri4) },
  ].slice(0, Math.min(4, piirejaCount));

  const kylmaRows: { label: string; value: string }[] = [
    { label: 'Käyttötarkoitus', value: snapVal(snapshot.laiteKayttotarkoitus) },
    { label: 'Kylmäainepiirejä', value: snapVal(snapshot.kylmaainePiireja) },
  ];
  if (kylmaaineYksiRivi) kylmaRows.push({ label: 'Kylmäaine', value: kylmaaineYksiRivi });
  kylmaRows.push(
    { label: 'Valmistajan täyttömäärä', value: snapVal(snapshot.kylmaaineValmistajaMaara) },
    { label: 'Lisätty määrä', value: snapVal(snapshot.kylmaaineLisattyMaara) },
    { label: 'Putkimatka / huomio', value: snapVal(snapshot.kylmaainePutkimatka) },
  );
  for (const row of piiriMaarat) kylmaRows.push(row);
  kylmaRows.push(
    { label: 'Kylmäainetta yhteensä', value: snapVal(snapshot.kylmaaineMaaraYhteensa) },
    { label: 'Laskettu CO₂-ekvivalentti (t)', value: snapVal(snapshot.kylmaaineCO2Ekv) },
  );
  parts.push(printSection('Käyttötarkoitus ja kylmäaine', kvTable(kylmaRows)));

  const circuitBlocks: string[] = [];
  if (sumCompressors > 0) {
    circuitBlocks.push(`<p class="print-card-lead"><strong>Kompressoreita yhteensä:</strong> ${sumCompressors} kpl</p>`);
  }
  for (const { label, data } of circuits) {
    if (data.onKaytossa === false) continue;
    const nComp = circuitCompressorDisplayCount(data);
    const hasStatic = circuitHasStaticRefrigerantFields(data);
    const hasAnyKomp = [1, 2, 3, 4, 5, 6].some((i) => kompressoriSnapshotRowMeaningful(data[`kompressori${i}`]));
    if (nComp <= 0 && !hasStatic && !hasAnyKomp) continue;

    const sub: string[] = [`<h3 class="print-card-h3">${escapeHtmlPrint(label)}</h3>`];
    const rows: { label: string; value: string }[] = [];
    if (nComp > 0) rows.push({ label: 'Kompressoreita (ilmoitettu)', value: `${nComp} kpl` });
    rows.push(
      { label: 'Piirin ohjaustapa', value: snapVal(data.ohjaustapa) },
      { label: 'Paisuntaventtiili (tyyppi)', value: snapVal(data.paisuntaventtiiliTyyppi) },
      { label: 'Paisuntaventtiili (muu)', value: snapVal(data.paisuntaventtiiliMuu) },
      { label: 'Paisuntaventtiilin valmistaja', value: snapVal(data.paisuntaventtiiliValmistaja) },
      { label: 'Paisuntaventtiilin malli', value: snapVal(data.paisuntaventtiiliMalli) },
      { label: 'Magneettiventtiilin valmistaja', value: snapVal(data.magneettiventtiiliValmistaja) },
      { label: 'Magneettiventtiilin malli', value: snapVal(data.magneettiventtiiliMalli) },
      { label: 'Kuivain · valmistaja', value: snapVal(data.kuivainValmistaja) },
      { label: 'Kuivain · malli', value: snapVal(data.kuivainMalli) },
      { label: 'Kuivain · kivien määrä', value: snapVal(data.kuivainKivienMaara) },
    );
    sub.push(kvTable(rows));

    for (let i = 1; i <= 6; i += 1) {
      const raw = data[`kompressori${i}`];
      if (!kompressoriSnapshotRowMeaningful(raw)) continue;
      const k = raw as Record<string, unknown>;
      const kompBlk = printSubblock(`Kompressori ${i}`, [
        { label: 'Valmistaja', value: snapVal(k.valmistaja) },
        { label: 'Malli', value: snapVal(k.malli) },
        { label: 'Tyyppi (yhdistelmä / vanha)', value: snapVal(k.tyyppi) },
        { label: 'Ohjaustapa', value: snapVal(k.ohjaustapa) },
        { label: 'Kontaktori', value: snapVal(k.kontaktoriTyyppi) },
        { label: 'Pehmökäynnistin', value: snapVal(k.pehmokaynnistinTyyppi) },
        { label: 'Taajuusmuuttaja', value: snapVal(k.taajuusmuuttajaTyyppi) },
        { label: 'Ohjaustapa (muu)', value: snapVal(k.ohjaustapaMuu) },
      ]);
      if (kompBlk) sub.push(kompBlk);
    }
    circuitBlocks.push(`<div class="print-card-nest">${sub.join('')}</div>`);
  }
  parts.push(
    printSection(
      'Piirit ja kompressorit',
      circuitBlocks.length > 0 ? circuitBlocks.join('') : `<p class="print-card-muted">Ei täytettyjä tietoja</p>`,
    ),
  );

  const ulkoRows = [
    { label: 'Malli', value: snapVal(ulko.ulkoyksikkoMalli) },
    { label: 'Sarjanumero', value: snapVal(ulko.ulkoyksikkoSarjanumero) },
    { label: 'Jäähdytysteho', value: snapVal(ulko.ulkoyksikkoJaahdytysTeho) },
    { label: 'Lämmitysteho', value: snapVal(ulko.ulkoyksikkoLammitysTeho) },
    { label: 'Asennustapa', value: snapVal(ulko.ulkoyksikkoAsennustapa) },
    { label: 'Asennustapa (muu)', value: snapVal(ulko.ulkoyksikkoAsennustapaMuu) },
  ];
  if (filledKvRows(ulkoRows).length > 0) {
    parts.push(printSection('Ulkoyksikkö', kvTable(ulkoRows)));
  }

  if (huoltoTechnicalSnapshotShowsEvaporatorHeading(snapshot.laiteTyyppi)) {
    const evs = (snapshot.evaporatorData || []).filter((row) => evaporatorSnapshotRowIsMeaningful(row));
    const evHtml =
      evs.length === 0
        ? `<p class="print-card-muted">Ei täytettyjä tietoja</p>`
        : evs
            .map((ev: Partial<EvaporatorData>, index: number) =>
              printSubblock(`Höyrystin ${index + 1}`, [
                {
                  label: 'Tyyppi',
                  value: nonEmpty(ev.tyyppi) ? evapTyyppiLabel(String(ev.tyyppi)) : '—',
                },
                { label: 'Huoneen tunnus', value: snapVal(ev.huoneenTunnus) },
                { label: 'Valmistaja', value: snapVal(ev.valmistaja) },
                { label: 'Malli', value: snapVal(ev.malli) },
                { label: 'Sarjanumero', value: snapVal(ev.sarjanumero) },
              ]),
            )
            .filter(Boolean)
            .join('');
    parts.push(printSection('Höyrystimet', evHtml));
  }

  const nestSnapshot = (snapshot.nestelauhduttimetVj || []).filter((unit) =>
    nestelauhdutinRegistryUnitIsMeaningful(unit as NestelauhdutinUnitData),
  );
  const cds = (snapshot.condenserData || []).filter((co) =>
    condenserRowShowsAirLauhdutinSection(co as CondenserData, snapshot.laiteTyyppi),
  );
  const anyNestShell = (snapshot.condenserData || []).some((co) => co.tyyppi === 'nestekiertoinen');

  const lauhdeParts: string[] = [];
  if (anyNestShell) {
    lauhdeParts.push(
      `<p class="print-card-lead"><strong>Lauhdetapa (laite):</strong> ${escapeHtmlPrint(LAUHDUTIN_TYYPIT.nestekiertoinen)}</p>`,
    );
  }
  for (const [index, unit] of nestSnapshot.entries()) {
    const u = unit as Partial<NestelauhdutinUnitData>;
    const nestBlk = printSubblock(`Nestelauhdutin ${index + 1}`, [
      { label: 'Valmistaja', value: snapVal(u.valmistaja) },
      { label: 'Malli', value: snapVal(u.malli) },
      { label: 'Sarjanumero', value: snapVal(u.sarjanumero) },
      { label: 'Puhaltimien määrä', value: snapVal(u.puhaltimienMaara) },
      {
        label: 'Puhaltimien syöttö',
        value: u.puhallinSyotto === '230' ? '230 V' : u.puhallinSyotto === '400' ? '400 V' : '—',
      },
      { label: 'Puhaltimien valmistaja', value: snapVal(u.puhaltimienValmistaja) },
      { label: 'Puhaltimien malli', value: snapVal(u.puhaltimienMalli) },
      {
        label: 'Puhaltimen ohjaustapa',
        value:
          NESTE_VJ_OHJAUS_TAPA[String(u.puhallinOhjausTapa || '')] || snapVal(u.puhallinOhjausTapa),
      },
      {
        label: 'Ohjaus tulee',
        value: NESTE_VJ_OHJAUS_LAHDE[String(u.ohjausLahde || '')] || snapVal(u.ohjausLahde),
      },
    ]);
    if (nestBlk) lauhdeParts.push(nestBlk);
  }
  for (const [index, co] of cds.entries()) {
    const row = co as Partial<CondenserData> & { valmistaja?: string; malli?: string };
    const airBlk = printSubblock(`Lauhdutin (ilma) ${index + 1}`, [
      {
        label: 'Tyyppi',
        value: LAUHDUTIN_TYYPIT[String(row.tyyppi || '')] || snapVal(row.tyyppi),
      },
      { label: 'Valmistaja', value: snapVal(row.valmistaja) },
      { label: 'Malli', value: snapVal(row.malli) },
      { label: 'Puhaltimien määrä', value: snapVal(row.puhaltimienMaara) },
      { label: 'Puhallimen ohjaus', value: snapVal(row.puhallinOhjaus) },
      { label: 'Nopeussäätimen malli', value: snapVal(row.nopeussäädinMalli) },
      { label: 'Taajuusmuuntajan malli', value: snapVal(row.taajusmuuntajaMalli) },
      { label: 'KP-painestatin malli', value: snapVal(row.kpPressostaattiMalli) },
      { label: 'Painesäätimen malli', value: snapVal(row.painesäätimenMalli) },
    ]);
    if (airBlk) lauhdeParts.push(airBlk);
  }
  if (lauhdeParts.length > 0) {
    parts.push(printSection('Lauhduttimet', lauhdeParts.join('')));
  }

  if (snapshot.isMLP && snapshot.mlpData && mlpSnapshotSectionHasContent(snapshot.mlpData as Record<string, unknown>)) {
    const m = snapshot.mlpData as Record<string, unknown>;
    const mlpRows: { label: string; value: string }[] = [];
    if (m.keruuJaahdytysPiiri === true) mlpRows.push({ label: 'Erillinen keruu/jäähdytyspiiri', value: 'Kyllä' });
    if (m.keruuJaahdytysPiiriPumppu === true) mlpRows.push({ label: 'Erill. piirissä pumppu', value: 'Kyllä' });
    if (m.latausTulistuspiiri === true) mlpRows.push({ label: 'Tulistuspiiri', value: 'Kyllä' });
    if (m.latausTulistuspiiriPumppu === true) mlpRows.push({ label: 'Tulistuspiirissä pumppu', value: 'Kyllä' });
    for (const { key, label } of MLP_LAITEKORTTI_ROWS) {
      const raw = m[key];
      const value =
        String(key).includes('SyottoValinta') || String(key).includes('PumpunSyottoValinta')
          ? formatPumpSyottoReadout(raw) ?? '—'
          : snapVal(raw);
      if (isPrintValueFilled(value)) mlpRows.push({ label, value });
    }
    if (m.kiinteistoPiiritSisallytetaan === false) {
      mlpRows.push({
        label: 'Kiinteistön piirit laitekortissa',
        value: 'Ei sisällä — täytetty vain pöytäkirjaan',
      });
    }
    const lpBlocks: string[] = [];
    if (Array.isArray(m.lampoPiirit)) {
      (m.lampoPiirit as Record<string, unknown>[]).forEach((row, idx) => {
        const show =
          nonEmpty(row.pumppuValmistaja) ||
          nonEmpty(row.pumppuMalli) ||
          nonEmpty(row.pumppuTyyppi) ||
          nonEmpty(row.jakotapa) ||
          nonEmpty(row.jakotapaMuu) ||
          nonEmpty(row.pumppuSyottoValinta);
        if (!show) return;
        const blk = printSubblock(`Kiinteistön lämpöpiiri ${idx + 1}`, [
          { label: 'Jakotapa', value: snapVal(row.jakotapa) },
          { label: 'Jakotapa (muu)', value: snapVal(row.jakotapaMuu) },
          { label: 'Pumpun valmistaja', value: snapVal(row.pumppuValmistaja) },
          { label: 'Pumpun malli', value: snapVal(row.pumppuMalli) },
          { label: 'Pumpun tyyppi (vanha)', value: snapVal(row.pumppuTyyppi) },
          { label: 'Pumpun syöttö', value: formatPumpSyottoReadout(row.pumppuSyottoValinta) ?? '—' },
        ]);
        if (blk) lpBlocks.push(blk);
      });
    }
    parts.push(printSection('Lämpöpumppu / kiertovedet (MLP)', `${kvTable(mlpRows)}${lpBlocks.join('')}`));
  }

  if (showSisayksikotInSnapshot(snapshot)) {
    const rows0 = [{ label: 'Määrä', value: snapVal(snapshot.sisayksikko?.maara) }];
    const filled = ((snapshot.sisayksikko?.data || []) as { tyyppi?: string; malli?: string; sarjanumero?: string }[])
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => nonEmpty(row.tyyppi) || nonEmpty(row.malli) || nonEmpty(row.sarjanumero));
    const blocks = filled
      .map(({ row }, n) =>
        printSubblock(`Sisäyksikkö ${n + 1}`, [
          { label: 'Tyyppi', value: snapVal(row.tyyppi) },
          { label: 'Malli', value: snapVal(row.malli) },
          { label: 'Sarjanumero', value: snapVal(row.sarjanumero) },
        ]),
      )
      .filter(Boolean)
      .join('');
    parts.push(printSection('Sisäyksiköt', `${kvTable(rows0)}${blocks}`));
  }

  return parts.join('');
}

export function buildEquipmentCardPrintMainHtml(input: {
  customerName: string;
  deviceTypeLabel: string;
  equipment: {
    name: string;
    tag?: string | null;
    model?: string | null;
    serial_number?: string | null;
    location?: string | null;
    notes?: string | null;
    huolto_technical_snapshot?: unknown;
  };
  latestMaintenanceLabel: string;
}): string {
  const { customerName, deviceTypeLabel, equipment, latestMaintenanceLabel } = input;

  const baseRows: { label: string; value: string }[] = [];
  const addBase = (label: string, value: string) => {
    const v = String(value ?? '').trim();
    if (v) baseRows.push({ label, value: v });
  };
  addBase('Asiakas', customerName);
  addBase('Laitteen tyyppi', deviceTypeLabel);
  addBase('Nimi', equipment.name);
  addBase('Tunniste', equipment.tag || '');
  addBase('Malli', equipment.model || '');
  addBase('Sarjanumero', equipment.serial_number || '');
  addBase('Sijainti', equipment.location || '');
  addBase('Huomiot', equipment.notes || '');

  const snapshot =
    equipment.huolto_technical_snapshot && typeof equipment.huolto_technical_snapshot === 'object'
      ? (equipment.huolto_technical_snapshot as ParsedEquipmentSnapshot)
      : null;

  const snapshotHtml = snapshot ? buildEquipmentCardSnapshotPrintHtml(snapshot) : '';

  return [
    printSection('Laiteperustiedot', kvTable(baseRows)),
    printSection('Viimeisin huolto', kvTable([{ label: 'Viimeisin huolto', value: latestMaintenanceLabel }])),
    snapshot
      ? `<div class="print-card-section"><h2 class="print-card-h2">Kiinteät laitetiedot (huoltopöytäkirjasta)</h2><div class="print-card-body print-card-snapshot-wrap">${snapshotHtml}</div></div>`
      : printSection(
          'Kiinteät laitetiedot',
          `<p class="print-card-muted">Ei tallennettua tilannekuvaa — päivitä tiedot huoltopöytäkirjasta.</p>`,
        ),
  ].join('');
}
