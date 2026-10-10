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
  const { openKey, setOpenKey, focusKeys } = useDailyLogSection();
  const open = openKey === sectionKey;

  if (focusKeys) {
    if (!focusKeys.includes(sectionKey)) return null;
    // Kohdistettu muokkaus (työraportin ruudusta): osio suoraan auki ilman ruutua.
    return (
      <section className={`daily-log-focus-section${wide ? ' daily-log-focus-section-wide' : ''}`}>
        {focusKeys.length > 1 ? <h3 className="daily-log-focus-section-title">{title}</h3> : null}
        {children}
      </section>
    );
  }

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
