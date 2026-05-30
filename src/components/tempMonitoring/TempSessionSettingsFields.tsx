import {
  TEMP_MONITOR_LABEL_PRESETS,
  type TempSessionSettingsInput,
} from '../../lib/tempMonitoring';

type Props = {
  value: TempSessionSettingsInput;
  onChange: (next: TempSessionSettingsInput) => void;
  idPrefix?: string;
};

export default function TempSessionSettingsFields({ value, onChange, idPrefix = 'temp-settings' }: Props) {
  function setField<K extends keyof TempSessionSettingsInput>(key: K, fieldValue: string) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <>
      <label htmlFor={`${idPrefix}-monitor-label`}>
        Mitä seurataan
        <input
          id={`${idPrefix}-monitor-label`}
          list={`${idPrefix}-monitor-label-presets`}
          value={value.monitor_label}
          onChange={(e) => setField('monitor_label', e.target.value)}
          placeholder="Esim. Kylmiön lämpötila"
        />
      </label>
      <datalist id={`${idPrefix}-monitor-label-presets`}>
        {TEMP_MONITOR_LABEL_PRESETS.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      <div className="temp-settings-range-row">
        <label htmlFor={`${idPrefix}-target-min`}>
          Toivottu alue min (°C)
          <input
            id={`${idPrefix}-target-min`}
            type="number"
            step="0.1"
            value={value.target_temp_min}
            onChange={(e) => setField('target_temp_min', e.target.value)}
            placeholder="Esim. 2"
          />
        </label>
        <label htmlFor={`${idPrefix}-target-max`}>
          Toivottu alue max (°C)
          <input
            id={`${idPrefix}-target-max`}
            type="number"
            step="0.1"
            value={value.target_temp_max}
            onChange={(e) => setField('target_temp_max', e.target.value)}
            placeholder="Esim. 6"
          />
        </label>
      </div>

      <div className="temp-settings-range-row">
        <label htmlFor={`${idPrefix}-deviation-c`}>
          Sallittu poikkeama (°C)
          <input
            id={`${idPrefix}-deviation-c`}
            type="number"
            step="0.1"
            min="0"
            value={value.allowed_deviation_c}
            onChange={(e) => setField('allowed_deviation_c', e.target.value)}
            placeholder="Esim. 0.5"
          />
        </label>
        <label htmlFor={`${idPrefix}-deviation-min`}>
          Sallittu poikkeama-aika (min)
          <input
            id={`${idPrefix}-deviation-min`}
            type="number"
            step="1"
            min="0"
            value={value.allowed_deviation_minutes}
            onChange={(e) => setField('allowed_deviation_minutes', e.target.value)}
            placeholder="Esim. 15"
          />
        </label>
      </div>

      <p className="muted temp-settings-hint">
        Hyväksyttävä alue = toivottu alue ± sallittu poikkeama. Hälytys, jos lämpötila on poikkeamassa
        pidempään kuin sallittu aika.
      </p>
    </>
  );
}
