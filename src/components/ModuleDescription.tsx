import { LICENSE_MODULE_DESCRIPTIONS, LICENSE_MODULE_NOTES, type LicenseModuleKey } from '../lib/companyLicense';

/** Moduulin yhden rivin kuvaus + harmaa riippuvuushuomautus (yksi lähde: companySignupCore). */
export function DescriptionWithNote({ description, note }: { description: string; note?: string | null }) {
  return (
    <>
      {description}
      {note ? <span className="module-note"> · {note}</span> : null}
    </>
  );
}

export default function ModuleDescription({ moduleKey, hideNote = false }: { moduleKey: LicenseModuleKey; hideNote?: boolean }) {
  return (
    <DescriptionWithNote
      description={LICENSE_MODULE_DESCRIPTIONS[moduleKey]}
      note={hideNote ? null : LICENSE_MODULE_NOTES[moduleKey]}
    />
  );
}
