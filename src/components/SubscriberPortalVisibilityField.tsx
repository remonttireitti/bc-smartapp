import {
  SUBSCRIBER_PORTAL_VISIBILITY_OPTIONS,
  type SubscriberPortalReportKind,
  type SubscriberPortalVisibility,
} from '../lib/subscriberPortalVisibility';

type Props = {
  value: SubscriberPortalVisibility;
  onChange: (value: SubscriberPortalVisibility) => void;
  disabled?: boolean;
  reportKind: SubscriberPortalReportKind;
  busy?: boolean;
};

export default function SubscriberPortalVisibilityField({
  value,
  onChange,
  disabled,
  reportKind,
  busy,
}: Props) {
  const selected = SUBSCRIBER_PORTAL_VISIBILITY_OPTIONS.find((option) => option.value === value);

  return (
    <div className="subscriber-portal-visibility-field">
      <label>
        Näkyvyys tilaajalle
        <select
          value={value}
          disabled={disabled || busy}
          onChange={(event) => onChange(event.target.value as SubscriberPortalVisibility)}
        >
          {SUBSCRIBER_PORTAL_VISIBILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted subscriber-portal-visibility-hint">
        {selected?.hint}
        {reportKind === 'quote' && value === 'as_in_progress' && (
          <> Tarjouksilla “työn alla” tarkoittaa luonnosnäkyvyyttä.</>
        )}
        {reportKind === 'maintenance' && value === 'as_in_progress' && (
          <> Huoltoraporteilla “työn alla” tarkoittaa luonnosnäkyvyyttä.</>
        )}
      </p>
    </div>
  );
}
