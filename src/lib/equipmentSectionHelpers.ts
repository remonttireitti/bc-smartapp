import { customerDocumentsSubtitle } from './customerSectionHelpers';
import { deviceTypeLabel } from './huoltoRaportti/equipmentSnapshotDisplay';
import { formatMaintenanceDateFi } from './equipmentMaintenanceHistory';
import type { CustomerLinkedDocument } from './customerDocuments';
import type { Equipment } from '../types';
import type { ParsedEquipmentSnapshot } from './huoltoRaportti/equipmentSnapshotDisplay';
import {
  circuitCompressorDisplayCount,
  condenserRowShowsAirLauhdutinSection,
  evaporatorSnapshotRowIsMeaningful,
  huoltoTechnicalSnapshotShowsEvaporatorHeading,
  mlpSnapshotSectionHasContent,
  nestelauhdutinRegistryUnitIsMeaningful,
  showSisayksikotInSnapshot,
} from './huoltoRaportti/equipmentSnapshotDisplay';

export const EQUIPMENT_SECTION_COLORS = {
  info: '#1976D2',
  snapshot: '#388E3C',
  documents: '#D97706',
} as const;

export const EQUIPMENT_SNAPSHOT_SECTION_COLORS = {
  kylmaaine: '#0D9488',
  piirit: '#7C3AED',
  ulkoyksikko: '#6366F1',
  hoyrystimet: '#0891B2',
  lauhduttimet: '#BE185D',
  mlp: '#D97706',
  sisayksikot: '#64748B',
  konvektorit: '#388E3C',
} as const;

export type EquipmentSnapshotSectionId = keyof typeof EQUIPMENT_SNAPSHOT_SECTION_COLORS;

export type EquipmentSnapshotSectionMeta = {
  id: EquipmentSnapshotSectionId;
  title: string;
  subtitle: string;
  color: string;
};

export function equipmentInfoSubtitle(
  equipment: Equipment,
  latestMaintenanceYmd: string | null | undefined,
): string {
  const parts = [deviceTypeLabel(equipment.device_type)];
  if (equipment.model?.trim()) parts.push(equipment.model.trim());
  if (equipment.location?.trim()) parts.push(equipment.location.trim());
  if (latestMaintenanceYmd) parts.push(`huolto ${formatMaintenanceDateFi(latestMaintenanceYmd)}`);
  return parts.join(' · ');
}

export function equipmentSnapshotSubtitle(snapshot: ParsedEquipmentSnapshot | null): string {
  if (!snapshot) return 'Ei tallennettuja tietoja';
  const sections = getEquipmentSnapshotSections(snapshot);
  if (sections.length === 0) return 'Ei täytettyjä tietoja';
  return sections.length === 1 ? '1 osio' : `${sections.length} osiota`;
}

export function equipmentDocumentsSubtitle(documents: CustomerLinkedDocument[]): string {
  return customerDocumentsSubtitle(documents);
}

