import ToggleSwitch from './ToggleSwitch';

type Props = {
  extraBillable: boolean;
  extraBillingAllowed: boolean;
  disabled?: boolean;
  className?: string;
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
  className = '',
  billableLabel = 'Lisälaskutettavissa',
  permissionLabel = 'Lupa lisälaskutukseen',
  billableHint = 'Tarvike voi olla lisälaskutettavissa tarjouksen päälle.',
  permissionHintApproved = 'Laskutetaan asiakkaalta hankinta + kate.',
  permissionHintPending = 'Ilman lupaa hankinta vähennetään katteesta.',
  permissionHintDisabled = 'Ota ensin käyttöön lisälaskutettavissa.',
  onExtraBillableChange,
  onExtraBillingAllowedChange,
}: Props) {
  const permissionHint = extraBillable
    ? extraBillingAllowed
      ? permissionHintApproved
      : permissionHintPending
    : permissionHintDisabled;

  return (
    <div className={`expense-extra-billing-toggles${className ? ` ${className}` : ''}`}>
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={extraBillable}
          disabled={disabled}
          label={billableLabel}
          className="expense-extra-billing-toggle-switch"
          onChange={onExtraBillableChange}
        />
        <div className="expense-extra-billing-toggle-copy">
          <span className="expense-extra-billing-toggle-title">{billableLabel}</span>
          <p className="muted expense-extra-billing-toggle-hint">{billableHint}</p>
        </div>
      </div>
      <div className="expense-extra-billing-toggle-row">
        <ToggleSwitch
          checked={extraBillingAllowed}
          disabled={disabled || !extraBillable}
          label={permissionLabel}
          className="expense-extra-billing-toggle-switch"
          onChange={onExtraBillingAllowedChange}
        />
        <div className="expense-extra-billing-toggle-copy">
          <span className="expense-extra-billing-toggle-title">{permissionLabel}</span>
          <p className="muted expense-extra-billing-toggle-hint">{permissionHint}</p>
        </div>
      </div>
    </div>
  );
}
