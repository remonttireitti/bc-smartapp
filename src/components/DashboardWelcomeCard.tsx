import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  dismissWelcome,
  isInviteStepComplete,
  isProfileStepComplete,
  isWelcomeDismissed,
  isWorkOrCustomerStepComplete,
  loadOnboardingStats,
  type OnboardingStats,
} from '../lib/dashboardOnboarding';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

type Props = {
  session: Session;
  profile: Profile | null;
  isAdmin: boolean;
};

type Step = {
  id: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
  optional?: boolean;
};

export default function DashboardWelcomeCard({ session, profile, isAdmin }: Props) {
  const userId = session.user.id;
  const companyId = profile?.company_id ?? '';
  const [dismissed, setDismissed] = useState(() => isWelcomeDismissed(userId));
  const [stats, setStats] = useState<OnboardingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId || dismissed) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void loadOnboardingStats(supabase, companyId).then((result) => {
      if (!cancelled) {
        setStats(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, dismissed]);

  const steps = useMemo((): Step[] => {
    const profileDone = isProfileStepComplete(profile);
    const workDone = isWorkOrCustomerStepComplete(stats);
    const inviteDone = isInviteStepComplete(stats);

    const list: Step[] = [
      {
        id: 'profile',
        label: 'Täydennä omat tiedot',
        hint: 'Nimi näkyy raporteissa ja tulosteissa.',
        href: '/hallinta/omat',
        done: profileDone,
      },
      {
        id: 'work',
        label: 'Luo esimerkkidata tai työraportti',
        hint: 'Esimerkit etusivulta — tai luo oma luonnos.',
        href: '/tyoraportit/uusi',
        done: workDone,
      },
    ];

    if (isAdmin) {
      list.push({
        id: 'invite',
        label: 'Kutsu kollega (valinnainen)',
        hint: 'Lisää asentaja tai esimies Hallinnasta.',
        href: '/hallinta/kayttajat',
        done: inviteDone,
        optional: true,
      });
    } else {
      list.push({
        id: 'guide',
        label: 'Tutustu käyttöohjeeseen (valinnainen)',
        hint: 'Lyhyt PDF-ohje moduuleista ja työnkulusta.',
        href: '/BC-Smartapp-kayttoohje.pdf',
        done: false,
        optional: true,
      });
    }

    return list;
  }, [profile, stats, isAdmin]);

  const requiredDone = isProfileStepComplete(profile) && isWorkOrCustomerStepComplete(stats);
  const optionalDone = !isAdmin || isInviteStepComplete(stats);

  if (dismissed || loading || !companyId) return null;
  if (requiredDone && optionalDone) return null;

  function handleDismiss() {
    dismissWelcome(userId);
    setDismissed(true);
  }

  const completedCount = steps.filter((step) => step.done).length;

  return (
    <section className="dashboard-welcome-card" aria-labelledby="dashboard-welcome-title">
      <div className="dashboard-welcome-card__head">
        <div>
          <h2 id="dashboard-welcome-title">Tervetuloa BC Smartappiin</h2>
          <p className="muted">
            Aloita näistä — {completedCount}/{steps.length} valmis. Voit palata tähän myöhemmin etusivulta.
          </p>
        </div>
        <button type="button" className="link-btn" onClick={handleDismiss}>
          Piilota
        </button>
      </div>

      <ol className="dashboard-welcome-steps">
        {steps.map((step) => (
          <li
            key={step.id}
            className={[
              'dashboard-welcome-step',
              step.done ? 'is-done' : '',
              step.optional ? 'is-optional' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="dashboard-welcome-step__marker" aria-hidden="true">
              {step.done ? '✓' : step.optional ? '○' : '→'}
            </span>
            <div className="dashboard-welcome-step__body">
              {step.href.endsWith('.pdf') ? (
                <a
                  href={step.href}
                  download="BC-Smartapp-kayttoohje.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dashboard-welcome-step__link"
                >
                  {step.label}
                </a>
              ) : (
                <Link to={step.href} className="dashboard-welcome-step__link">
                  {step.label}
                </Link>
              )}
              <span className="muted">{step.hint}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
