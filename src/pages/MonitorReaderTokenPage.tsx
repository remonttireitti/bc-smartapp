import BrandLogo from '../components/BrandLogo';
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
        <BrandLogo variant="mark" size="1.4rem" />
        <span className="monitor-reader-public-title">— jaettu seuranta</span>
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
