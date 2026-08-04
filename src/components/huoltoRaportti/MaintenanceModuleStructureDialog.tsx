import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../lib/huoltoRaportti/constants';
import {
  customModuleTabId,
  isCustomModuleTabId,
  parseCustomModuleTabId,
  type CustomReportModule,
} from '../../lib/huoltoRaportti/customModuleTypes';
import { getManualModuleOptions } from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  getHiddenMaintenanceTabs,
  isPinnedTab,
  moveTabInOrder,
  setMaintenanceTabVisible,
} from '../../lib/huoltoRaportti/maintenanceReportTabCustomization';
import {
  buildMaintenanceReportTabs,
  type MaintenanceReportTabBuildInput,
  type MaintenanceReportTabId,
  type MaintenanceReportTabItem,
} from '../../lib/huoltoRaportti/maintenanceReportTabs';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { CustomModuleBuilderDialog } from './CustomModuleBuilderDialog';

type Props = {
  open: boolean;
  form: HuoltoReportData;
  tabBuildInput: MaintenanceReportTabBuildInput;
  onSave: (patch: Partial<HuoltoReportData>) => void;
  onClose: () => void;
};

const PINNED_LAST_IN_DIALOG: MaintenanceReportTabId[] = ['huomiot', 'huoltotiedot'];

