import ToggleSwitch from './ToggleSwitch';

type Props = {
  partnerPurchaseOn: boolean;
  billFromPartnerOn: boolean;
  includedInContractOn?: boolean;
  showIncludedInContract?: boolean;
  disabled?: boolean;
  partnerPurchaseLabel?: string;
  billFromPartnerLabel?: string;
  includedInContractLabel?: string;
  partnerPurchaseHint?: string;
  billFromPartnerHint?: string;
  includedInContractHint?: string;
  onPartnerPurchaseChange: (checked: boolean) => void;
  onBillFromPartnerChange: (checked: boolean) => void;
  onIncludedInContractChange?: (checked: boolean) => void;
};

export default function ExpenseBillingModeToggles({
  partnerPurchaseOn,
  billFromPartnerOn,
  includedInContractOn = false,
  showIncludedInContract = false,
  disabled = false,
  partnerPurchaseLabel = 'Osto kumppanin piikillä',
  billFromPartnerLabel = 'Laskutetaan kumppanilta',
  includedInContractLabel = 'Kuulu urakkaan',
  partnerPurchaseHint = 'Hankintahinta on se mitä on — asiakashinta lasketaan hankinnasta + kate.',
  billFromPartnerHint = 'Harvoin käytössä — kumppanihinta + kate → asiakashinta.',
  includedInContractHint = 'Ei veloiteta kumppanilta eikä asiakkaalta.',
  onPartnerPurchaseChange,
  onBillFromPartnerChange,
  onIncludedInContractChange,
}: Props) {
  return (
    <div className="expense-billing-mode-toggles">
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={partnerPurchaseOn}
          disabled={disabled}
          label={partnerPurchaseLabel}
          onChange={onPartnerPurchaseChange}
        />
        <p className="muted expense-extra-billing-toggle-hint">{partnerPurchaseHint}</p>
      </div>
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={billFromPartnerOn}
          disabled={disabled}
          label={billFromPartnerLabel}
          onChange={onBillFromPartnerChange}
        />
        <p className="muted expense-extra-billing-toggle-hint">{billFromPartnerHint}</p>
      </div>
      {showIncludedInContract && onIncludedInContractChange ? (
        <div className="expense-extra-billing-toggle-row">
          <ToggleSwitch
            checked={includedInContractOn}
            disabled={disabled}
            label={includedInContractLabel}
            onChange={onIncludedInContractChange}
          />
          <p className="muted expense-extra-billing-toggle-hint">{includedInContractHint}</p>
        </div>
      ) : null}
    </div>
  );
}
