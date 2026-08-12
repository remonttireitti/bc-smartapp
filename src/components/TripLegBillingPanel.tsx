import {
  expenseBillingModeShortLabel,
  type ExpenseBillingMode,
} from '../lib/workReportExpenseBilling';

type Props = {
  mode: ExpenseBillingMode;
  onChange: (mode: ExpenseBillingMode) => void;
  showPartnerBilling: boolean;
  showCustomerBilling: boolean;
  disabled?: boolean;
};

type BillingOption = {
  mode: ExpenseBillingMode;
  label: string;
};

function billingOptions(showPartner: boolean, showCustomer: boolean): BillingOption[] {
  if (showPartner && showCustomer) {
    return [
      { mode: 'partner_and_customer', label: 'Laskutetaan normaalisti' },
      { mode: 'customer_only', label: 'Vain asiakas laskutetaan' },
      { mode: 'included_in_contract', label: 'Kuulu urakkaan' },
    ];
  }
  return [
    { mode: 'partner_and_customer', label: 'Laskutetaan' },
    { mode: 'included_in_contract', label: expenseBillingModeShortLabel('included_in_contract') },
  ];
}

export function TripLegBillingPanel({
  mode,
  onChange,
  showPartnerBilling,
  showCustomerBilling,
  disabled = false,
}: Props) {
  const options = billingOptions(showPartnerBilling, showCustomerBilling);

  return (
    <div className="trip-leg-billing-panel" role="group" aria-label="Ajomatkan laskutus">
      <span className="trip-leg-billing-label">Laskutus</span>
      <div className="trip-leg-billing-options">
        {options.map((option) => (
          <label
            key={option.mode}
            className={`trip-leg-billing-option${mode === option.mode ? ' is-active' : ''}`}
          >
            <input
              type="radio"
              name="trip-leg-billing"
              checked={mode === option.mode}
              disabled={disabled}
              onChange={() => onChange(option.mode)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
