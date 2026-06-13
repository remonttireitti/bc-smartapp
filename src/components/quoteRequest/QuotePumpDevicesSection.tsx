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

type Variant = 'full' | 'selection' | 'pricing';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  heatingNeedKw: number | null;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  variant?: Variant;
  suggestedDeviceId?: string | null;
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
  variant,
  suggestedDeviceId,
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
  variant: Variant;
  suggestedDeviceId?: string | null;
}) {
  const devices = devicesForQuoteType(form.type, form, heatingNeedKw).filter(
    (device: HeatPumpDevice) => !excludeIds.includes(device.id),
  );
  const selectedId = form[deviceIdField];
  const device = findDeviceById(selectedId);
  const purchase = calculateDevicePurchaseNet(form, device, feeMap);
  const sell = calculateDeviceSellNet(form, device, feeMap);
  const powerPct = computeDevicePowerFitPercent(heatingNeedKw, device);
  const isManualPick =
    variant === 'selection' &&
    optionKey === 'A' &&
    selectedId &&
    suggestedDeviceId &&
    selectedId !== suggestedDeviceId;

  const showSelection = variant === 'full' || variant === 'selection';
  const showPricing = variant === 'full' || variant === 'pricing';

  if (variant === 'pricing' && !device) return null;

  return (
    <div className="quote-device-card panel-inset">
      <div className="quote-line-head">
        <strong>{label}</strong>
        {showPricing && device && (
          <span className="muted">
            {purchase.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })} →{' '}
            {sell.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
          </span>
        )}
      </div>
      {showSelection && powerPct != null && (
        <p className={`quote-power-fit quote-power-fit-${powerPct >= 80 ? 'ok' : powerPct >= 65 ? 'warn' : 'bad'}`}>
          Mitoitus: {powerPct}% tarpeesta — {powerFitLabel(powerPct)}
        </p>
      )}
      {showSelection && isManualPick && (
        <p className="quote-power-fit quote-power-fit-warn">
          Valinta poikkeaa ehdotuksesta ({formatDeviceLabel(findDeviceById(suggestedDeviceId)!)}).
        </p>
      )}
      {showSelection && (
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
              if (optionKey === 'A' && nextId !== suggestedDeviceId) {
                patch.iilpDeviceSelectionNote = form.iilpDeviceSelectionNote;
              } else if (optionKey === 'A' && nextId === suggestedDeviceId) {
                patch.iilpDeviceSelectionNote = '';
              }
              onChange(patch);
            }}
          >
            <option value="">— Valitse laite —</option>
            {devices.map((entry: HeatPumpDevice) => (
              <option key={entry.id} value={entry.id}>
                {formatDeviceLabel(entry)}
                {variant === 'full' ? ` • list ${entry.listPrice.toLocaleString('fi-FI')} €` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {showPricing && device && (
        <div className="quote-field-grid quote-field-grid-2">
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
      {showPricing && device && (
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
  variant = 'full',
  suggestedDeviceId,
}: Props) {
  const excludeForB = [form.selectedDeviceId, form.altDevice2Id].filter(Boolean);
  const excludeForC = [form.selectedDeviceId, form.altDevice1Id].filter(Boolean);
  const optionTotals = computeAllOptionTotals(form, feeMap);

  const title =
    variant === 'selection'
      ? 'Laitteet (A / B / C)'
      : variant === 'pricing'
        ? 'Laitteen hinnoittelu'
        : 'Lämpöpumppu (A / B / C)';

  return (
    <section className="form-section">
      <h2>{title}</h2>
      {variant === 'full' && (
        <p className="muted">
          Valitse päälaite ja halutessasi vaihtoehtoiset mallit. Hinnat: listahinta, alennus, toimitus (rekisteristä) ja
          kate.
        </p>
      )}
      {variant === 'pricing' && (
        <p className="muted">Alennus, kate ja laiteoikaisu valituille malleille.</p>
      )}
      {(variant === 'full' || variant === 'selection') && (
        <>
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
            variant={variant}
            suggestedDeviceId={suggestedDeviceId}
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
            variant={variant}
            suggestedDeviceId={suggestedDeviceId}
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
            variant={variant}
            suggestedDeviceId={suggestedDeviceId}
          />
        </>
      )}
      {variant === 'pricing' && (
        <>
          {form.selectedDeviceId && (
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
              excludeIds={[]}
              variant={variant}
            />
          )}
          {form.altDevice1Id && (
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
              excludeIds={[]}
              variant={variant}
            />
          )}
          {form.altDevice2Id && (
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
              excludeIds={[]}
              variant={variant}
            />
          )}
        </>
      )}
      {variant === 'full' && optionTotals.length > 1 && (
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
      {(variant === 'full' || variant === 'pricing') && form.selectedDeviceId && (
        <div className="quote-field-grid quote-field-grid-2">
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