export function getEquipmentSnapshotSections(snapshot: ParsedEquipmentSnapshot): EquipmentSnapshotSectionMeta[] {
  const sections: EquipmentSnapshotSectionMeta[] = [];

  if (snapshot.laiteTyyppi === 'konvektorit') {
    const count = snapshot.konvektorit?.length ?? 0;
    if (count > 0) {
      sections.push({
        id: 'konvektorit',
        title: 'Konvektorit',
        subtitle: count === 1 ? '1 konvektori' : `${count} konvektoria`,
        color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.konvektorit,
      });
    }
    return sections;
  }

  const refrigerant = [
    snapshot.laiteKayttotarkoitus,
    snapshot.kylmaaineTyyppi,
    snapshot.kylmaaineLaatu,
    snapshot.kylmaaineMaaraYhteensa,
    snapshot.kylmaaineCO2Ekv,
  ].some((value) => String(value ?? '').trim());
  if (refrigerant) {
    const refrigerantLabel = String(snapshot.kylmaaineTyyppi || snapshot.kylmaaineLaatu || '').trim();
    sections.push({
      id: 'kylmaaine',
      title: 'Käyttötarkoitus ja kylmäaine',
      subtitle: refrigerantLabel || 'Tekniset tiedot',
      color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.kylmaaine,
    });
  }

  const piirejaCount = Math.max(1, parseInt(String(snapshot.kylmaainePiireja || '1').trim(), 10) || 1);
  const circuits = [
    snapshot.kp1Data,
    snapshot.kp2Data,
    snapshot.kp3Data,
  ].slice(0, Math.min(3, piirejaCount));
  let compressorCount = 0;
  for (const data of circuits) {
    if ((data as { onKaytossa?: boolean })?.onKaytossa === false) continue;
    compressorCount += circuitCompressorDisplayCount((data ?? {}) as Record<string, unknown>);
  }
  if (compressorCount > 0 || circuits.some((data) => data && Object.keys(data).length > 0)) {
    sections.push({
      id: 'piirit',
      title: 'Piirit ja kompressorit',
      subtitle: compressorCount > 0 ? `${compressorCount} kompressoria` : 'Piiritiedot',
      color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.piirit,
    });
  }

  const ulko = snapshot.ulkoyksikko as Record<string, unknown>;
  const ulkoFilled = ['ulkoyksikkoMalli', 'ulkoyksikkoSarjanumero', 'ulkoyksikkoJaahdytysTeho', 'ulkoyksikkoLammitysTeho']
    .some((key) => String(ulko[key] ?? '').trim());
  if (ulkoFilled) {
    sections.push({
      id: 'ulkoyksikko',
      title: 'Ulkoyksikkö',
      subtitle: String(ulko.ulkoyksikkoMalli ?? '').trim() || 'Ulkoyksikön tiedot',
      color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.ulkoyksikko,
    });
  }

  if (huoltoTechnicalSnapshotShowsEvaporatorHeading(snapshot.laiteTyyppi)) {
    const evCount = (snapshot.evaporatorData || []).filter((row) => evaporatorSnapshotRowIsMeaningful(row)).length;
    if (evCount > 0) {
      sections.push({
        id: 'hoyrystimet',
        title: 'Höyrystimet',
        subtitle: evCount === 1 ? '1 höyrystin' : `${evCount} höyrystintä`,
        color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.hoyrystimet,
      });
    }
  }

  const nestCount = (snapshot.nestelauhduttimetVj || []).filter((unit) =>
    nestelauhdutinRegistryUnitIsMeaningful(unit),
  ).length;
  const airCount = (snapshot.condenserData || []).filter((co) =>
    condenserRowShowsAirLauhdutinSection(co, snapshot.laiteTyyppi),
  ).length;
  const anyNestShell = (snapshot.condenserData || []).some((co) => co.tyyppi === 'nestekiertoinen');
  if (nestCount > 0 || airCount > 0 || anyNestShell) {
    const total = nestCount + airCount;
    sections.push({
      id: 'lauhduttimet',
      title: 'Lauhduttimet',
      subtitle: total > 0 ? `${total} lauhdutinta` : 'Nestekiertoinen',
      color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.lauhduttimet,
    });
  }

  if (snapshot.isMLP && snapshot.mlpData && mlpSnapshotSectionHasContent(snapshot.mlpData as Record<string, unknown>)) {
    sections.push({
      id: 'mlp',
      title: 'Lämpöpumppu / kiertovedet',
      subtitle: 'MLP-tiedot',
      color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.mlp,
    });
  }

  if (showSisayksikotInSnapshot(snapshot)) {
    const rows = (snapshot.sisayksikko?.data || []) as { tyyppi?: string; malli?: string; sarjanumero?: string }[];
    const filled = rows.filter(
      (row) => row.tyyppi?.trim() || row.malli?.trim() || row.sarjanumero?.trim(),
    ).length;
    if (filled > 0 || snapshot.sisayksikko?.maara) {
      sections.push({
        id: 'sisayksikot',
        title: 'Sisäyksiköt',
        subtitle: filled > 0 ? `${filled} yksikköä` : String(snapshot.sisayksikko?.maara ?? 'Sisäyksiköt'),
        color: EQUIPMENT_SNAPSHOT_SECTION_COLORS.sisayksikot,
      });
    }
  }

  return sections;
}
