import { useEffect, useState } from 'react';
import ToggleSwitch from '../ToggleSwitch';

/** Onko jokin lämpötila-arvo jo täytetty (vanha / esitäytetty raportti → kytkin alkaa päällä). */
export function hasAnyValue(...values: Array<unknown>): boolean {
  return values.some((v) => v != null && String(v).trim() !== '');
}

/**
 * Lämpötilamittaukset piilossa oletuksena; "Lämpötilat mitattu" -kytkin avaa ne.
 * Alkaa päällä, jos arvoja on jo (arvot eivät koskaan katoa: ne säilyvät tallennetussa datassa).
 */
export function useTempMeasured(hasValues: boolean) {
  const [on, setOn] = useState(hasValues);
  useEffect(() => {
    if (hasValues) setOn(true);
  }, [hasValues]);
  return { on, setOn, show: on };
}

export function TempMeasuredToggle({
  on,
  onChange,
  disabled,
  className = 'huolto-span-all',
  label = 'Lämpötilat mitattu',
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <div className={`huolto-temp-measured-toggle no-print ${className}`.trim()}>
      <ToggleSwitch label={label} checked={on} disabled={disabled} onChange={onChange} />
    </div>
  );
}
