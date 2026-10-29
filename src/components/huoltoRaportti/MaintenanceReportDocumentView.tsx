import { KylmioUnitCounts } from './KylmioUnitCounts';
import { isKylmioDevice } from '../../lib/huoltoRaportti/deviceKokoonpano';
import { kylmioEvaporatorOhjausShared, evaporatorWithLegacyOhjaus } from '../../lib/huoltoRaportti/fieldModules';
import { vakHasRefrigerant, vjHeatingTitle } from '../../lib/huoltoRaportti/deviceKokoonpano';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MaintenanceStepFooter,
  MaintenanceStepOpenList,
  MaintenanceStepOverview,
  type MaintenanceStepItem,
} from './MaintenanceStepOverview';
import ToggleSwitch from '../ToggleSwitch';
import { buildMaintenanceSteps, combineStepStatus, stripSectionNumber } from '../../lib/huoltoRaportti/maintenanceSteps';
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
import { MlpDocumentUnit } from './MlpDocumentUnit';
import { LampopumppuDocumentUnit } from './LampopumppuDocumentUnit';
import { createEvaporatorActions, evaporatorTitleForIndex } from './useEvaporatorCircuits';
import { lauhdutinUnitTitle } from '../../lib/huoltoRaportti/sectionTitles';
import {
  getRefrigerantCircuitByIndex,
  patchRefrigerantCircuitAtIndex,
  refrigerantCircuitCompressorTitle,
} from '../../lib/huoltoRaportti/refrigerantCircuitHelpers';
import { getModuleTheme, type ModuleThemeKey } from '../../lib/huoltoRaportti/moduleThemes';
import type { ModuleKey } from '../../lib/huoltoRaportti/constants';
import { usesRefrigerantServiceExtras } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';

