import { useCallback, useEffect, useState } from 'react';
import type { RefrigerantCircuitComponent, RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import { piiriOhjaustapaOptions } from '../../lib/huoltoRaportti/constants';
import {
  circuitComponentsInspectionStatuses,
  createEmptyRefrigerantCircuitComponent,
  ensureRefrigerantCircuitComponents,
  REFRIGERANT_CIRCUIT_COMPONENT_PRESETS,
  refrigerantCircuitComponentLabel,
  refrigerantCircuitComponentStatus,
  refrigerantCircuitComponentSubtitle,
  updateRefrigerantCircuitComponents,
  type RefrigerantCircuitComponentType,
} from '../../lib/huoltoRaportti/refrigerantCircuitComponents';
import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { RefrigerantCircuitComponentDialog } from './RefrigerantCircuitComponentDialog';

function aggregateComponentStatuses(statuses: HuoltoInspectionStatus[]): HuoltoInspectionStatus {
  if (statuses.length === 0) return null;
  if (statuses.some((status) => status === null)) return null;
  if (statuses.some((status) => status === 'faulty')) return 'faulty';
  return 'ok';
}

interface Props {
  circuitNumber: number;
  data: RefrigerantCircuitData;
  onChange: (data: RefrigerantCircuitData) => void;
  laiteTyyppi?: string;
  isMLP?: boolean;
  firstCircuitData?: RefrigerantCircuitData;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

function CircuitComponentsForm({
  circuitNumber,
  data,
  onChange,
  isMLP = false,
  firstCircuitData,
}: Omit<Props, 'documentUnitKey' | 'hidePartRow'>) {
  const [openComponentId, setOpenComponentId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const komponentit = ensureRefrigerantCircuitComponents(data);
  const hasCrossCircuitSync = circuitNumber > 1 && !!firstCircuitData;

  const openComponent = komponentit.find((component) => component.id === openComponentId) ?? null;

  const updateComponents = (nextComponents: RefrigerantCircuitComponent[]) => {
    onChange(updateRefrigerantCircuitComponents(data, nextComponents));
  };

  const addComponent = (type: RefrigerantCircuitComponentType) => {
    if (type === 'custom' && !customName.trim()) return;
    const next = [
      ...komponentit,
      createEmptyRefrigerantCircuitComponent(type, customName.trim()),
    ];
    setCustomName('');
    updateComponents(next);
  };

  const saveComponent = (component: RefrigerantCircuitComponent) => {
    updateComponents(komponentit.map((row) => (row.id === component.id ? component : row)));
  };

  const removeComponent = (componentId: string) => {
    updateComponents(komponentit.filter((row) => row.id !== componentId));
  };

  const setCrossCircuitFlag = (
    key:
      | 'paisuntaventtiiliSamaKuinPiiri1'
      | 'magneettiventtiiliSamaKuinPiiri1'
      | 'kuivainSamaKuinPiiri1',
    value: boolean,
  ) => {
    onChange({ ...data, [key]: value });
  };

  const availablePresets = REFRIGERANT_CIRCUIT_COMPONENT_PRESETS.filter(
    (preset) => !komponentit.some((component) => component.type === preset.type),
  );

  return (
    <div className="huolto-circuit-components-module">
      {isMLP ? (
        <div className="line-form-grid">
          <label>
            Piirin ohjaustapa
            <select
              value={data.ohjaustapa}
              onChange={(e) => onChange({ ...data, ohjaustapa: e.target.value })}
            >
              {piiriOhjaustapaOptions.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          {data.ohjaustapa === 'muu' ? (
            <FormInput
              label="Muu ohjaustapa"
              value={data.ohjaustapaMuu ?? ''}
              onChange={(value) => onChange({ ...data, ohjaustapaMuu: value })}
            />
          ) : null}
        </div>
      ) : null}

      {hasCrossCircuitSync ? (
        <div className="huolto-part-inspection-sync">
          <FormCheckbox
            label={`Piiri ${circuitNumber}: sama paisuntaventtiili kuin piirissä 1`}
            checked={!!data.paisuntaventtiiliSamaKuinPiiri1}
            onChange={(value) => setCrossCircuitFlag('paisuntaventtiiliSamaKuinPiiri1', value)}
          />
          <FormCheckbox
            label={`Piiri ${circuitNumber}: sama magneettiventtiili kuin piirissä 1`}
            checked={!!data.magneettiventtiiliSamaKuinPiiri1}
            onChange={(value) => setCrossCircuitFlag('magneettiventtiiliSamaKuinPiiri1', value)}
          />
          <FormCheckbox
            label={`Piiri ${circuitNumber}: sama kuivain kuin piirissä 1`}
            checked={!!data.kuivainSamaKuinPiiri1}
            onChange={(value) => setCrossCircuitFlag('kuivainSamaKuinPiiri1', value)}
          />
        </div>
      ) : null}

      <div className="huolto-circuit-component-actions">
        {availablePresets.map((preset) => (
          <button
            key={preset.type}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => addComponent(preset.type)}
          >
            + {preset.label}
          </button>
        ))}
        <div className="huolto-circuit-custom-component">
          <FormInput
            label="Muu komponentti"
            value={customName}
            onChange={setCustomName}
            placeholder="Komponentin nimi"
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!customName.trim()}
            onClick={() => addComponent('custom')}
          >
            + Lisää
          </button>
        </div>
      </div>

      <div className="huolto-part-inspection-list huolto-part-inspection-list--print-inline">
        {komponentit.map((component) => (
          <div key={component.id} className="huolto-circuit-component-row">
            <HuoltoPartInspectionRow
              title={refrigerantCircuitComponentLabel(component)}
              subtitle={refrigerantCircuitComponentSubtitle(component) || undefined}
              status={refrigerantCircuitComponentStatus(component)}
              onInspect={() => setOpenComponentId(component.id)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => removeComponent(component.id)}
            >
              Poista
            </button>
          </div>
        ))}
      </div>

      <RefrigerantCircuitComponentDialog
        open={openComponentId !== null}
        component={openComponent}
        circuitNumber={circuitNumber}
        onClose={() => setOpenComponentId(null)}
        onSave={saveComponent}
      />
    </div>
  );
}

export function RefrigerantCircuitComponentsModule({
  circuitNumber,
  data,
  onChange,
  laiteTyyppi = '',
  isMLP = false,
  firstCircuitData,
  documentUnitKey,
  hidePartRow = false,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const title = `Ohjaus ja komponentit — piiri ${circuitNumber}`;

  useEffect(() => {
    if (dialogOpen) setDraft(data);
  }, [dialogOpen, data]);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    onChange(draft);
    setDialogOpen(false);
  }, [draft, onChange]);

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  if (!hidePartRow) {
    return (
      <div className="huolto-circuit-part-module">
        <h3 className="huolto-circuit-part-module-title">Ohjaus ja komponentit</h3>
        <CircuitComponentsForm
          circuitNumber={circuitNumber}
          data={data}
          onChange={onChange}
          laiteTyyppi={laiteTyyppi}
          isMLP={isMLP}
          firstCircuitData={firstCircuitData}
        />
      </div>
    );
  }

  return (
    <>
      <HuoltoInspectionDialogShell
        open={dialogOpen}
        title={title}
        titleId={`circuit-components-dialog-${circuitNumber}`}
        onClose={closeDialog}
      >
        <CircuitComponentsForm
          circuitNumber={circuitNumber}
          data={draft}
          onChange={setDraft}
          laiteTyyppi={laiteTyyppi}
          isMLP={isMLP}
          firstCircuitData={firstCircuitData}
        />
      </HuoltoInspectionDialogShell>
    </>
  );
}

export function circuitComponentsSummarySubtitle(data: RefrigerantCircuitData): string {
  const labels = ensureRefrigerantCircuitComponents(data)
    .map((component) => refrigerantCircuitComponentLabel(component))
    .filter(Boolean);
  return labels.join(', ');
}

export function circuitComponentsSummaryStatus(data: RefrigerantCircuitData): HuoltoInspectionStatus {
  return aggregateComponentStatuses(circuitComponentsInspectionStatuses(data));
}
