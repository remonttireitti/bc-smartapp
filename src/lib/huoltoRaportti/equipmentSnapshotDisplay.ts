import { refrigerantCircuitHasMagnetValve } from './deviceModuleLogic';
import type { CondenserData, EquipmentSnapshot, NestelauhdutinUnitData } from './types';

export type ParsedEquipmentSnapshot = EquipmentSnapshot & Record<string, unknown>;

export const LAUHDUTIN_TYYPIT: Record<string, string> = {
  koneseen_integroitu: 'Koneseen integroitu ilmalauhdutin',
  erillinen_ilma: 'Erillinen ilmalauhdutin',
  nestekiertoinen: 'Levy- tai putkilämmönvaihdin + nestekiertoinen ilmalauhdutin',
};

export const NESTE_VJ_OHJAUS_TAPA: Record<string, string> = {
  on_off: 'ON/OFF',
  erillinen_taajuus: 'Erillinen taajuusmuuntaja',
  sisainen_nopeussaato: 'Puhaltimen sisään rakennettu nopeussäätö',
};

export const NESTE_VJ_OHJAUS_LAHDE: Record<string, string> = {
  talo_automaatio: 'Taloautomaatiosta',
  vedenjaahdytyskone: 'Vedenjäähdytyskoneesta',
  lampotila: 'Suora lämpötilan mukainen ohjaus',
  korkeapaine: 'Suora korkeapaineen mukainen ohjaus',
};

export const MLP_LAITEKORTTI_ROWS: { key: string; label: string }[] = [
  { key: 'keruupiiriPumpunValmistaja', label: 'Keruupiiri · pumpun valmistaja' },
  { key: 'keruupiiriPumpunMalli', label: 'Keruupiiri · pumpun malli' },
  { key: 'keruupiirinPumpunTyyppi', label: 'Keruupiiri · pumpun tyyppi (vanha)' },
  { key: 'keruupiiriPumpunSyottoValinta', label: 'Keruupiiri · pumpun syöttö' },
  { key: 'keruupiiriNeste', label: 'Keruupiiri · neste' },
  { key: 'keruuPaisuntaAstiaKoko', label: 'Keruu · paisunta-astia (l)' },
  { key: 'keruuPaisuntaAstiaEsipaine', label: 'Keruu · paisunta-astian esipaine (bar)' },
  { key: 'keruuJaahdytysPumpunValmistaja', label: 'Erill. keruu/jäähdytyspiiri · pumpun valmistaja' },
  { key: 'keruuJaahdytysPumpunMalli', label: 'Erill. keruu/jäähdytyspiiri · pumpun malli' },
  { key: 'keruuJaahdytysPumppuTyyppi', label: 'Erill. keruu/jäähdytyspiiri · pumpun tyyppi (vanha)' },
  { key: 'keruuJaahdytysPumpunSyottoValinta', label: 'Erill. keruu/jäähdytyspiiri · pumpun syöttö' },
  { key: 'latausPumpunValmistaja', label: 'Latauspiiri · pumpun valmistaja' },
  { key: 'latausPumpunMalli', label: 'Latauspiiri · pumpun malli' },
  { key: 'latausPumpunTyyppi', label: 'Latauspiiri · pumpun tyyppi (vanha)' },
  { key: 'latausPumpunSyottoValinta', label: 'Latauspiiri · pumpun syöttö' },
  { key: 'latausNeste', label: 'Latauspiiri · neste' },
  { key: 'latausPaisuntaAstiaKoko', label: 'Lataus · paisunta-astia (l)' },
  { key: 'latausPaisuntaAstiaEsipaine', label: 'Lataus · paisunta-astian esipaine (bar)' },
  { key: 'latausTulistusPumpunValmistaja', label: 'Tulistus · pumpun valmistaja' },
  { key: 'latausTulistusPumpunMalli', label: 'Tulistus · pumpun malli' },
  { key: 'latausTulistusPumppuTyyppi', label: 'Tulistus · pumpun tyyppi (vanha)' },
  { key: 'latausTulistusPumpunSyottoValinta', label: 'Tulistus · pumpun syöttö' },
  { key: 'latausTulistusNeste', label: 'Tulistus · neste' },
  { key: 'kayttovesiTilavuus', label: 'Käyttövesivaraaja · tilavuus' },
  { key: 'kayttovesiLampotilaAsetus', label: 'Käyttövesi · lämpötila-asetus' },
  { key: 'kayttovesiKiertoPumpunValmistaja', label: 'Käyttövesikierto · pumpun valmistaja' },
  { key: 'kayttovesiKiertoPumpunMalli', label: 'Käyttövesikierto · pumpun malli' },
  { key: 'kayttovesiKiertoPumppuTyyppi', label: 'Käyttövesikierto · pumpun tyyppi (vanha)' },
  { key: 'lampoPaisuntaAstiaKoko', label: 'Kiinteistön piirit · paisunta-astia (l)' },
  { key: 'lampoPaisuntaAstiaEsipaine', label: 'Kiinteistön piirit · paisunta-astian esipaine (bar)' },
];

