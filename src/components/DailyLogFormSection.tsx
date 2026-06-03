import { type ReactNode } from 'react';
import CollapsibleSection from './CollapsibleSection';

type Props = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  collapseKey?: string;
  className?: string;
};

/** Taittuva osio työkirjaus-popupissa (mobiiliystävällinen). */
export default function DailyLogFormSection({
  title,
  children,
  defaultOpen = false,
  collapseKey,
  className = '',
}: Props) {
  return (
    <CollapsibleSection
      title={title}
      defaultOpen={defaultOpen}
      collapseKey={collapseKey}
      variant="plain"
      className={`daily-log-dialog-section ${className}`.trim()}
    >
      {children}
    </CollapsibleSection>
  );
}
