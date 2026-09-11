import {
  HOUR_BILLING_MODE_LABELS,
  type HourBillingMode,
  type HourBillingSettings,
} from '../lib/workReportHourBilling';

type Props = {
  label: string;
  mode: HourBillingMode;
  disabled?: boolean;
  onChange: (mode: HourBillingMode) => void;
};

export function WorkReportHourBillingModeSelect({ label, mode, disabled, onChange }: Props) {
  return (
    <label>
      {label}
      <select
        value={mode}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as HourBillingMode)}
      >
        {(Object.entries(HOUR_BILLING_MODE_LABELS) as [HourBillingMode, string][]).map(
          ([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

type PanelProps = {
  settings: HourBillingSettings;
  showPartner: boolean;
  showCustomer: boolean;
  disabled?: boolean;
  onChange: (settings: HourBillingSettings) => void;
};

export function WorkReportHourBillingModePanel({
  settings,
  showPartner,
  showCustomer,
  disabled,
  onChange,
}: PanelProps) {
  return (
    <div className="line-form-grid" style={{ marginBottom: '.75rem' }}>
      {showPartner ? (
        <WorkReportHourBillingModeSelect
          label="Kumppanilaskutuksen tunnit"
          mode={settings.partner_mode}
          disabled={disabled}
          onChange={(partner_mode) => onChange({ ...settings, partner_mode })}
        />
      ) : null}
      {showCustomer ? (
        <WorkReportHourBillingModeSelect
          label="Asiakaslaskutuksen tunnit"
          mode={settings.customer_mode}
          disabled={disabled}
          onChange={(customer_mode) => onChange({ ...settings, customer_mode })}
        />
      ) : null}
    </div>
  );
}
