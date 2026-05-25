import { DEVICE_REGISTRY_BRANDS } from '../../lib/quoteRequest/constants';
import type { CompanySettings } from '../../lib/management';

type Props = {
  settings: CompanySettings;
  onChange: (next: CompanySettings) => void;
};

function brandKey(brand: string): string {
  return brand.trim().toLowerCase();
}

function readFee(
  settings: CompanySettings,
  brand: string,
  category: 'ilmalampopumppu' | 'vesi-ilmalampopumppu',
): number {
  const reg = settings.device_registry;
  const key = brandKey(brand);
  const row = reg?.brand_delivery_fees_by_category?.[key];
  const fromCategory = row?.[category];
  if (typeof fromCategory === 'number' && Number.isFinite(fromCategory)) return fromCategory;
  const legacy = reg?.brand_delivery_fee_per_unit?.[key];
  if (typeof legacy === 'number' && Number.isFinite(legacy)) return legacy;
  return 0;
}

function writeFee(
  settings: CompanySettings,
  brand: string,
  category: 'ilmalampopumppu' | 'vesi-ilmalampopumppu',
  value: number,
): CompanySettings {
  const key = brandKey(brand);
  const reg = settings.device_registry ?? {};
  const byCategory = { ...(reg.brand_delivery_fees_by_category ?? {}) };
  const row = { ...(byCategory[key] ?? {}) };
  row[category] = Math.max(0, Number(value) || 0);
  byCategory[key] = row;
  return {
    ...settings,
    device_registry: {
      ...reg,
      brand_delivery_fees_by_category: byCategory,
    },
  };
}

export default function DeviceRegistrySettingsFields({ settings, onChange }: Props) {
  return (
    <section className="form-section">
      <h2>Lämpöpumppujen laiterekisteri</h2>
      <p className="muted">
        Brändikohtaiset toimitusmaksut (€ / postitusyksikkö, alv 0). Inventor-laitteilla maksu kerrotaan
        laitteen postitusyksiköillä (esim. split = 2 yks.). Tyhjä = 0 €.
      </p>
      <div className="device-registry-fee-table-wrap">
        <table className="data-table device-registry-fee-table">
          <thead>
            <tr>
              <th>Brändi</th>
              <th>IILP (ilmalämpöpumppu)</th>
              <th>VILP (vesi-ilmalämpöpumppu)</th>
            </tr>
          </thead>
          <tbody>
            {DEVICE_REGISTRY_BRANDS.map((brand) => (
              <tr key={brand}>
                <td>{brand}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={readFee(settings, brand, 'ilmalampopumppu')}
                    onChange={(e) =>
                      onChange(writeFee(settings, brand, 'ilmalampopumppu', Number(e.target.value)))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={readFee(settings, brand, 'vesi-ilmalampopumppu')}
                    onChange={(e) =>
                      onChange(writeFee(settings, brand, 'vesi-ilmalampopumppu', Number(e.target.value)))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
