import { useEffect, useState } from 'react';
import { loadRealOnboardingStats, type OnboardingStats } from '../lib/dashboardOnboarding';
import {
  createOnboardingDemoData,
  deleteOnboardingDemoData,
  fetchOnboardingDemoStatus,
  type OnboardingDemoStatus,
} from '../lib/onboardingDemoData';
import { supabase } from '../lib/supabase';

type Props = {
  companyId: string;
  /** Vain ylläpitäjä voi poistaa. */
  canDelete?: boolean;
  onChanged?: () => void;
};

export function demoSummaryText(s: OnboardingDemoStatus): string {
  const parts = [
    s.customerCount ? `${s.customerCount} asiakas` : '',
    s.equipmentCount ? `${s.equipmentCount} laite` : '',
    s.reportCount ? `${s.reportCount} työraportti` : '',
    s.maintenanceReportCount ? `${s.maintenanceReportCount} huoltoraporttia` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

export default function OnboardingDemoPanel({ companyId, canDelete = true, onChanged }: Props) {
  const [status, setStatus] = useState<OnboardingDemoStatus | null>(null);
  const [realStats, setRealStats] = useState<OnboardingStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    try {
      const [demoStatus, stats] = await Promise.all([
        fetchOnboardingDemoStatus(supabase),
        loadRealOnboardingStats(supabase, companyId),
      ]);
      setStatus(demoStatus);
      setRealStats(stats);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    if (companyId) void refresh();
  }, [companyId]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await createOnboardingDemoData(supabase);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Luonti epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Poistetaanko kaikki esimerkkitiedot? Omat tiedot eivät muutu.')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await deleteOnboardingDemoData(supabase);
      await refresh();
      if (res.keptCustomers || res.keptEquipment) {
        setMessage('Esimerkkiasiakas jäi, koska siihen on liitetty omia tietoja.');
      }
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Poisto epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  if (!companyId || !status) return null;

  if (status.hasDemo) {
    return (
      <section className="onboarding-demo-panel onboarding-demo-panel-active" role="status">
        <div className="onboarding-demo-panel__content">
          <strong>
            <span className="badge badge-demo">Esimerkki</span> Esimerkkitiedot käytössä
          </strong>
          <p className="muted">{demoSummaryText(status)}</p>
          {message && <p className="muted onboarding-demo-message">{message}</p>}
          {error && <p className="error">{error}</p>}
        </div>
        {canDelete ? (
          <div className="onboarding-demo-panel__actions">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void handleDelete()}>
              {busy ? 'Poistetaan…' : 'Poista esimerkkitiedot'}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const hasRealData = (realStats?.workReportCount ?? 0) > 0 || (realStats?.customerCount ?? 0) > 0;
  if (hasRealData) return message ? <p className="muted">{message}</p> : null;

  return (
    <section className="onboarding-demo-panel" aria-labelledby="onboarding-demo-title">
      <div className="onboarding-demo-panel__content">
        <strong id="onboarding-demo-title">Kokeile esimerkkitiedoilla</strong>
        <p className="muted">Esimerkkiasiakas, laite ja raportit. Poistettavissa yhdellä napilla.</p>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="onboarding-demo-panel__actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void handleCreate()}>
          {busy ? 'Luodaan…' : 'Luo esimerkkitiedot'}
        </button>
      </div>
    </section>
  );
}
