import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { HuoltotiedotPrintSettingsPanel } from './HuoltotiedotPrintSettingsPanel';
import { MaintenanceReportSectionSettingsDialog } from './MaintenanceReportSectionSettingsDialog';
import { RefrigerantCircuitPrintSettingsPanel } from './RefrigerantCircuitPrintSettingsPanel';
import type { MaintenanceReportTabId } from '../../lib/huoltoRaportti/maintenanceReportTabs';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';

type ContextValue = {
  openSettings: (tabId: MaintenanceReportTabId) => void;
};

const MaintenanceReportSectionSettingsContext = createContext<ContextValue | null>(null);

function settingsDialogTitle(tabId: MaintenanceReportTabId): string {
  if (tabId === 'kylmaainePiiri') return 'Kylmäainepiiri — tulostusasetukset';
  if (tabId === 'huoltotiedot') return 'Huoltotiedot — raportti- ja tulostusasetukset';
  return 'Asetukset';
}

type Props = {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  onPersist?: () => void;
  children: ReactNode;
};

export function MaintenanceReportSectionSettingsProvider({
  form,
  onChange,
  onPersist,
  children,
}: Props) {
  const [settingsTabId, setSettingsTabId] = useState<MaintenanceReportTabId | null>(null);

  const value = useMemo(
    () => ({
      openSettings: (tabId: MaintenanceReportTabId) => setSettingsTabId(tabId),
    }),
    [],
  );

  return (
    <MaintenanceReportSectionSettingsContext.Provider value={value}>
      {children}
      <MaintenanceReportSectionSettingsDialog
        title={settingsTabId ? settingsDialogTitle(settingsTabId) : 'Asetukset'}
        open={settingsTabId !== null}
        onClose={() => setSettingsTabId(null)}
      >
        {settingsTabId === 'huoltotiedot' ? (
          <HuoltotiedotPrintSettingsPanel form={form} onChange={onChange} onPersist={onPersist} />
        ) : null}
        {settingsTabId === 'kylmaainePiiri' ? (
          <RefrigerantCircuitPrintSettingsPanel form={form} onChange={onChange} />
        ) : null}
      </MaintenanceReportSectionSettingsDialog>
    </MaintenanceReportSectionSettingsContext.Provider>
  );
}

export function useMaintenanceReportSectionSettings(): ContextValue | null {
  return useContext(MaintenanceReportSectionSettingsContext);
}
