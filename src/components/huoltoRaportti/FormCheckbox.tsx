import ToggleSwitch from '../ToggleSwitch';

interface FormCheckboxProps {
  label: string;
  checked: boolean | undefined;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function FormCheckbox({
  label,
  checked,
  onChange,
  className = '',
  disabled = false,
  id,
}: FormCheckboxProps) {
  return (
    <ToggleSwitch
      id={id}
      label={label}
      checked={checked === true}
      disabled={disabled}
      onChange={onChange}
      className={`form-toggle ${className}`.trim()}
    />
  );
}
