import { useMemo, useState } from 'react';
import EquipmentSnapshotReadOnly from './EquipmentSnapshotReadOnly';
import { WorkReportSectionTile, WorkReportSectionTileGrid } from '../WorkReportSectionTile';
import WorkReportSectionDialog from '../WorkReportSectionDialog';
import {
  getEquipmentSnapshotSections,
  type EquipmentSnapshotSectionId,
} from '../../lib/equipmentSectionHelpers';
import type { ParsedEquipmentSnapshot } from '../../lib/huoltoRaportti/equipmentSnapshotDisplay';

type Props = {
  snapshot: ParsedEquipmentSnapshot;
};

export default function EquipmentSnapshotTileView({ snapshot }: Props) {
  const sections = useMemo(() => getEquipmentSnapshotSections(snapshot), [snapshot]);
  const [openSection, setOpenSection] = useState<EquipmentSnapshotSectionId | null>(null);

  if (sections.length === 0) {
    return (
      <p className="muted">
        Ei vielä tallennettua teknistä tilannekuvaa. Tiedot päivittyvät, kun huoltopöytäkirja tallentaa laiterekisteriin.
      </p>
    );
  }

  return (
    <>
      <p className="muted">
        Huoltopöytäkirjasta laiterekisteriin tallennetut tiedot. Mittaukset ja tarkastukset eivät näy tässä.
      </p>

      <WorkReportSectionTileGrid>
        {sections.map((section) => (
          <WorkReportSectionTile
            key={section.id}
            title={section.title}
            subtitle={section.subtitle}
            color={section.color}
            active={openSection === section.id}
            onClick={() => setOpenSection(section.id)}
          />
        ))}
      </WorkReportSectionTileGrid>

      {sections.map((section) => (
        <WorkReportSectionDialog
          key={section.id}
          open={openSection === section.id}
          title={section.title}
          onClose={() => setOpenSection(null)}
          nested
          wide
        >
          <EquipmentSnapshotReadOnly snapshot={snapshot} sections={[section.id]} hideSectionTitles />
        </WorkReportSectionDialog>
      ))}
    </>
  );
}
