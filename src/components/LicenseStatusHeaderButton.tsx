import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from '@supabase/supabase-js';
import { LicenseSectionHeading } from './LicenseTermsHelp';
import LicenseStatusPanel from './LicenseStatusPanel';
import { useCompanyLicense } from '../hooks/useCompanyLicense';
import { useProfile } from '../hooks/useProfile';
import { LICENSE_SECTION_TITLES } from '../lib/licenseTermsFi';
import { trialDaysRemaining } from '../lib/companyLicense';
import { isPortalView } from '../lib/portalPreview';

type Props = {
  session: Session;
  /** sidebar = sivupalkin alaosa (ikoni + teksti, kavennettuna pelkkä ikoni + päivät). */
  variant?: 'topbar' | 'sidebar';
};

export default function LicenseStatusHeaderButton({ session, variant = 'topbar' }: Props) {
  const { profile } = useProfile(session);
  const portalView = isPortalView(profile);
  const isGlobalAdmin = !!profile?.is_global_admin;
  const { license, loading, refresh } = useCompanyLicense(
    profile?.company_id,
    session,
    isGlobalAdmin,
  );
  const [open, setOpen] = useState(false);
  const canManageOrder = profile?.role === 'admin';

  const showButton =
    !portalView && !!profile?.company_id && !loading && !!license && license.enrollment !== 'legacy';

  const daysLeft = trialDaysRemaining(license);
  const isTrial =
    license?.effective_status === 'trial' || license?.effective_status === 'pending_trial';
  const buttonTitle =
    license?.effective_status === 'trial' && daysLeft != null
      ? `Kokeilujakso – ${daysLeft} päivää jäljellä (päättyy ${license.trial_ends_at ? new Date(license.trial_ends_at).toLocaleDateString('fi-FI') : '—'})`
      : license?.effective_status === 'pending_trial'
        ? `Kokeilujakso alkaa ensimmäisestä kirjautumisesta (${license.trial_days} pv)`
        : LICENSE_SECTION_TITLES.companyPanel;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!showButton) return null;

  const badgeText =
    license?.effective_status === 'trial' && daysLeft != null
      ? `${daysLeft} pv`
      : license?.effective_status === 'pending_trial'
        ? 'Kokeilu'
        : null;

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          className={`app-sidebar-link app-sidebar-license${isTrial ? ' is-trial' : ''}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={buttonTitle}
          onClick={() => setOpen(true)}
        >
          <svg className="app-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 10a4 4 0 1 0-3.9 3.1L4 19.2V21h3v-2h2v-2h2l1.1-1.1A4 4 0 0 0 14 10zm1-1.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="app-sidebar-label">
            {badgeText ? `Kokeilujakso` : LICENSE_SECTION_TITLES.companyPanel}
          </span>
          {badgeText ? <span className="app-sidebar-badge">{badgeText}</span> : null}
        </button>
      ) : (
      <button
        type="button"
        className={`topbar-license-btn${isTrial ? ' topbar-license-btn--trial' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={buttonTitle}
        onClick={() => setOpen(true)}
      >
        <span className="topbar-license-btn-icon" aria-hidden>
          🔑
        </span>
        {license?.effective_status === 'trial' && daysLeft != null ? (
          <span className="topbar-license-btn-badge">{daysLeft} pv</span>
        ) : license?.effective_status === 'pending_trial' ? (
          <span className="topbar-license-btn-badge">Kokeilu</span>
        ) : (
          <span className="topbar-license-btn-label">{LICENSE_SECTION_TITLES.companyPanel}</span>
        )}
      </button>
      )}

      {open && createPortal(
        <div
          className="license-status-overlay"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="license-status-dialog panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-status-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="license-status-dialog-head">
              <h2 id="license-status-dialog-title">
                <LicenseSectionHeading title={LICENSE_SECTION_TITLES.companyPanel} helpVariant="company" />
              </h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOpen(false)}
              >
                Sulje
              </button>
            </div>
            <LicenseStatusPanel
              license={license}
              canManageOrder={canManageOrder}
              onRefresh={() => void refresh()}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
