import ToggleSwitch from '../ToggleSwitch';

interface FormCheckboxProps {
  label: string;
  checked: boolean | undefined;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function FormCheckbox({
  label,
  checked,
  onChange,
  className = '',
  disabled = false,
}: FormCheckboxProps) {
  return (
    <ToggleSwitch
      label={label}
      checked={checked === true}
      disabled={disabled}
      onChange={onChange}
      className={`form-toggle ${className}`.trim()}
    />
  );
}
