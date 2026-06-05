import { useMemo } from 'react';
import { Route, Routes } from 'react-router-dom';
import RequireLoginRedirect from './components/RequireLoginRedirect';
import RequirePasswordChange from './components/RequirePasswordChange';
import KeepAliveRoutes from './components/KeepAliveRoutes';
import { AuthSessionProvider, useAuthSession } from './contexts/AuthSessionContext';
import { ProfileProvider } from './contexts/ProfileContext';
import Login from './pages/Login';
import PublicLandingPage from './pages/PublicLandingPage';
import MonitorReaderTokenPage from './pages/MonitorReaderTokenPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import OfflineBanner from './components/OfflineBanner';
import PwaInstallBanner from './components/PwaInstallBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import { buildAuthenticatedRoutes } from './routes/authenticatedRoutes';
import PlatformRouteAudit from './components/PlatformRouteAudit';

function AppRoutes() {
  const { session, loading } = useAuthSession();
  const authenticatedRoutes = useMemo(
    () => (session ? buildAuthenticatedRoutes(session) : []),
    [session?.user.id],
  );

  if (loading) {
    return <div className="app-loading">Ladataan…</div>;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<PublicLandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/unohdin-salasana" element={<ForgotPasswordPage />} />
        <Route path="/aseta-uusi-salasana" element={<ResetPasswordPage />} />
        <Route path="/seuranta/luku/:token" element={<MonitorReaderTokenPage />} />
        <Route path="*" element={<RequireLoginRedirect />} />
      </Routes>
    );
  }

  return (
    <ProfileProvider session={session}>
      <RequirePasswordChange session={session}>
        <KeepAliveRoutes routes={authenticatedRoutes} resetKey={session.user.id} />
      </RequirePasswordChange>
    </ProfileProvider>
  );
}

export default function App() {
  return (
    <AuthSessionProvider>
      <div className="app-shell">
        <OfflineBanner />
        <PwaUpdateBanner />
        <PwaInstallBanner />
        <PlatformRouteAudit />
        <AppRoutes />
      </div>
    </AuthSessionProvider>
  );
}
