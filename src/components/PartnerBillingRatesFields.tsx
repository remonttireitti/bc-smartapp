import type { PartnerBillingRates } from '../lib/management';

type Props = {
  rates: PartnerBillingRates;
  onChange: (rates: PartnerBillingRates) => void;
  disabled?: boolean;
};

export default function PartnerBillingRatesFields({ rates, onChange, disabled }: Props) {
  function setField(field: keyof PartnerBillingRates, value: string) {
    onChange({
      ...rates,
      [field]: value === '' ? undefined : Number(value),
    });
  }

  return (
    <div className="line-form-grid">
      <label>
        Tuntihinta (€/h)
        <input
          type="number"
          step="0.01"
          min="0"
          disabled={disabled}
          value={rates.hourly_regular ?? ''}
          onChange={(e) => setField('hourly_regular', e.target.value)}
        />
      </label>
      <label>
        Ylitöiden hinta (€/h)
        <input
          type="number"
          step="0.01"
          min="0"
          disabled={disabled}
          value={rates.hourly_overtime ?? ''}
          onChange={(e) => setField('hourly_overtime', e.target.value)}
        />
      </label>
      <label>
        Päivystyksen hinta (€/h)
        <input
          type="number"
          step="0.01"
          min="0"
          disabled={disabled}
          value={rates.hourly_on_call ?? ''}
          onChange={(e) => setField('hourly_on_call', e.target.value)}
        />
      </label>
    </div>
  );
}