const ILMALAUHDUTIN_TYYPIT = new Set(['koneseen_integroitu', 'erillinen_ilma']);

export function parseEquipmentSnapshot(raw: unknown): ParsedEquipmentSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ParsedEquipmentSnapshot;
}

export function nonEmpty(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

export function snapVal(value: unknown): string | undefined {
  const s = value == null ? '' : String(value).trim();
  return s || undefined;
}

export function formatPumpSyottoReadout(value: unknown): string | undefined {
  if (value === '230_1') return '230 V (1-vaihe)';
  if (value === '400_3') return '400 V (3-vaihe)';
  return snapVal(value);
}

export function huoltoTechnicalSnapshotShowsEvaporatorHeading(laiteTyyppi: string): boolean {
  return laiteTyyppi === 'kylmäkoneikko' || laiteTyyppi === 'pakastin' || laiteTyyppi === 'muu';
}

export function kompressoriSnapshotRowMeaningful(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    nonEmpty(row.valmistaja) ||
    nonEmpty(row.malli) ||
    nonEmpty(row.tyyppi) ||
    nonEmpty(row.ohjaustapa) ||
    nonEmpty(row.kontaktoriTyyppi) ||
    nonEmpty(row.pehmokaynnistinTyyppi) ||
    nonEmpty(row.taajuusmuuttajaTyyppi) ||
    nonEmpty(row.ohjaustapaMuu)
  );
}

function circuitCompressorSummary(circuit: Record<string, unknown>): { declared: number; filled: number } {
  const raw = parseInt(String(circuit.kompressorienMaara || '0'), 10);
  let filled = 0;
  for (let i = 1; i <= 6; i += 1) {
    if (kompressoriSnapshotRowMeaningful(circuit[`kompressori${i}`])) filled += 1;
  }
  const declared = Number.isFinite(raw) && raw > 0 ? raw : filled;
  return { declared, filled };
}

export function circuitCompressorDisplayCount(circuit: Record<string, unknown>): number {
  const { filled, declared } = circuitCompressorSummary(circuit);
  return Math.max(filled, declared);
}

export function circuitHasStaticRefrigerantFields(
  circuit: Record<string, unknown>,
  laiteTyyppi?: string,
): boolean {
  const showMag =
    laiteTyyppi != null && laiteTyyppi !== ''
      ? refrigerantCircuitHasMagnetValve(laiteTyyppi, String(circuit.paisuntaventtiiliTyyppi ?? ''))
      : true;
  return (
    nonEmpty(circuit.ohjaustapa) ||
    nonEmpty(circuit.paisuntaventtiiliTyyppi) ||
    nonEmpty(circuit.paisuntaventtiiliMuu) ||
    nonEmpty(circuit.paisuntaventtiiliValmistaja) ||
    nonEmpty(circuit.paisuntaventtiiliMalli) ||
    (showMag && nonEmpty(circuit.magneettiventtiiliValmistaja)) ||
    (showMag && nonEmpty(circuit.magneettiventtiiliMalli)) ||
    nonEmpty(circuit.kuivainValmistaja) ||
    nonEmpty(circuit.kuivainMalli) ||
    nonEmpty(circuit.kuivainKivienMaara)
  );
}

export {
  evaporatorSnapshotRowIsMeaningful,
  evapTyyppiLabel,
} from './evaporatorHelpers';

export { refrigerantCircuitHasMagnetValve };

