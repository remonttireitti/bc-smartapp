import { useId, type ReactNode } from 'react';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import { maintenanceTabCompletionLabel } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import type { ModuleTheme } from '../../lib/huoltoRaportti/moduleThemes';
import { useHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { maintenanceSectionDomId } from './MaintenanceReportDocumentSection';

type Props = {
  tabId: string;
  title: string;
  theme: ModuleTheme;
  completion?: MaintenanceTabCompletionState;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  children: ReactNode;
};

function tileSubtitle(completion?: MaintenanceTabCompletionState): string {
  if (completion === 'ok') return 'Valmis';
  if (completion === 'attention') return 'Tarkista';
  return 'Avaa täyttääksesi';
}

export function MaintenanceReportDocumentTile({
  tabId,
  title,
  theme,
  completion,
  showSettings = false,
  onOpenSettings,
  children,
}: Props) {
  const contentId = useId();
  const moduleDialog = useHuoltoModuleDialog();

  function handleClick() {
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
        {completion === 'ok' ? (
          <span
            className="maintenance-report-document-tile-check"
            aria-label={maintenanceTabCompletionLabel('ok')}
          >
            ✓
          </span>
        ) : completion === 'attention' ? (
          <span
            className="maintenance-report-document-tile-check maintenance-report-document-tile-check--attention"
            aria-label={maintenanceTabCompletionLabel('attention')}
          >
            !
          </span>
        ) : null}
        <strong>{title}</strong>
        <span>{tileSubtitle(completion)}</span>
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
