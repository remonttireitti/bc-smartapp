import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  onChanged?: () => void;
};

const EMPTY_STATUS: OnboardingDemoStatus = {
  hasDemo: false,
  customerCount: 0,
  reportCount: 0,
  equipmentCount: 0,
};

export default function OnboardingDemoPanel({ companyId, onChanged }: Props) {
  const [status, setStatus] = useState<OnboardingDemoStatus>(EMPTY_STATUS);
  const [realStats, setRealStats] = useState<OnboardingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [demoStatus, stats] = await Promise.all([
        fetchOnboardingDemoStatus(supabase),
        loadRealOnboardingStats(supabase, companyId),
      ]);
      setStatus(demoStatus);
      setRealStats(stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tilan lataus epäonnistui.';
      setError(
        message.includes('onboarding_demo_status')
          ? 'Esimerkkidata ei vielä käytettävissä — päivitä sivu hetken kuluttua.'
          : message,
      );
      setStatus(EMPTY_STATUS);
      setRealStats(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [companyId]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await createOnboardingDemoData(supabase);
      await refresh();
      setMessage('Esimerkkidata luotu — tutustu työraportteihin ja asiakkaisiin.');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Luonti epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const ok = window.confirm(
      'Poistetaan kaikki esimerkkiasiakkaat, laitteet ja työraportit. Oma data ei muutu. Jatketaanko?',
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deleteOnboardingDemoData(supabase);
      await refresh();
      setMessage('Esimerkkidata poistettu.');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Poisto epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !companyId) return null;

  const hasRealData =
    (realStats?.workReportCount ?? 0) > 0 || (realStats?.customerCount ?? 0) > 0;

  if (!status.hasDemo && hasRealData) return null;

  if (status.hasDemo) {
    return (
      <section className="onboarding-demo-panel onboarding-demo-panel-active" role="status">
        <div className="onboarding-demo-panel__content">
          <strong>Esimerkkidata käytössä</strong>
          <p className="muted">
            {status.customerCount} asiakasta, {status.reportCount} työraporttia
            {status.equipmentCount > 0 ? ` ja ${status.equipmentCount} laitetta` : ''}. Merkitty selkeästi
            esimerkkinä — poista kun olet tutustunut sovellukseen.
          </p>
          {message && <p className="muted onboarding-demo-message">{message}</p>}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="onboarding-demo-panel__actions">
          <Link to="/tyoraportit" className="btn btn-secondary btn-sm">
            Avaa työraportit
          </Link>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void handleDelete()}>
            {busy ? 'Poistetaan…' : 'Poista esimerkkidata'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="onboarding-demo-panel" aria-labelledby="onboarding-demo-title">
      <div className="onboarding-demo-panel__content">
        <strong id="onboarding-demo-title">Kokeile esimerkkidatalla</strong>
        <p className="muted">
          Luo 2 esimerkkiasiakasta, laitteet ja työraportit (luonnos + kalenterissa näkyvä työ). Voit poistaa ne
          yhdellä napilla myöhemmin.
        </p>
        {message && <p className="muted onboarding-demo-message">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="onboarding-demo-panel__actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void handleCreate()}>
          {busy ? 'Luodaan…' : 'Luo esimerkkidata'}
        </button>
      </div>
    </section>
  );
}
