import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import TempMonitoringPageHeader from '../components/tempMonitoring/TempMonitoringPageHeader';
import { REMOTE_MONITORING_HUB } from '../lib/remoteMonitoringRoutes';

interface Props {
  session: Session;
}

/** VRF-laitteen seuranta — siirretään tänne Firebase-projektista vaiheittain. */
export default function VrfMonitoringPage({ session }: Props) {
  return (
    <AppLayout session={session}>
      <div className="temp-monitoring-page page-stack">
        <TempMonitoringPageHeader
          crumbs={[
            { href: '/', label: 'Etusivu' },
            { href: REMOTE_MONITORING_HUB, label: 'Etäohjaus ja seuranta' },
            { label: 'VRF ohjaus ja seuranta' },
          ]}
          title="VRF ohjaus ja seuranta"
          subtitle="Integraatio tulossa — laite ja seuranta siirretään tähän sovellukseen."
        />

        <section className="panel temp-devices-panel">
          <h2>Tilanne</h2>
          <p>
            VRF-lämpöpumppuseuranta on tällä hetkellä erillisessä Firebase-käyttöliittymässä. Se tuodaan tänne
            samaan rakenneeseen kuin lämpötilaseuranta: laiterekisteri, live-data, ohjaus ja OTA-päivitykset.
          </p>
          <p className="muted">
            Voit käyttää nykyistä seurantaa toistaiseksi erillisessä ikkunassa, kunnes siirto on valmis.
          </p>
          <div className="form-actions">
            <a
              href="https://hyrylavrf.web.app"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Avaa nykyinen VRF-seuranta
            </a>
            <Link to={REMOTE_MONITORING_HUB} className="btn btn-secondary">
              ← Takaisin
            </Link>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
