import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import ToggleSwitch from '../ToggleSwitch';
import { PrintCheckField } from './print/MaintenancePrintLayout';

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
  const printLayout = useHuoltoPrintFormLayout();

  if (printLayout) {
    return (
      <PrintCheckField
        label={label}
        checked={checked === true}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

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
