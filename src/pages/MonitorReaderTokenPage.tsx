import { Link, useParams } from 'react-router-dom';
import VrfMonitorReaderView from '../components/vrfMonitoring/VrfMonitorReaderView';

export default function MonitorReaderTokenPage() {
  const { token } = useParams<{ token: string }>();

  if (!token) {
    return (
      <div className="monitor-reader-public">
        <p className="form-error">Jakolinkki puuttuu.</p>
        <Link to="/login">Kirjaudu sisään</Link>
      </div>
    );
  }

  return (
    <div className="monitor-reader-public">
      <header className="monitor-reader-public-topbar">
        <span className="brand-icon" aria-hidden="true">
          🏢
        </span>
        <span>BC Smartapp — jaettu seuranta</span>
        <Link to="/login" className="btn btn-secondary monitor-reader-login-link">
          Kirjaudu
        </Link>
      </header>
      <main className="main monitor-reader-public-main">
        <VrfMonitorReaderView shareToken={token} />
      </main>
    </div>
  );
}
