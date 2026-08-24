import type { ReactNode } from 'react';

import { useDailyLogSection } from './DailyLogSectionContext';
import { WorkReportSectionTile } from './WorkReportSectionTile';
import WorkReportSectionDialog from './WorkReportSectionDialog';

type Props = {
  sectionKey: string;
  title: string;
  subtitle: string;
  color: string;
  incomplete?: boolean;
  wide?: boolean;
  children: ReactNode;
};

export default function DailyLogTileSection({
  sectionKey,
  title,
  subtitle,
  color,
  incomplete = false,
  wide = false,
  children,
}: Props) {
  const { openKey, setOpenKey } = useDailyLogSection();
  const open = openKey === sectionKey;

  return (
    <>
      <WorkReportSectionTile
        title={title}
        subtitle={subtitle}
        color={color}
        active={open}
        incomplete={incomplete}
        onClick={() => setOpenKey(sectionKey)}
      />
      <WorkReportSectionDialog nested open={open} title={title} wide={wide} onClose={() => setOpenKey(null)}>
        {children}
      </WorkReportSectionDialog>
    </>
  );
}
