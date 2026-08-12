import type { MaintenanceReportTabId } from '../../lib/huoltoRaportti/maintenanceReportTabs';
import { useMaintenanceReportSectionSettings } from './MaintenanceReportSectionSettingsProvider';

type Props = {
  tabId: MaintenanceReportTabId;
  label?: string;
};

export function MaintenanceReportSectionSettingsLink({
  tabId,
  label = 'Tulostus- ja raporttiasetukset',
}: Props) {
  const settings = useMaintenanceReportSectionSettings();
  if (!settings) return null;

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm maintenance-section-settings-link"
      onClick={() => settings.openSettings(tabId)}
    >
      {label}
    </button>
  );
}
