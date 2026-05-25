interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}

export function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  className = '',
  disabled = false,
}: FormInputProps) {
  return (
    <label className={className}>
      {label}
      {required && <span className="required-mark"> *</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={disabled ? 'input-disabled' : undefined}
      />
    </label>
  );
}
