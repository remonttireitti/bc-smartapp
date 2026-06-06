import type { CompanyLicenseSnapshot } from '../lib/companyLicense';
import { trialDaysRemaining } from '../lib/companyLicense';

type Props = {
  license: CompanyLicenseSnapshot;
};

function formatTrialEnd(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('fi-FI');
}

export default function DashboardTrialBanner({ license }: Props) {
  const daysLeft = trialDaysRemaining(license);
  const trialEnd = formatTrialEnd(license.trial_ends_at);

  if (license.effective_status === 'pending_trial') {
    return (
      <section className="dashboard-trial-banner" role="status">
        <div className="dashboard-trial-banner__content">
          <strong>Ilmainen kokeilujakso</strong>
          <p className="muted">
            {license.trial_days} päivän kokeilu · kaikki moduulit käytössä · ei luottokorttia eikä sitoumusta.
            Kokeile rauhassa — voit aloittaa luonnoksella ilman ajoitusta.
          </p>
        </div>
        <a
          href="/BC-Smartapp-kayttoohje.pdf"
          download="BC-Smartapp-kayttoohje.pdf"
          className="btn btn-secondary btn-sm"
          target="_blank"
          rel="noopener noreferrer"
        >
          Käyttöohje (PDF)
        </a>
      </section>
    );
  }

  if (license.effective_status !== 'trial') return null;

  return (
    <section className="dashboard-trial-banner" role="status">
      <div className="dashboard-trial-banner__content">
        <strong>
          Kokeilujakso käynnissä
          {daysLeft != null ? ` · ${daysLeft} päivää jäljellä` : ''}
        </strong>
        <p className="muted">
          Kaikki moduulit ovat käytössä{trialEnd ? ` ${trialEnd} asti` : ''}. Ei sitoumusta — tutustu rauhassa ja
          aloita esimerkiksi työraportilla tai asiakkaalla.
        </p>
      </div>
      <a
        href="/BC-Smartapp-kayttoohje.pdf"
        download="BC-Smartapp-kayttoohje.pdf"
        className="btn btn-secondary btn-sm"
        target="_blank"
        rel="noopener noreferrer"
      >
        Käyttöohje (PDF)
      </a>
    </section>
  );
}