export function MaintenanceModuleStructureDialog({
  open,
  form,
  tabBuildInput,
  onSave,
  onClose,
}: Props) {
  const [draftHidden, setDraftHidden] = useState<MaintenanceReportTabId[]>(form.hiddenTabIds ?? []);
  const [draftOrder, setDraftOrder] = useState<MaintenanceReportTabId[]>(form.moduleTabOrder ?? []);
  const [draftModules, setDraftModules] = useState(form.selectedModules);
  const [draftCustomModules, setDraftCustomModules] = useState<CustomReportModule[]>(form.customModules ?? []);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<CustomReportModule | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftHidden(form.hiddenTabIds ?? []);
    setDraftOrder(form.moduleTabOrder ?? []);
    setDraftModules(form.selectedModules);
    setDraftCustomModules(form.customModules ?? []);
    setBuilderOpen(false);
    setEditingModule(null);
  }, [open, form.hiddenTabIds, form.moduleTabOrder, form.selectedModules, form.customModules]);

  const defaultTabs = useMemo(
    () =>
      buildMaintenanceReportTabs({
        ...tabBuildInput,
        customModules: draftCustomModules,
        hiddenTabIds: [],
        moduleTabOrder: [],
      }),
    [tabBuildInput, draftCustomModules],
  );

  const draftActiveTabs = useMemo(() => {
    const hidden = new Set(draftHidden);
    const visible = defaultTabs.filter((tab) => !hidden.has(tab.id));
    const middle = visible.filter((tab) => !isPinnedTab(tab.id) && tab.id !== 'raportointi');
    const order = draftOrder.length > 0 ? draftOrder : middle.map((tab) => tab.id);
    const orderedMiddle = order
      .map((id) => middle.find((tab) => tab.id === id))
      .filter((tab): tab is MaintenanceReportTabItem => Boolean(tab));
    for (const tab of middle) {
      if (!orderedMiddle.some((entry) => entry.id === tab.id)) orderedMiddle.push(tab);
    }
    const first = visible.find((tab) => tab.id === 'raportointi');
    const last = PINNED_LAST_IN_DIALOG
      .map((id) => visible.find((tab) => tab.id === id))
      .filter((tab): tab is MaintenanceReportTabItem => Boolean(tab));
    return [first, ...orderedMiddle, ...last].filter((tab): tab is MaintenanceReportTabItem => Boolean(tab));
  }, [defaultTabs, draftHidden, draftOrder]);

  const hiddenTabs = useMemo(
    () => getHiddenMaintenanceTabs(defaultTabs, draftActiveTabs),
    [defaultTabs, draftActiveTabs],
  );

  const middleTabs = draftActiveTabs.filter(
    (tab) => tab.id !== 'raportointi' && !PINNED_LAST_IN_DIALOG.includes(tab.id),
  );

  const optionalModules = useMemo(
    () => getManualModuleOptions(form.laiteTyyppi),
    [form.laiteTyyppi],
  );

  if (!open) return null;

  function hideTab(tab: MaintenanceReportTabItem) {
    const patch = setMaintenanceTabVisible(
      { ...form, hiddenTabIds: draftHidden, selectedModules: draftModules },
      tab,
      false,
    );
    setDraftHidden(patch.hiddenTabIds ?? []);
    if (patch.selectedModules) setDraftModules(patch.selectedModules);
  }

  function showTab(tab: MaintenanceReportTabItem) {
    const patch = setMaintenanceTabVisible(
      { ...form, hiddenTabIds: draftHidden, selectedModules: draftModules },
      tab,
      true,
    );
    setDraftHidden(patch.hiddenTabIds ?? []);
    if (patch.selectedModules) setDraftModules(patch.selectedModules);
  }

  function moveTab(tabId: MaintenanceReportTabId, direction: 'up' | 'down') {
    setDraftOrder((prev) =>
      moveTabInOrder(
        prev,
        tabId,
        direction,
        middleTabs.map((tab) => tab.id),
      ),
    );
  }

  function toggleOptionalModule(key: ModuleKey, checked: boolean) {
    setDraftModules((prev) => ({ ...prev, [key]: checked }));
  }

  function openCreateModule() {
    setEditingModule(null);
    setBuilderOpen(true);
  }

  function openEditModule(moduleId: string) {
    const module = draftCustomModules.find((entry) => entry.id === moduleId);
    if (!module) return;
    setEditingModule(module);
    setBuilderOpen(true);
  }

  function removeCustomModule(moduleId: string) {
    const tabId = customModuleTabId(moduleId) as MaintenanceReportTabId;
    setDraftCustomModules((prev) => prev.filter((entry) => entry.id !== moduleId));
    setDraftHidden((prev) => prev.filter((id) => id !== tabId));
    setDraftOrder((prev) => prev.filter((id) => id !== tabId));
  }

  function saveCustomModule(module: CustomReportModule) {
    setDraftCustomModules((prev) => {
      const index = prev.findIndex((entry) => entry.id === module.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = module;
        return next;
      }
      return [...prev, module];
    });
    const tabId = customModuleTabId(module.id) as MaintenanceReportTabId;
    setDraftHidden((prev) => prev.filter((id) => id !== tabId));
    setDraftOrder((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
  }

  function handleSave() {
    onSave({
      hiddenTabIds: draftHidden,
      moduleTabOrder: draftOrder,
      selectedModules: draftModules,
      customModules: draftCustomModules,
    });
    onClose();
  }

  return (
    <>
      <CustomModuleBuilderDialog
        open={builderOpen}
        module={editingModule}
        onSave={saveCustomModule}
        onClose={() => setBuilderOpen(false)}
      />

      <div
        className="maintenance-report-tab-overlay maintenance-module-structure-overlay leave-draft-overlay"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="maintenance-report-tab-dialog maintenance-module-structure-dialog leave-draft-dialog panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-module-structure-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="maintenance-report-tab-dialog-header">
            <h2 id="maintenance-module-structure-title">Moduulirakenne</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Sulje
            </button>
          </header>

          <div className="maintenance-report-tab-dialog-body">
            <p className="muted">
              Piilota tai järjestä osioita. Raportointi pysyy ensimmäisenä, huomiot ja huoltotiedot lopussa.
              Laitteen lauhdutin- ja höyrystintiedot täytetään moduulien omissa osioissa.
            </p>

            <section className="maintenance-module-structure-section">
              <div className="custom-module-builder-launch">
                <h3>Omat moduulit</h3>
                <button type="button" className="btn btn-primary btn-sm" onClick={openCreateModule}>
                  + Luo moduuli
                </button>
              </div>
              {draftCustomModules.length === 0 ? (
                <p className="muted">Valinnainen: luo omia kenttäosioita (teksti, valinta, valintaruutu).</p>
              ) : (
                <ul className="maintenance-module-structure-list">
                  {draftCustomModules.map((module) => (
                    <li key={module.id} className="maintenance-module-structure-item">
                      <span className="maintenance-module-structure-label">
                        {module.title}
                        <span className="muted"> — {module.fields.length} kenttää</span>
                      </span>
                      <div className="maintenance-module-structure-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditModule(module.id)}>
                          Muokkaa
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeCustomModule(module.id)}>
                          Poista
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="maintenance-module-structure-section">
              <h3>Näkyvät osiot</h3>
              <ul className="maintenance-module-structure-list">
                <li className="maintenance-module-structure-item is-pinned">
                  <span className="maintenance-module-structure-label">Raportointi</span>
                  <span className="muted">Kiinnitetty</span>
                </li>
                {middleTabs.map((tab, index) => (
                  <li key={tab.id} className="maintenance-module-structure-item">
                    <span className="maintenance-module-structure-label">
                      {tab.label}
                      {isCustomModuleTabId(tab.id) ? <span className="muted"> — oma</span> : null}
                    </span>
                    <div className="maintenance-module-structure-actions">
                      {isCustomModuleTabId(tab.id) ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const moduleId = parseCustomModuleTabId(tab.id);
                            if (moduleId) openEditModule(moduleId);
                          }}
                        >
                          Muokkaa
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={index === 0}
                        onClick={() => moveTab(tab.id, 'up')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={index === middleTabs.length - 1}
                        onClick={() => moveTab(tab.id, 'down')}
                      >
                        ↓
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => hideTab(tab)}>
                        Piilota
                      </button>
                    </div>
                  </li>
                ))}
                {PINNED_LAST_IN_DIALOG.map((tabId) => {
                  const tab = draftActiveTabs.find((entry) => entry.id === tabId);
                  if (!tab) return null;
                  return (
                    <li key={tab.id} className="maintenance-module-structure-item is-pinned">
                      <span className="maintenance-module-structure-label">{tab.label}</span>
                      <span className="muted">Kiinnitetty loppuun</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {hiddenTabs.length > 0 ? (
              <section className="maintenance-module-structure-section">
                <h3>Piilotetut osiot</h3>
                <ul className="maintenance-module-structure-list">
                  {hiddenTabs.map((tab) => (
                    <li key={tab.id} className="maintenance-module-structure-item">
                      <span className="maintenance-module-structure-label">{tab.label}</span>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => showTab(tab)}>
                        Lisää
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {optionalModules.length > 0 ? (
              <section className="maintenance-module-structure-section">
                <h3>Valinnaiset mittaukset</h3>
                <div className="maintenance-module-structure-optional">
                  {optionalModules.map((option) => (
                    <label key={option.key} className="maintenance-module-structure-check">
                      <input
                        type="checkbox"
                        checked={Boolean(draftModules[option.key])}
                        onChange={(event) => toggleOptionalModule(option.key, event.target.checked)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <footer className="maintenance-report-tab-dialog-footer leave-draft-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Peruuta
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              Tallenna
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}
