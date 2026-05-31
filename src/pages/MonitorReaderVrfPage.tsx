import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import VrfMonitorReaderView from '../components/vrfMonitoring/VrfMonitorReaderView';
import { monitorReaderHubPath } from '../lib/monitorReaderShares';

interface Props {
  session: Session;
}

export default function MonitorReaderVrfPage({ session }: Props) {
  const { deviceId } = useParams<{ deviceId: string }>();

  if (!deviceId) {
    return (
      <AppLayout session={session}>
        <p className="form-error">Laite puuttuu.</p>
        <Link to={monitorReaderHubPath()}>← Takaisin</Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="page-stack">
        <p>
          <Link to={monitorReaderHubPath()} className="btn btn-secondary">
            ← Kaikki jaetut
          </Link>
        </p>
        <VrfMonitorReaderView session={session} deviceId={deviceId} />
      </div>
    </AppLayout>
  );
}
