import type { ReactNode } from 'react';

export function HuoltoPrintForm({ children }: { children: ReactNode }) {
  return <div className="huolto-print-form">{children}</div>;
}

export function PrintColumnRow({ children }: { children: ReactNode }) {
  return <div className="huolto-print-column-row">{children}</div>;
}

export function PrintInnerBox({
  title,
  accent,
  children,
  className = '',
}: {
  title: string;
  accent: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`huolto-print-inner-box${className ? ` ${className}` : ''}`}
      style={{ '--print-box-accent': accent } as React.CSSProperties}
    >
      <div className="huolto-print-inner-box-title">{title}</div>
      <div className="huolto-print-inner-box-body">{children}</div>
    </div>
  );
}

/** Sisäkkäinen laatikko (kompressori, puhallin). */
export function PrintSubBox({
  title,
  accent = '#616161',
  children,
  className = '',
}: {
  title: string;
  accent?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`huolto-print-sub-box${className ? ` ${className}` : ''}`}
      style={{ '--print-box-accent': accent } as React.CSSProperties}
    >
      <div className="huolto-print-sub-box-title">{title}</div>
      <div className="huolto-print-sub-box-body">{children}</div>
    </div>
  );
}

export function PrintCalcLine({ children }: { children: ReactNode }) {
  return <div className="huolto-print-calc-line">{children}</div>;
}

export function PrintStatusBanner({ children }: { children: ReactNode }) {
  return <div className="huolto-print-status-banner">{children}</div>;
}

export function PrintWarningBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="huolto-print-warning-banner">
      <div className="huolto-print-warning-banner-title">{title}</div>
      <div className="huolto-print-warning-banner-body">{children}</div>
    </div>
  );
}

export function PrintInspectionBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="huolto-print-inspection-block">
      <span className="huolto-print-inspection-label">{label}</span>
      {children}
    </div>
  );
}

export function PrintFieldGrid({
  columns = 3,
  children,
  className = '',
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`huolto-print-field-grid huolto-print-field-grid--${columns}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}

export function PrintFieldRow({
  label,
  children,
  error,
  className = '',
}: {
  label: string;
  children: ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <label className={`huolto-print-field-row${className ? ` ${className}` : ''}`}>
      <span className="huolto-print-field-row-label">{label}</span>
      <span className="huolto-print-field-row-value">{children}</span>
      {error ? <span className="field-error-text">{error}</span> : null}
    </label>
  );
}

export function PrintGridField({
  label,
  children,
  className = '',
  error,
  required,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className={`huolto-print-grid-field${className ? ` ${className}` : ''}`}>
      <span className="huolto-print-grid-label">
        {label}
        {required ? <span className="required-mark"> *</span> : null}
      </span>
      <span className="huolto-print-grid-value">{children}</span>
      {error ? <span className="field-error-text">{error}</span> : null}
    </label>
  );
}

export function PrintReadonlyRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="huolto-print-readonly-row">
      <span>{label}: </span>
      <strong>{value}</strong>
    </div>
  );
}

export function PrintCheckField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="huolto-print-check-field">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function PrintTextInput({
  value,
  onChange,
  type = 'text',
  disabled,
  placeholder,
  readOnly,
  className = '',
}: {
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      className={className || undefined}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
    />
  );
}

export function PrintSelectInput({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  );
}