export function nestelauhdutinRegistryUnitIsMeaningful(unit: Partial<NestelauhdutinUnitData>): boolean {
  const t = (value: unknown) => String(value ?? '').trim();
  if (t(unit.valmistaja) || t(unit.malli) || t(unit.sarjanumero)) return true;
  if (t(unit.puhaltimienValmistaja) || t(unit.puhaltimienMalli)) return true;
  const maara = unit.puhaltimienMaara != null ? Number(unit.puhaltimienMaara) : 0;
  if (maara > 0) return true;
  if (unit.puhallinOhjausTapa || unit.ohjausLahde) return true;
  if ((unit.puhaltimet?.length ?? 0) > 0) return true;
  return false;
}

function condenserHasMeaningfulAirFields(co: Partial<CondenserData>): boolean {
  return (
    nonEmpty((co as { valmistaja?: string }).valmistaja) ||
    nonEmpty((co as { malli?: string }).malli) ||
    nonEmpty(co.puhallinOhjaus) ||
    nonEmpty(co.puhallinOhjausMuu) ||
    nonEmpty(co.nopeussäädinMalli) ||
    nonEmpty(co.taajusmuuntajaMalli) ||
    nonEmpty(co.kpPressostaattiMalli) ||
    co.talvivarustus === true ||
    nonEmpty(co.talvivarustusTapa) ||
    nonEmpty(co.painesäätimenMalli) ||
    (co.puhaltimienMaara != null && Number(co.puhaltimienMaara) > 0)
  );
}

export function condenserRowShowsAirLauhdutinSection(co: Partial<CondenserData>, laiteTyyppi: string): boolean {
  if (String(co.tyyppi || '') === 'nestekiertoinen') return false;
  const t = String(co.tyyppi || '').trim();
  const airType = ILMALAUHDUTIN_TYYPIT.has(t);
  const meaningful = condenserHasMeaningfulAirFields(co);
  if (laiteTyyppi === 'Vedenjäähdytyskone' && !airType) return false;
  return airType || meaningful;
}

export function mlpSnapshotSectionHasContent(m: Record<string, unknown>): boolean {
  if (MLP_LAITEKORTTI_ROWS.some(({ key }) => nonEmpty(m[key]))) return true;
  if (m.keruuJaahdytysPiiri === true || m.keruuJaahdytysPiiriPumppu === true) return true;
  if (m.latausTulistuspiiri === true || m.latausTulistuspiiriPumppu === true) return true;
  if (m.kayttovesiKiertoEnabled === true || m.kayttovesiEnabled === true) return true;
  const circuits = m.lampoPiirit;
  if (Array.isArray(circuits) && circuits.length > 0) {
    return circuits.some(
      (row: Record<string, unknown>) =>
        nonEmpty(row?.pumppuValmistaja) ||
        nonEmpty(row?.pumppuMalli) ||
        nonEmpty(row?.pumppuTyyppi) ||
        nonEmpty(row?.jakotapa) ||
        nonEmpty(row?.jakotapaMuu) ||
        nonEmpty(row?.pumppuSyottoValinta),
    );
  }
  return false;
}

export function showSisayksikotInSnapshot(snapshot: ParsedEquipmentSnapshot): boolean {
  const t = snapshot.laiteTyyppi;
  if (t === 'lämpöpumppu') return true;
  if (t === 'muu') {
    const rows = snapshot.sisayksikko?.data as Array<{ tyyppi?: string; malli?: string; sarjanumero?: string }> | undefined;
    if (
      Array.isArray(rows) &&
      rows.some((row) =>
        String(row?.tyyppi || '').trim() || String(row?.malli || '').trim() || String(row?.sarjanumero || '').trim(),
      )
    ) {
      return true;
    }
  }
  return false;
}

export function deviceTypeLabel(value: string | null | undefined): string {
  const map: Record<string, string> = {
    'lämpöpumppu': 'Lämpöpumppu',
    kylmäkoneikko: 'Kylmäkoneikko',
    pakastin: 'Pakastin',
    Vedenjäähdytyskone: 'Vedenjäähdytyskone',
    konvektorit: 'Konvektorit',
    muu: 'Muu laite',
  };
  const key = String(value || '').trim();
  return map[key] || key || '—';
}
