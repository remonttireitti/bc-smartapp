import { useId, type ReactNode } from 'react';
import {
  resolveModuleTilePresentation,
} from '../../lib/huoltoRaportti/maintenanceModuleVisit';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import { maintenanceTabCompletionLabel } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import type { ModuleTheme } from '../../lib/huoltoRaportti/moduleThemes';
import { useHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { maintenanceSectionDomId } from './MaintenanceReportDocumentSection';

type Props = {
  tabId: string;
  title: string;
  theme: ModuleTheme;
  form: HuoltoReportData;
  completion?: MaintenanceTabCompletionState;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  onModuleVisited?: (tabId: string) => void;
  children: ReactNode;
};

export function MaintenanceReportDocumentTile({
  tabId,
  title,
  theme,
  form,
  completion,
  showSettings = false,
  onOpenSettings,
  onModuleVisited,
  children,
}: Props) {
  const contentId = useId();
  const moduleDialog = useHuoltoModuleDialog();
  const presentation = resolveModuleTilePresentation(tabId, form, completion);

  function handleClick() {
    onModuleVisited?.(tabId);
    moduleDialog?.open(tabId);
  }

  function handleSettingsClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onOpenSettings?.();
  }

  return (
    <div id={maintenanceSectionDomId(tabId)} className="maintenance-report-document-tile-wrap">
      <button
        type="button"
        className="tile maintenance-report-document-tile"
        style={{ background: theme.header }}
        onClick={handleClick}
        aria-controls={contentId}
      >
        {showSettings ? (
          <span
            role="button"
            tabIndex={0}
            className="maintenance-report-document-tile-settings"
            aria-label="Tulostusasetukset"
            onClick={handleSettingsClick}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onOpenSettings?.();
              }
            }}
          >
            ⚙
          </span>
        ) : null}
        {presentation.showCheck ? (
          <span
            className="maintenance-report-document-tile-check"
            aria-label={maintenanceTabCompletionLabel('ok')}
          >
            ✓
          </span>
        ) : presentation.showAttention ? (
          <span
            className="maintenance-report-document-tile-check maintenance-report-document-tile-check--attention"
            aria-label={maintenanceTabCompletionLabel('attention')}
          >
            !
          </span>
        ) : null}
        <strong>{title}</strong>
        <span>{presentation.subtitle}</span>
      </button>
      <div
        id={contentId}
        className="maintenance-report-document-section-body--launcher-hidden"
        aria-hidden="true"
      >
        {children}
      </div>
    </div>
  );
}
