import {
  applyDeviceBrandDefaults,
  calculateDevicePurchaseNet,
  calculateDeviceSellNet,
  computeDevicePowerFitPercent,
  devicesForQuoteType,
  findDeviceById,
  formatDeviceLabel,
  powerFitLabel,
  type DeviceOptionKey,
} from '../../lib/quoteRequest/deviceCatalog';
import { computeAllOptionTotals } from '../../lib/quoteRequest/calculations';
import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import type { HeatPumpDevice } from '../../data/pumpDeviceCatalog';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  heatingNeedKw: number | null;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

function optionField(key: DeviceOptionKey, side: 'Good' | 'Bad'): keyof QuoteRequestData {
  const map: Record<DeviceOptionKey, Record<'Good' | 'Bad', keyof QuoteRequestData>> = {
    A: { Good: 'optionAGood', Bad: 'optionABad' },
    B: { Good: 'optionBGood', Bad: 'optionBBad' },
    C: { Good: 'optionCGood', Bad: 'optionCBad' },
  };
  return map[key][side];
}

function DeviceOptionCard({
  label,
  optionKey,
  deviceIdField,
  discountField,
  marginField,
  form,
  canEdit,
  heatingNeedKw,
  feeMap,
  onChange,
  excludeIds,
}: {
  label: string;
  optionKey: DeviceOptionKey;
  deviceIdField: 'selectedDeviceId' | 'altDevice1Id' | 'altDevice2Id';
  discountField: 'deviceDiscountPercent' | 'altDevice1DiscountPercent' | 'altDevice2DiscountPercent';
  marginField: 'deviceMarginPercent' | 'altDevice1MarginPercent' | 'altDevice2MarginPercent';
  form: QuoteRequestData;
  canEdit: boolean;
  heatingNeedKw: number | null;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  excludeIds: string[];
}) {
  const devices = devicesForQuoteType(form.type, form, heatingNeedKw).filter(
    (device: HeatPumpDevice) => !excludeIds.includes(device.id),
  );
  const selectedId = form[deviceIdField];
  const device = findDeviceById(selectedId);
  const purchase = calculateDevicePurchaseNet(form, device, feeMap);
  const sell = calculateDeviceSellNet(form, device, feeMap);
  const powerPct = computeDevicePowerFitPercent(heatingNeedKw, device);

  return (
    <div className="quote-device-card panel-inset">
      <div className="quote-line-head">
        <strong>{label}</strong>
        {device && (
          <span className="muted">
            {purchase.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })} →{' '}
            {sell.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
          </span>
        )}
      </div>
      {powerPct != null && (
        <p className={`quote-power-fit quote-power-fit-${powerPct >= 80 ? 'ok' : powerPct >= 65 ? 'warn' : 'bad'}`}>
          Mitoitus: {powerPct}% tarpeesta — {powerFitLabel(powerPct)}
        </p>
      )}
      <label>
        Laite
        {!device && deviceIdField === 'selectedDeviceId' && form.deviceModel.trim() && (
          <p className="muted quote-legacy-device-note">
            Tuodusta järjestelmästä: <strong>{form.deviceModel.trim()}</strong>. Valitse vastaava laite listasta.
          </p>
        )}
        <select
          value={selectedId}
          disabled={!canEdit}
          onChange={(e) => {
            const nextId = e.target.value;
            const nextDevice = findDeviceById(nextId);
            let patch: Partial<QuoteRequestData> = { [deviceIdField]: nextId };
            if (optionKey === 'A' && nextDevice) {
              patch = { ...applyDeviceBrandDefaults(form, nextDevice), ...patch };
            }
            onChange(patch);
          }}
        >
          <option value="">— Valitse laite —</option>
          {devices.map((entry: HeatPumpDevice) => (
            <option key={entry.id} value={entry.id}>
              {formatDeviceLabel(entry)} • list {entry.listPrice.toLocaleString('fi-FI')} €
            </option>
          ))}
        </select>
      </label>
      {device && (
        <div className="line-form-grid">
          <label>
            Alennus listasta (%)
            <input
              type="number"
              min="0"
              step="0.1"
              value={form[discountField]}
              disabled={!canEdit}
              onChange={(e) => onChange({ [discountField]: Number(e.target.value) })}
            />
          </label>
          <label>
            Kate (%)
            <input
              type="number"
              min="0"
              step="0.1"
              value={form[marginField]}
              disabled={!canEdit}
              onChange={(e) => onChange({ [marginField]: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      {device && (
        <>
          <label>
            Hyvää (tuloste)
            <textarea
              rows={2}
              value={String(form[optionField(optionKey, 'Good')] ?? '')}
              disabled={!canEdit}
              onChange={(e) => onChange({ [optionField(optionKey, 'Good')]: e.target.value })}
            />
          </label>
          <label>
            Huomioitavaa (tuloste)
            <textarea
              rows={2}
              value={String(form[optionField(optionKey, 'Bad')] ?? '')}
              disabled={!canEdit}
              onChange={(e) => onChange({ [optionField(optionKey, 'Bad')]: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}

export default function QuotePumpDevicesSection({
  form,
  canEdit,
  heatingNeedKw,
  feeMap,
  onChange,
}: Props) {
  const excludeForB = [form.selectedDeviceId, form.altDevice2Id].filter(Boolean);
  const excludeForC = [form.selectedDeviceId, form.altDevice1Id].filter(Boolean);
  const optionTotals = computeAllOptionTotals(form, feeMap);

  return (
    <section className="form-section">
      <h2>Lämpöpumppu (A / B / C)</h2>
      <p className="muted">
        Valitse päälaite ja halutessasi vaihtoehtoiset mallit. Hinnat: listahinta, alennus, toimitus (rekisteristä) ja
        kate.
      </p>
      <DeviceOptionCard
        label="Vaihtoehto A (päälaite)"
        optionKey="A"
        deviceIdField="selectedDeviceId"
        discountField="deviceDiscountPercent"
        marginField="deviceMarginPercent"
        form={form}
        canEdit={canEdit}
        heatingNeedKw={heatingNeedKw}
        feeMap={feeMap}
        onChange={onChange}
        excludeIds={[form.altDevice1Id, form.altDevice2Id].filter(Boolean)}
      />
      <DeviceOptionCard
        label="Vaihtoehto B"
        optionKey="B"
        deviceIdField="altDevice1Id"
        discountField="altDevice1DiscountPercent"
        marginField="altDevice1MarginPercent"
        form={form}
        canEdit={canEdit}
        heatingNeedKw={heatingNeedKw}
        feeMap={feeMap}
        onChange={onChange}
        excludeIds={excludeForB}
      />
      <DeviceOptionCard
        label="Vaihtoehto C"
        optionKey="C"
        deviceIdField="altDevice2Id"
        discountField="altDevice2DiscountPercent"
        marginField="altDevice2MarginPercent"
        form={form}
        canEdit={canEdit}
        heatingNeedKw={heatingNeedKw}
        feeMap={feeMap}
        onChange={onChange}
        excludeIds={excludeForC}
      />
      {optionTotals.length > 1 && (
        <div className="quote-option-compare">
          <h3>Vaihtoehtojen kokonaishinnat (sis. työt + tarvikkeet + laite)</h3>
          <div className="quote-option-compare-grid">
            {optionTotals.map(({ key, device, totals }) => (
              <div key={key} className="quote-option-compare-card">
                <strong>Vaihtoehto {key}</strong>
                <div className="muted">{device.name}</div>
                <div className="quote-option-price">
                  {totals!.grossTotal.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
                </div>
                <span className="muted">sis. ALV {form.vatRate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {form.selectedDeviceId && (
        <div className="line-form-grid">
          <label>
            Myyntihinta yliajo (€, alv 0)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.deviceSaleOverrideNet ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                onChange({
                  deviceSaleOverrideNet: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}
