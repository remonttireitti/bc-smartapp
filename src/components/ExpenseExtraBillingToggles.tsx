import ToggleSwitch from './ToggleSwitch';

type Props = {
  extraBillable: boolean;
  extraBillingAllowed: boolean;
  disabled?: boolean;
  onExtraBillableChange: (value: boolean) => void;
  onExtraBillingAllowedChange: (value: boolean) => void;
};

export default function ExpenseExtraBillingToggles({
  extraBillable,
  extraBillingAllowed,
  disabled = false,
  onExtraBillableChange,
  onExtraBillingAllowedChange,
}: Props) {
  return (
    <div className="expense-extra-billing-toggles">
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={extraBillable}
          disabled={disabled}
          label="Lisälaskutettavissa"
          onChange={(checked) => {
            onExtraBillableChange(checked);
            if (!checked) onExtraBillingAllowedChange(false);
          }}
        />
        <p className="muted expense-extra-billing-toggle-hint">
          Tarvike voi olla lisälaskutettavissa tarjouksen päälle.
        </p>
      </div>
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={extraBillingAllowed}
          disabled={disabled || !extraBillable}
          label="Lupa lisälaskutukseen"
          onChange={onExtraBillingAllowedChange}
        />
        <p className="muted expense-extra-billing-toggle-hint">
          {extraBillable
            ? extraBillingAllowed
              ? 'Laskutetaan asiakkaalta hankinta + kate.'
              : 'Ilman lupaa hankinta vähennetään katteesta.'
            : 'Ota ensin käyttöön lisälaskutettavissa.'}
        </p>
      </div>
    </div>
  );
}
