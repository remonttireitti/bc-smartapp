import { useEffect, useMemo } from 'react';
import { HuoltoModuleDialogProvider, useHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';
import { useHuoltoEditUi } from './HuoltoEditUiContext';
import { maintenanceTabUsesDialogLauncher } from '../../lib/huoltoRaportti/maintenanceDocumentDialogTabs';
import {
  buildMaintenanceDocumentEntries,
  documentEntryCompletion,
  documentEntryUsesDialogLauncher,
  documentNavTargetTabId,
} from '../../lib/huoltoRaportti/maintenanceDocumentUnitEntries';
import {
  MaintenanceReportDocumentSection,
  maintenanceSectionDomId,
} from './MaintenanceReportDocumentSection';
import { MaintenanceReportDocumentTile } from './MaintenanceReportDocumentTile';
import {
  MaintenanceReportTabContent,
  type MaintenanceReportTabContentProps,
} from './MaintenanceReportTabContent';
import { maintenanceDocumentTheme } from '../../lib/huoltoRaportti/maintenanceDocumentTheme';
import {
  buildMaintenanceDocumentTabSummary,
  maintenanceTabHasPrintSettings,
} from '../../lib/huoltoRaportti/maintenanceDocumentTabSummary';
import type { MaintenanceReportTabItem, MaintenanceReportTabId } from '../../lib/huoltoRaportti/maintenanceReportTabs';
import { useMaintenanceReportSectionSettings } from './MaintenanceReportSectionSettingsProvider';
import { HuoltoPrintForm } from './print/MaintenancePrintLayout';
import { EvaporatorCircuitsSync } from './EvaporatorCircuitsSync';
import { CondenserCircuitsSync } from './CondenserCircuitsSync';
import { RefrigerantCircuitsSync } from './RefrigerantCircuitsSync';
import { EvaporatorModule } from './EvaporatorModule';
import { CondenserModule } from './CondenserModule';
import { RefrigerantCircuitMeasurementsUnit } from './RefrigerantCircuitMeasurementsUnit';
import { CompressorModule } from './CompressorModule';
import { RefrigerantCircuitComponentsModule } from './RefrigerantCircuitComponentsModule';
import { createEvaporatorActions, evaporatorTitleForIndex } from './useEvaporatorCircuits';
import { lauhdutinUnitTitle } from '../../lib/huoltoRaportti/sectionTitles';
import {
  getRefrigerantCircuitByIndex,
  patchRefrigerantCircuitAtIndex,
  refrigerantCircuitCompressorTitle,
} from '../../lib/huoltoRaportti/refrigerantCircuitHelpers';
import type { ModuleKey } from '../../lib/huoltoRaportti/constants';
import { usesRefrigerantServiceExtras } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';

type Props = Omit<MaintenanceReportTabContentProps, 'tabId'> & {
  tabs: MaintenanceReportTabItem[];
  tabCompletion?: Partial<Record<string, MaintenanceTabCompletionState>>;
  navTargetTabId?: string | null;
  onNavTargetHandled?: () => void;
  onModuleVisited?: (tabId: string) => void;
  onEnableOptionalModule?: (key: ModuleKey) => void;
};

export function MaintenanceReportDocumentView(props: Props) {
  return (
    <HuoltoModuleDialogProvider>
      <MaintenanceReportDocumentViewInner {...props} />
    </HuoltoModuleDialogProvider>
  );
}

function MaintenanceReportDocumentViewInner({
  tabs,
  tabCompletion,
  navTargetTabId,
  onNavTargetHandled,
  onModuleVisited,
  onEnableOptionalModule,
  ...contentProps
}: Props) {
  const ui = useHuoltoEditUi();
  const sectionSettings = useMaintenanceReportSectionSettings();
  const moduleDialog = useHuoltoModuleDialog();
  const { form, onPatchForm, onSyncForm } = contentProps;

  const entries = useMemo(() => buildMaintenanceDocumentEntries(tabs, form), [tabs, form]);
  const showOptionalMeasurementActions =
    usesRefrigerantServiceExtras(form.laiteTyyppi) && Boolean(onEnableOptionalModule);
  const hasEvaporatorUnits = entries.some((entry) => entry.kind === 'evaporatorUnit');
  const hasCondenserUnits = entries.some((entry) => entry.kind === 'condenserUnit');
  const hasRefrigerantCircuitUnits = entries.some((entry) =>
    entry.kind === 'circuitMeasurementsUnit'
    || entry.kind === 'circuitCompressorUnit'
    || entry.kind === 'circuitComponentsUnit',
  );
  const evaporatorActions = useMemo(
    () => createEvaporatorActions(form, onPatchForm),
    [form, onPatchForm],
  );

  useEffect(() => {
    if (!navTargetTabId || !ui) return;
    const targetId = documentNavTargetTabId(navTargetTabId, form);
    const opensDialog =
      targetId.includes(':') || maintenanceTabUsesDialogLauncher(targetId as never);
    if (opensDialog) {
      window.requestAnimationFrame(() => {
        scrollToMaintenanceSection(targetId);
        onModuleVisited?.(targetId);
        moduleDialog?.open(targetId);
      });
    } else {
      onModuleVisited?.(targetId);
      openMaintenanceDocumentSection(targetId, ui.setOpen);
    }
    onNavTargetHandled?.();
  }, [navTargetTabId, ui, moduleDialog, onNavTargetHandled, form, onModuleVisited]);

  return (
    <HuoltoModulePresentationProvider value="flat">
      <HuoltoPrintForm>
        {showOptionalMeasurementActions ? (
          <div className="maintenance-optional-module-actions">
            {!form.selectedModules.tiiveyskoe ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onEnableOptionalModule?.('tiiveyskoe')}
              >
                + Lisää tiiveyskoe
              </button>
            ) : null}
            {!form.selectedModules.tyhjiointi ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onEnableOptionalModule?.('tyhjiointi')}
              >
                + Lisää tyhjiöinti
              </button>
            ) : null}
          </div>
        ) : null}
        {hasEvaporatorUnits ? <EvaporatorCircuitsSync form={form} onChange={onSyncForm} /> : null}
        {hasCondenserUnits ? <CondenserCircuitsSync form={form} onChange={onPatchForm} /> : null}
        {hasRefrigerantCircuitUnits ? <RefrigerantCircuitsSync form={form} onChange={onPatchForm} /> : null}
        <div className="grid maintenance-report-document">
          {entries.map((entry) => {
            const completion = documentEntryCompletion(entry, form, tabCompletion);
            const dialogLauncher =
              documentEntryUsesDialogLauncher(entry) || maintenanceTabUsesDialogLauncher(entry.tabId);
            const defaultOpen = dialogLauncher ? false : completion !== 'ok';
            const theme = maintenanceDocumentTheme(
              entry.kind === 'evaporatorUnit'
                ? 'hoyrystin'
                : entry.kind === 'condenserUnit'
                  ? 'lauhdutin'
                  : entry.kind === 'circuitMeasurementsUnit'
                    || entry.kind === 'circuitCompressorUnit'
                    || entry.kind === 'circuitComponentsUnit'
                    ? 'kylmaainePiiri'
                    : (entry.tabId as Parameters<typeof maintenanceDocumentTheme>[0]),
            );

            const tabIdForSettings = entry.kind === 'tab' ? (entry.tabId as MaintenanceReportTabId) : null;

            const hiddenChildren =
              entry.kind === 'evaporatorUnit' && entry.unitIndex != null ? (
                <EvaporatorModule
                  index={entry.unitIndex}
                  laiteTyyppi={form.laiteTyyppi}
                  titleLabel={evaporatorTitleForIndex(form, entry.unitIndex)}
                  data={form.evaporatorData[entry.unitIndex]}
                  locked={false}
                  showSameAsFirst={entry.unitIndex > 0}
                  sameAsFirst={form.evaporatorSamaKuinEnsimmainen[entry.unitIndex]}
                  onSameAsFirstChange={(value) =>
                    evaporatorActions.setSameAsFirst(entry.unitIndex!, value)
                  }
                  onChange={(data) => evaporatorActions.updateEvaporator(entry.unitIndex!, data)}
                  documentUnitKey={entry.tabId}
                  hidePartRow
                />
              ) : entry.kind === 'condenserUnit' && entry.unitIndex != null ? (
                <CondenserModule
                  index={entry.unitIndex}
                  titleLabel={lauhdutinUnitTitle(form.laiteTyyppi, entry.unitIndex)}
                  data={form.condenserData[entry.unitIndex]}
                  onChange={(data) => {
                    const next = [...form.condenserData];
                    next[entry.unitIndex!] = data;
                    onPatchForm({ condenserData: next });
                  }}
                  documentUnitKey={entry.tabId}
                  hidePartRow
                />
              ) : entry.kind === 'circuitMeasurementsUnit' && entry.unitIndex != null ? (
                (() => {
                  const circuit = getRefrigerantCircuitByIndex(form, entry.unitIndex);
                  if (!circuit) return null;
                  return (
                    <RefrigerantCircuitMeasurementsUnit
                      circuitNumber={entry.unitIndex + 1}
                      data={circuit}
                      onChange={(data) => onPatchForm(patchRefrigerantCircuitAtIndex(form, entry.unitIndex!, data))}
                      refrigerantType={form.kylmaaineTyyppi}
                      laiteTyyppi={form.laiteTyyppi}
                      documentUnitKey={entry.tabId}
                      hidePartRow
                    />
                  );
                })()
              ) : entry.kind === 'circuitCompressorUnit'
                && entry.unitIndex != null
                && entry.subIndex != null ? (
                  (() => {
                    const circuit = getRefrigerantCircuitByIndex(form, entry.unitIndex!);
                    if (!circuit) return null;
                    const compressorKeys = [
                      'kompressori1',
                      'kompressori2',
                      'kompressori3',
                      'kompressori4',
                      'kompressori5',
                      'kompressori6',
                    ] as const;
                    const compressorKey = compressorKeys[entry.subIndex!];
                    const compressorNumber = entry.subIndex! + 1;
                    const sameAsFirstKey =
                      compressorNumber > 1
                        ? (`kompressori${compressorNumber}SamaKuin1` as keyof typeof circuit)
                        : null;
                    const lockManufacturerModel =
                      (sameAsFirstKey ? !!circuit[sameAsFirstKey] : false)
                      || (!!circuit.kompressoritSamaKuinPiiri1 && entry.unitIndex! > 0);
                    return (
                      <CompressorModule
                        number={compressorNumber}
                        titleLabel={refrigerantCircuitCompressorTitle(entry.unitIndex! + 1, compressorNumber)}
                        data={circuit[compressorKey]}
                        lockManufacturerModel={lockManufacturerModel}
                        onChange={(compressorData) => {
                          onPatchForm(
                            patchRefrigerantCircuitAtIndex(form, entry.unitIndex!, {
                              ...circuit,
                              [compressorKey]: compressorData,
                            }),
                          );
                        }}
                        documentUnitKey={entry.tabId}
                        hidePartRow
                      />
                    );
                  })()
                ) : entry.kind === 'circuitComponentsUnit' && entry.unitIndex != null ? (
                  (() => {
                    const circuit = getRefrigerantCircuitByIndex(form, entry.unitIndex!);
                    if (!circuit) return null;
                    return (
                      <RefrigerantCircuitComponentsModule
                        circuitNumber={entry.unitIndex! + 1}
                        data={circuit}
                        onChange={(data) => onPatchForm(patchRefrigerantCircuitAtIndex(form, entry.unitIndex!, data))}
                        laiteTyyppi={form.laiteTyyppi}
                        isMLP={form.laiteTyyppi === 'mlp'}
                        firstCircuitData={entry.unitIndex! > 0 ? form.kylmaainePiiri1 : undefined}
                        documentUnitKey={entry.tabId}
                        hidePartRow
                      />
                    );
                  })()
                ) : (
                <MaintenanceReportTabContent
                  tabId={entry.tabId as MaintenanceReportTabContentProps['tabId']}
                  {...contentProps}
                />
              );

            if (dialogLauncher) {
              return (
                <MaintenanceReportDocumentTile
                  key={entry.key}
                  tabId={entry.tabId}
                  title={entry.title}
                  theme={theme}
                  form={form}
                  completion={completion}
                  showSettings={tabIdForSettings ? maintenanceTabHasPrintSettings(tabIdForSettings, form) : false}
                  onOpenSettings={() => tabIdForSettings && sectionSettings?.openSettings(tabIdForSettings)}
                  onModuleVisited={onModuleVisited}
                >
                  {hiddenChildren}
                </MaintenanceReportDocumentTile>
              );
            }

            return (
              <MaintenanceReportDocumentSection
                key={entry.key}
                tabId={entry.tabId}
                title={entry.title}
                theme={theme}
                summary={
                  tabIdForSettings
                    ? buildMaintenanceDocumentTabSummary(tabIdForSettings, form)
                    : undefined
                }
                completion={completion}
                defaultOpen={defaultOpen}
                dialogLauncher={false}
                showSettings={tabIdForSettings ? maintenanceTabHasPrintSettings(tabIdForSettings, form) : false}
                onOpenSettings={() => tabIdForSettings && sectionSettings?.openSettings(tabIdForSettings)}
              >
                {hiddenChildren}
              </MaintenanceReportDocumentSection>
            );
          })}
        </div>
      </HuoltoPrintForm>
    </HuoltoModulePresentationProvider>
  );
}

export function scrollToMaintenanceSection(tabId: string) {
  const el = document.getElementById(maintenanceSectionDomId(tabId));
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function openMaintenanceDocumentSection(
  tabId: string,
  setOpen: (key: string, open: boolean) => void,
) {
  setOpen(`document:${tabId}`, true);
  window.requestAnimationFrame(() => scrollToMaintenanceSection(tabId));
}
