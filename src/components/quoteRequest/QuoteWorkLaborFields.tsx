import type { QuoteRequestData, QuoteWorkItem } from '../../lib/quoteRequest/types';
import {
  installationLaborPurchaseNet,
  installationVehicleBlocks,
  installationVehiclePurchaseNet,
} from '../../lib/quoteRequest/installationSupplies';

type Props = {
  form: QuoteRequestData;
  workItem: QuoteWorkItem;
  canEdit: boolean;
  showVehicleFields?: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  onWorkChange: (patch: Partial<QuoteWorkItem>) => void;
};

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

export default function QuoteWorkLaborFields({
  form,
  workItem,
  canEdit,
  showVehicleFields = false,
  onChange,
  onWorkChange,
}: Props) {
  const laborPurchase = installationLaborPurchaseNet(form);
  const vehicleBlocks = installationVehicleBlocks(
    form.installationLaborHours,
    form.installationVehicleHoursPerBlock,
  );
  const vehiclePurchase = installationVehiclePurchaseNet(form);

  return (
    <>
      <div className="quote-installation-labor-grid">
        <label>
          Tunnit
          <input
            type="number"
            step="0.25"
            min="0"
            value={workItem.hours}
            onChange={(e) => onWorkChange({ hours: Number(e.target.value) })}
            disabled={!canEdit}
          />
        </label>
        <label>
          Hankintahinta (€/h, alv 0)
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.installationLaborPurchaseRate}
            onChange={(e) =>
              onChange({ installationLaborPurchaseRate: Number(e.target.value) || 0 })
            }
            disabled={!canEdit}
          />
        </label>
        <label>
          Myyntihinta (€/h, alv 0)
          <input
            type="number"
            step="0.01"
            min="0"
            value={workItem.pricePerHour}
            onChange={(e) => onWorkChange({ pricePerHour: Number(e.target.value) })}
            disabled={!canEdit}
          />
        </label>
      </div>

      {showVehicleFields ? (
        <div className="quote-installation-labor-grid two-col">
          <label>
            Huoltoautokorvaus (€, alv 0)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.installationVehicleAllowance}
              onChange={(e) => onChange({ installationVehicleAllowance: Number(e.target.value) })}
              disabled={!canEdit}
            />
          </label>
          <label>
            Tunnit per korvausjakso
            <input
              type="number"
              min="1"
              step="1"
              value={form.installationVehicleHoursPerBlock}
              onChange={(e) =>
                onChange({ installationVehicleHoursPerBlock: Number(e.target.value) || 8 })
              }
              disabled={!canEdit}
            />
          </label>
        </div>
      ) : null}

      {(laborPurchase > 0 || vehiclePurchase > 0) && showVehicleFields ? (
        <div className="quote-summary-box" style={{ marginTop: '0.5rem' }}>
          {laborPurchase > 0 ? (
            <div>
              Työn hankinta: {form.installationLaborHours} h ×{' '}
              {formatEuro(form.installationLaborPurchaseRate)} = {formatEuro(laborPurchase)}
            </div>
          ) : null}
          {vehiclePurchase > 0 ? (
            <div>
              Huoltoautokorvaus: {vehicleBlocks} × {formatEuro(form.installationVehicleAllowance)} ={' '}
              {formatEuro(vehiclePurchase)}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function syncInstallationLaborHours(workItems: QuoteWorkItem[]): number {
  return workItems.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
}
