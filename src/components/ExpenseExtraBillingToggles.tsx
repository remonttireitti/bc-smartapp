import ToggleSwitch from './ToggleSwitch';

type Props = {
  extraBillable: boolean;
  extraBillingAllowed: boolean;
  disabled?: boolean;
  billableLabel?: string;
  permissionLabel?: string;
  billableHint?: string;
  permissionHintApproved?: string;
  permissionHintPending?: string;
  permissionHintDisabled?: string;
  onExtraBillableChange: (value: boolean) => void;
  onExtraBillingAllowedChange: (value: boolean) => void;
};

export default function ExpenseExtraBillingToggles({
  extraBillable,
  extraBillingAllowed,
  disabled = false,
  billableLabel = 'Lisälaskutettavissa',
  permissionLabel = 'Lupa lisälaskutukseen',
  billableHint = 'Tarvike voi olla lisälaskutettavissa tarjouksen päälle.',
  permissionHintApproved = 'Laskutetaan asiakkaalta hankinta + kate.',
  permissionHintPending = 'Ilman lupaa hankinta vähennetään katteesta.',
  permissionHintDisabled = 'Ota ensin käyttöön lisälaskutettavissa.',
  onExtraBillableChange,
  onExtraBillingAllowedChange,
}: Props) {
  return (
    <div className="expense-extra-billing-toggles">
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={extraBillable}
          disabled={disabled}
          label={billableLabel}
          onChange={(checked) => {
            onExtraBillableChange(checked);
            if (!checked) onExtraBillingAllowedChange(false);
          }}
        />
        <p className="muted expense-extra-billing-toggle-hint">{billableHint}</p>
      </div>
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={extraBillingAllowed}
          disabled={disabled || !extraBillable}
          label={permissionLabel}
          onChange={onExtraBillingAllowedChange}
        />
        <p className="muted expense-extra-billing-toggle-hint">
          {extraBillable
            ? extraBillingAllowed
              ? permissionHintApproved
              : permissionHintPending
            : permissionHintDisabled}
        </p>
      </div>
    </div>
  );
}