type Props = Omit<MaintenanceReportTabContentProps, 'tabId'> & {
  tabs: MaintenanceReportTabItem[];
  tabCompletion?: Partial<Record<string, MaintenanceTabCompletionState>>;
  navTargetTabId?: string | null;
  onNavTargetHandled?: () => void;
  onModuleVisited?: (tabId: string) => void;
  onToggleOptionalModule?: (key: ModuleKey, on: boolean) => void;
  /** Vaiheen vaihto (Seuraava/Takaisin/hyppy): tallenna heti. */
  onStepChange?: () => void;
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
  onToggleOptionalModule,
  onStepChange,
  ...contentProps
}: Props) {
  const ui = useHuoltoEditUi();
  const sectionSettings = useMaintenanceReportSectionSettings();
  const moduleDialog = useHuoltoModuleDialog();
  const { form, onPatchForm, onSyncForm } = contentProps;

  const entries = useMemo(
    () => buildMaintenanceDocumentEntries(tabs, form).map((entry) => ({ ...entry, title: stripSectionNumber(vjHeatingTitle(entry.title, form)) })),
    [tabs, form],
  );
  const showOptionalMeasurementActions =
    usesRefrigerantServiceExtras(form.laiteTyyppi) && vakHasRefrigerant(form) && Boolean(onToggleOptionalModule);
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

  const steps = useMemo(() => buildMaintenanceSteps(entries, form.laiteTyyppi), [entries, form.laiteTyyppi]);
  const [stepIndex, setStepIndex] = useState(0);
  const activeStep = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const stepItems: MaintenanceStepItem[] = useMemo(
    () => steps.map((step) => ({
      key: step.key,
      title: step.title,
      status: combineStepStatus(step.entryIndexes.map((i) => documentEntryCompletion(entries[i], form, tabCompletion))),
    })),
    [steps, entries, form, tabCompletion],
  );
  const activeEntryIndexes = new Set(steps[activeStep]?.entryIndexes ?? []);
  const stepOfEntry = useCallback(
    (entryIndex: number) => steps.findIndex((step) => step.entryIndexes.includes(entryIndex)),
    [steps],
  );

  const goToStep = useCallback((index: number) => {
    const next = Math.max(0, Math.min(index, steps.length - 1));
    setStepIndex(next);
    onStepChange?.();
    for (const entryIndex of steps[next]?.entryIndexes ?? []) {
      const entry = entries[entryIndex];
      if (entry && ui && !documentEntryUsesDialogLauncher(entry) && !maintenanceTabUsesDialogLauncher(entry.tabId as never)) {
        ui.setOpen(`document:${entry.tabId}`, true);
      }
    }
    window.requestAnimationFrame(() => {
      document.querySelector('.maintenance-step-overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [steps, entries, onStepChange, ui]);

  useEffect(() => {
    if (!navTargetTabId || !ui) return;
    const targetId = documentNavTargetTabId(navTargetTabId, form);
    const targetIndex = entries.findIndex(
      (entry) => entry.tabId === targetId || entry.tabId.startsWith(`${targetId}:`) || targetId.startsWith(`${entry.tabId}:`),
    );
    if (targetIndex >= 0) setStepIndex(Math.max(0, stepOfEntry(targetIndex)));
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
  }, [navTargetTabId, ui, moduleDialog, onNavTargetHandled, form, onModuleVisited, entries, stepOfEntry]);

  return (
    <HuoltoModulePresentationProvider value="flat">
      <HuoltoPrintForm>
        <MaintenanceStepOverview steps={stepItems} activeIndex={activeStep} onJump={goToStep} />
        {hasEvaporatorUnits ? <EvaporatorCircuitsSync form={form} onChange={onSyncForm} /> : null}
        {hasCondenserUnits ? <CondenserCircuitsSync form={form} onChange={onPatchForm} /> : null}
        {hasRefrigerantCircuitUnits ? <RefrigerantCircuitsSync form={form} onChange={onPatchForm} /> : null}
        <div className="grid maintenance-report-document">
          {steps[activeStep]?.key === 'lopetus' || activeStep === steps.length - 1 ? (
            <MaintenanceStepOpenList steps={stepItems} activeIndex={activeStep} onJump={goToStep} />
          ) : null}
          {steps[activeStep]?.key === 'kylmaaine' && showOptionalMeasurementActions ? (
            <div className="maintenance-step-optional">
              {(['tiiveyskoe', 'tyhjiointi'] as const).map((key) => (
                <ToggleSwitch
                  key={key}
                  checked={Boolean(form.selectedModules[key])}
                  onChange={(on) => onToggleOptionalModule?.(key, on)}
                  label={key === 'tiiveyskoe' ? 'Tiiveyskoe' : 'Tyhjiöinti'}
                />
              ))}
            </div>
          ) : null}
          {(() => {
            const renderEntry = (entry: (typeof entries)[number], entryIndex: number) => {
            if (!activeEntryIndexes.has(entryIndex)) return null;
            const inCircuitStep = steps[activeStep]?.key.startsWith('piiri:');
            const shortTitle = inCircuitStep ? entry.title.replace(/^(Kylmä(aine)?piiri|Piiri) \d+\s*[—-]\s*/i, '') : entry.title;
            const singleInStep = (steps[activeStep]?.entryIndexes.length ?? 0) === 1;
            const displayTitle = shortTitle.charAt(0).toUpperCase() + shortTitle.slice(1);
            const completion = documentEntryCompletion(entry, form, tabCompletion);
            const dialogLauncher =
              documentEntryUsesDialogLauncher(entry) || maintenanceTabUsesDialogLauncher(entry.tabId);
            const defaultOpen = !dialogLauncher;
            const theme = (entry.kind === 'mlpUnit' || entry.kind === 'lampopumppuUnit') && entry.themeKey
              ? getModuleTheme(entry.themeKey as ModuleThemeKey)
              : maintenanceDocumentTheme(
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
                  ohjausShared={kylmioEvaporatorOhjausShared(form)}
                  index={entry.unitIndex}
                  laiteTyyppi={form.laiteTyyppi}
                  titleLabel={evaporatorTitleForIndex(form, entry.unitIndex)}
                  data={evaporatorWithLegacyOhjaus(form.evaporatorData[entry.unitIndex], form, entry.unitIndex)}
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
                  deviceCondenserType={form.lauhdutinTyyppiLaite}
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
                ) : entry.kind === 'mlpUnit' && entry.mlpUnitId ? (
                <MlpDocumentUnit
                  form={form}
                  unitId={entry.mlpUnitId}
                  onChange={onPatchForm}
                  documentUnitKey={entry.tabId}
                  hidePartRow
                />
              ) : entry.kind === 'lampopumppuUnit' && entry.lampopumppuUnitId ? (
                <LampopumppuDocumentUnit
                  form={form}
                  unitId={entry.lampopumppuUnitId}
                  onChange={onPatchForm}
                  documentUnitKey={entry.tabId}
                />
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
                  title={entry.tabId === 'raportointi' ? 'Asiakas ja laite' : entry.tabId === 'kokoonpano' && isKylmioDevice(form.laiteTyyppi) ? 'Lauhdutustapa' : singleInStep ? 'Avaa ja täytä' : displayTitle}
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
                title={displayTitle}
                theme={theme}
                summary={
                  tabIdForSettings
                    ? buildMaintenanceDocumentTabSummary(tabIdForSettings, form)
                    : undefined
                }
                completion={completion}
                defaultOpen={defaultOpen}
                dialogLauncher={false}
                hideHeader={singleInStep}
                showSettings={tabIdForSettings ? maintenanceTabHasPrintSettings(tabIdForSettings, form) : false}
                onOpenSettings={() => tabIdForSettings && sectionSettings?.openSettings(tabIdForSettings)}
              >
                {hiddenChildren}
              </MaintenanceReportDocumentSection>
            );
            };
            const isKok = (e: (typeof entries)[number]) => e.tabId === 'kokoonpano';
            // Perustiedot: kokoonpano (lauhdutustapa) ensin, sitten kylmiön yksiköiden määrät (Lauhduttimia riippuu lauhdutustavasta), sitten laitetiedot.
            return (
              <>
                {entries.map((e, i) => (isKok(e) ? renderEntry(e, i) : null))}
                {steps[activeStep]?.key === 'perustiedot' && isKylmioDevice(form.laiteTyyppi) ? (
                  <KylmioUnitCounts form={form} onPatchForm={onPatchForm} />
                ) : null}
                {entries.map((e, i) => (isKok(e) ? null : renderEntry(e, i)))}
              </>
            );
          })()}
        </div>
        <MaintenanceStepFooter activeIndex={activeStep} count={steps.length} onJump={goToStep} />
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
