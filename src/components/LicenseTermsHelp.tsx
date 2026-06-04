import { useEffect, useId, useRef, useState } from 'react';
import {
  LICENSE_TERMS_HELP_CONTENT,
  type LicenseTermsHelpVariant,
} from '../lib/licenseTermsFi';

type Props = {
  variant: LicenseTermsHelpVariant;
  /** Näytetään vain ruudunlukijoille (ikoni riittää näkyväksi). */
  srLabel?: string;
};

export default function LicenseTermsHelp({ variant, srLabel = 'Mitä lisenssi ja tilaus tarkoittavat' }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();
  const content = LICENSE_TERMS_HELP_CONTENT[variant];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="license-terms-help">
      <button
        type="button"
        className="license-terms-help-btn"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={srLabel}
        title="Selite"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="license-terms-help-icon" aria-hidden>
          i
        </span>
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-labelledby={`${popoverId}-title`}
          className="license-terms-help-popover"
        >
          <p id={`${popoverId}-title`} className="license-terms-help-popover-title">
            {content.title}
          </p>
          {content.paragraphs.map((paragraph) => (
            <p key={paragraph} className="license-terms-help-popover-p">
              {paragraph}
            </p>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
            Sulje
          </button>
        </div>
      )}
    </span>
  );
}

/** Otsikko + info-ikoni samassa rivissä. */
export function LicenseSectionHeading({
  title,
  helpVariant,
}: {
  title: string;
  helpVariant: LicenseTermsHelpVariant;
}) {
  return (
    <span className="license-section-heading">
      {title}
      <LicenseTermsHelp variant={helpVariant} />
    </span>
  );
}
