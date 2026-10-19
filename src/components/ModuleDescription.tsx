import { LICENSE_MODULE_DESCRIPTIONS, LICENSE_MODULE_NOTES, type LicenseModuleKey } from '../lib/companyLicense';
import { remoteMonitoringNote } from '../../supabase/functions/_shared/companySignupCore';

/** Halvin tallennettu laitemaksu (€/kk) snapshotin hinnoista; null jos ei tiedossa. */
export function minDeviceFee(unitPrices: Record<string, number> | null | undefined): number | null {
  const v = Object.values(unitPrices ?? {}).filter((n) => Number.isFinite(n));
  return v.length ? Math.min(...v) : null;
}

/** Moduulin yhden rivin kuvaus + harmaa riippuvuushuomautus (yksi lähde: companySignupCore). */
export function DescriptionWithNote({ description, note }: { description: string; note?: string | null }) {
  return (
    <>
      {description}
      {note ? <span className="module-note"> · {note}</span> : null}
    </>
  );
}

export default function ModuleDescription({
  moduleKey,
  hideNote = false,
  deviceFeeEur = null,
}: {
  moduleKey: LicenseModuleKey;
  hideNote?: boolean;
  /** Etäseuranta: halvin laitemaksu €/kk (tallennettu hinnasto). */
  deviceFeeEur?: number | null;
}) {
  return (
    <DescriptionWithNote
      description={LICENSE_MODULE_DESCRIPTIONS[moduleKey]}
      note={
        hideNote
          ? null
          : moduleKey === 'remote_monitoring' && deviceFeeEur != null
            ? remoteMonitoringNote(deviceFeeEur)
            : LICENSE_MODULE_NOTES[moduleKey]
      }
    />
  );
}
