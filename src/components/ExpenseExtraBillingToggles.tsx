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

type ToggleRowProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onChange: (value: boolean) => void;
};

function ExpenseExtraBillingToggleRow({
  checked,
  disabled = false,
  label,
  hint,
  onChange,
}: ToggleRowProps) {
  const toggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <div className={`expense-extra-billing-toggle-row${disabled ? ' expense-extra-billing-toggle-row-disabled' : ''}`}>
      <ToggleSwitch
        checked={checked}
        disabled={disabled}
        label={label}
        className="expense-extra-billing-toggle-switch"
        onChange={onChange}
      />
      <button
        type="button"
        className="expense-extra-billing-toggle-copy"
        disabled={disabled}
        aria-pressed={checked}
        onClick={toggle}
      >
        <span className="expense-extra-billing-toggle-title">{label}</span>
        <p className="muted expense-extra-billing-toggle-hint">{hint}</p>
      </button>
    </div>
  );
}

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
      <ExpenseExtraBillingToggleRow
        checked={extraBillable}
        disabled={disabled}
        label={billableLabel}
        hint={billableHint}
        onChange={onExtraBillableChange}
      />
      <ExpenseExtraBillingToggleRow
        checked={extraBillingAllowed}
        disabled={disabled || !extraBillable}
        label={permissionLabel}
        hint={permissionHint}
        onChange={onExtraBillingAllowedChange}
      />
    </div>
  );
}
