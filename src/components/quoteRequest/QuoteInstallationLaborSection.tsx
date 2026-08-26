import {
  installationLaborPurchaseNet,
  installationVehicleBlocks,
  installationVehiclePurchaseNet,
} from '../../lib/quoteRequest/installationSupplies';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

export default function QuoteInstallationLaborSection({ form, canEdit, onChange }: Props) {
  const laborPurchase = installationLaborPurchaseNet(form);
  const vehicleBlocks = installationVehicleBlocks(
    form.installationLaborHours,
    form.installationVehicleHoursPerBlock,
  );
  const vehiclePurchase = installationVehiclePurchaseNet(form);

  return (
    <div className="quote-installation-labor panel-inset">
      <h3>Sisäinen työn hankinta</h3>
      <p className="muted">
        Asentajan työn ja huoltoauton hankintakustannukset vähennetään tarvikkeiden kokonaiskatteesta.
      </p>
      <div className="quote-installation-labor-grid">
        <label>
          Työtunnit
          <input
            type="number"
            min="0"
            step="0.5"
            value={form.installationLaborHours}
            onChange={(e) => onChange({ installationLaborHours: Number(e.target.value) })}
            disabled={!canEdit}
          />
        </label>
        <label>
          Työn hankintahinta (€/h, alv 0)
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
      </div>
      <div className="quote-installation-labor-grid">
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

      {(form.installationLaborHours > 0 || laborPurchase > 0 || vehiclePurchase > 0) && (
        <div className="quote-summary-box" style={{ marginTop: '0.5rem' }}>
          {laborPurchase > 0 ? (
            <div>
              Asentajan työ: {form.installationLaborHours} h ×{' '}
              {formatEuro(form.installationLaborPurchaseRate)} = {formatEuro(laborPurchase)}
            </div>
          ) : null}
          {vehiclePurchase > 0 ? (
            <div>
              Huoltoautokorvaus: {vehicleBlocks} × {formatEuro(form.installationVehicleAllowance)}{' '}
              ({form.installationVehicleHoursPerBlock} h / jakso) = {formatEuro(vehiclePurchase)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
