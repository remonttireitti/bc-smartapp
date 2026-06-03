import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { Session } from '@supabase/supabase-js';
import RequireLoginRedirect from './components/RequireLoginRedirect';
import RequirePasswordChange from './components/RequirePasswordChange';
import LicenseModuleGate from './components/LicenseModuleGate';
import { AuthSessionProvider, useAuthSession } from './contexts/AuthSessionContext';
import type { LicenseModuleKey } from './lib/companyLicense';
import CustomerDetailPage from './pages/CustomerDetailPage';
import EquipmentDetailPage from './pages/EquipmentDetailPage';
import CustomersPage from './pages/CustomersPage';
import ManagementLayout from './components/ManagementLayout';
import Dashboard from './pages/Dashboard';
import CompanySettingsPage from './pages/CompanySettingsPage';
import Login from './pages/Login';
import PublicLandingPage from './pages/PublicLandingPage';
import PartnershipsPage from './pages/PartnershipsPage';
import UsersPage from './pages/UsersPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import MaintenanceReportEditPage from './pages/MaintenanceReportEditPage';
import MaintenanceReportPrintPage from './pages/MaintenanceReportPrintPage';
import MaintenanceReportsPage from './pages/MaintenanceReportsPage';
import WorkReportDetailPage from './pages/WorkReportDetailPage';
import WorkReportNewPage from './pages/WorkReportNewPage';
import PortalWorkOrderPage from './pages/PortalWorkOrderPage';
import WorkReportOrderPage from './pages/WorkReportOrderPage';
import WorkReportBillingSummaryPage from './pages/WorkReportBillingSummaryPage';
import WorkReportPartnerBillingPrintPage from './pages/WorkReportPartnerBillingPrintPage';
import WorkReportPrintPage from './pages/WorkReportPrintPage';
import BillingPage from './pages/BillingPage';
import WorkReportsPage from './pages/WorkReportsPage';
import QuoteRequestsPage from './pages/QuoteRequestsPage';
import QuoteRequestHubPage from './pages/QuoteRequestHubPage';
import QuoteRequestEditPage from './pages/QuoteRequestEditPage';
import QuoteRequestPrintPage from './pages/QuoteRequestPrintPage';
import GlobalAdminPage from './pages/GlobalAdminPage';
import PumpDeviceRegistryPage from './pages/PumpDeviceRegistryPage';
import InventoryPage from './pages/InventoryPage';
import ToolsPage from './pages/ToolsPage';
import TempMonitoringPage from './pages/TempMonitoringPage';
import TempMonitorDetailPage from './pages/TempMonitorDetailPage';
import TempMonitorReportPrintPage from './pages/TempMonitorReportPrintPage';
import RemoteMonitoringHubPage from './pages/RemoteMonitoringHubPage';
import VrfMonitoringPage from './pages/VrfMonitoringPage';
import MonitorReaderTokenPage from './pages/MonitorReaderTokenPage';
import MonitorReaderHubPage from './pages/MonitorReaderHubPage';
import MonitorReaderVrfPage from './pages/MonitorReaderVrfPage';
import VrfMonitorDetailPage from './pages/VrfMonitorDetailPage';
import SubscribersPage from './pages/SubscribersPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import {
  CustomerPortalPreviewPage,
  SubscriberPortalPreviewPage,
} from './pages/PortalPreviewPage';
import OfflineBanner from './components/OfflineBanner';
import PwaInstallBanner from './components/PwaInstallBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import {
  tempMonitoringDevicePath,
  tempMonitoringReportPrintPath,
} from './lib/remoteMonitoringRoutes';

function LegacyTempDeviceRedirect() {
  const { deviceId } = useParams();
  if (!deviceId) return <Navigate to="/etaseuranta/lampotila" replace />;
  return <Navigate to={tempMonitoringDevicePath(deviceId)} replace />;
}

function LegacyTempReportRedirect() {
  const { reportId } = useParams();
  if (!reportId) return <Navigate to="/etaseuranta/lampotila" replace />;
  return <Navigate to={tempMonitoringReportPrintPath(reportId)} replace />;
}

function withLicenseModule<P extends { session: Session }>(
  moduleKey: LicenseModuleKey,
  Page: ComponentType<P>,
) {
  return function LicensedPage(props: P) {
    return (
      <LicenseModuleGate session={props.session} moduleKey={moduleKey}>
        <Page {...props} />
      </LicenseModuleGate>
    );
  };
}

const LicensedWorkReportsPage = withLicenseModule('base', WorkReportsPage);
const LicensedWorkReportDetailPage = withLicenseModule('base', WorkReportDetailPage);
const LicensedWorkReportNewPage = withLicenseModule('base', WorkReportNewPage);
const LicensedWorkReportOrderPage = withLicenseModule('base', WorkReportOrderPage);
const LicensedWorkReportPrintPage = withLicenseModule('base', WorkReportPrintPage);
const LicensedWorkReportPartnerBillingPrintPage = withLicenseModule('billing', WorkReportPartnerBillingPrintPage);
const LicensedBillingPage = withLicenseModule('billing', BillingPage);
const LicensedInventoryPage = withLicenseModule('base', InventoryPage);
const LicensedMaintenanceReportsPage = withLicenseModule('base', MaintenanceReportsPage);
const LicensedMaintenanceReportEditPage = withLicenseModule('base', MaintenanceReportEditPage);
const LicensedMaintenanceReportPrintPage = withLicenseModule('base', MaintenanceReportPrintPage);
const LicensedCustomersPage = withLicenseModule('base', CustomersPage);
const LicensedCustomerDetailPage = withLicenseModule('base', CustomerDetailPage);
const LicensedEquipmentDetailPage = withLicenseModule('base', EquipmentDetailPage);
const LicensedQuoteRequestHubPage = withLicenseModule('quotes', QuoteRequestHubPage);
const LicensedQuoteRequestsPage = withLicenseModule('quotes', QuoteRequestsPage);
const LicensedPumpDeviceRegistryPage = withLicenseModule('quotes', PumpDeviceRegistryPage);
const LicensedQuoteRequestEditPage = withLicenseModule('quotes', QuoteRequestEditPage);
const LicensedQuoteRequestPrintPage = withLicenseModule('quotes', QuoteRequestPrintPage);
const LicensedRemoteMonitoringHubPage = withLicenseModule('remote_monitoring', RemoteMonitoringHubPage);
const LicensedTempMonitoringPage = withLicenseModule('remote_monitoring', TempMonitoringPage);
const LicensedTempMonitorDetailPage = withLicenseModule('remote_monitoring', TempMonitorDetailPage);
const LicensedTempMonitorReportPrintPage = withLicenseModule('remote_monitoring', TempMonitorReportPrintPage);
const LicensedVrfMonitoringPage = withLicenseModule('remote_monitoring', VrfMonitoringPage);
const LicensedVrfMonitorDetailPage = withLicenseModule('remote_monitoring', VrfMonitorDetailPage);
const LicensedToolsPage = withLicenseModule('tools', ToolsPage);

function LicensedWorkReportBillingSummaryRoute({ session }: { session: Session }) {
  return (
    <LicenseModuleGate session={session} moduleKey="billing">
      <WorkReportBillingSummaryPage />
    </LicenseModuleGate>
  );
}

function AppRoutes() {
  const { session, loading } = useAuthSession();

  if (loading) {
    return <div className="app-loading">Ladataan…</div>;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<PublicLandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/seuranta/luku/:token" element={<MonitorReaderTokenPage />} />
        <Route path="*" element={<RequireLoginRedirect />} />
      </Routes>
    );
  }

  return (
    <RequirePasswordChange session={session}>
      <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/vaihda-salasana" element={<ChangePasswordPage session={session} />} />
      <Route
        path="/esikatselu/tilaaja/:subscriberId"
        element={<SubscriberPortalPreviewPage session={session} kind="subscriber" />}
      />
      <Route
        path="/esikatselu/asiakas/:customerId"
        element={<CustomerPortalPreviewPage session={session} kind="customer" />}
      />
      <Route path="/" element={<Dashboard session={session} />} />
      <Route path="/global-admin" element={<Navigate to="/hallinta/global-admin" replace />} />
      <Route path="/tyoraportit" element={<LicensedWorkReportsPage session={session} />} />
      <Route path="/laskutus" element={<LicensedBillingPage session={session} />} />
      <Route path="/varasto" element={<LicensedInventoryPage session={session} />} />
      <Route path="/etaseuranta" element={<LicensedRemoteMonitoringHubPage session={session} />} />
      <Route path="/etaseuranta/luku" element={<MonitorReaderHubPage session={session} />} />
      <Route path="/etaseuranta/luku/vrf/:deviceId" element={<MonitorReaderVrfPage session={session} />} />
      <Route path="/seuranta/luku/:token" element={<MonitorReaderTokenPage />} />
      <Route path="/etaseuranta/lampotila" element={<LicensedTempMonitoringPage session={session} />} />
      <Route path="/etaseuranta/lampotila/raportit/:reportId/tuloste" element={<LicensedTempMonitorReportPrintPage session={session} />} />
      <Route path="/etaseuranta/lampotila/:deviceId" element={<LicensedTempMonitorDetailPage session={session} />} />
      <Route path="/etaseuranta/vrf" element={<LicensedVrfMonitoringPage session={session} />} />
      <Route path="/etaseuranta/vrf/:deviceId" element={<LicensedVrfMonitorDetailPage session={session} />} />
      <Route path="/lampotila" element={<Navigate to="/etaseuranta/lampotila" replace />} />
      <Route path="/lampotila/raportit/:reportId/tuloste" element={<LegacyTempReportRedirect />} />
      <Route path="/lampotila/:deviceId" element={<LegacyTempDeviceRedirect />} />
      <Route path="/tyokalut" element={<LicensedToolsPage session={session} />} />
      <Route path="/asiakkaat" element={<LicensedCustomersPage session={session} />} />
      <Route path="/asiakkaat/:customerId/laitteet/:equipmentId" element={<LicensedEquipmentDetailPage session={session} />} />
      <Route path="/asiakkaat/:id" element={<LicensedCustomerDetailPage session={session} />} />
      <Route path="/hallinta" element={<ManagementLayout session={session} />}>
        <Route index element={<Navigate to="/hallinta/omat" replace />} />
        <Route path="omat" element={<ProfileSettingsPage />} />
        <Route path="global-admin" element={<GlobalAdminPage />} />
        <Route path="yritys" element={<CompanySettingsPage />} />
        <Route path="tilaajat" element={<SubscribersPage />} />
        <Route path="kayttajat" element={<UsersPage />} />
        <Route path="kumppanuudet" element={<PartnershipsPage />} />
        <Route path="kumppanilaskutus" element={<LicensedWorkReportBillingSummaryRoute session={session} />} />
      </Route>
      <Route path="/tyoraportit/tilaus/uusi" element={<PortalWorkOrderPage session={session} />} />
      <Route path="/tyoraportit/tilaus/:id/muokkaa" element={<PortalWorkOrderPage session={session} />} />
      <Route path="/tyoraportit/uusi" element={<LicensedWorkReportNewPage session={session} />} />
      <Route path="/tyoraportit/toimeksianto/uusi" element={<LicensedWorkReportOrderPage session={session} />} />
      <Route path="/tyoraportit/toimeksianto/:id/muokkaa" element={<LicensedWorkReportOrderPage session={session} />} />
      <Route path="/tyoraportit/:id/muokkaa" element={<LicensedWorkReportNewPage session={session} />} />
      <Route path="/tyoraportit/:id/laskutus/tuloste" element={<LicensedWorkReportPartnerBillingPrintPage session={session} />} />
      <Route path="/tyoraportit/:id/tuloste" element={<LicensedWorkReportPrintPage session={session} />} />
      <Route path="/tyoraportit/:id" element={<LicensedWorkReportDetailPage session={session} />} />
      <Route path="/huoltoraportit" element={<LicensedMaintenanceReportsPage session={session} />} />
      <Route path="/huoltoraportit/uusi" element={<LicensedMaintenanceReportEditPage session={session} />} />
      <Route path="/huoltoraportit/:id/tuloste" element={<LicensedMaintenanceReportPrintPage session={session} />} />
      <Route path="/huoltoraportit/:id" element={<LicensedMaintenanceReportEditPage session={session} />} />
      <Route path="/tarjouspyynnot" element={<LicensedQuoteRequestHubPage session={session} />} />
      <Route path="/tarjouspyynnot/lista" element={<LicensedQuoteRequestsPage session={session} />} />
      <Route path="/tarjouspyynnot/laiterekisteri" element={<LicensedPumpDeviceRegistryPage session={session} />} />
      <Route path="/tarjouspyynnot/uusi" element={<LicensedQuoteRequestEditPage session={session} />} />
      <Route path="/tarjouspyynnot/:id/tuloste" element={<LicensedQuoteRequestPrintPage session={session} />} />
      <Route path="/tarjouspyynnot/:id" element={<LicensedQuoteRequestEditPage session={session} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </RequirePasswordChange>
  );
}

export default function App() {
  return (
    <AuthSessionProvider>
      <div className="app-shell">
        <OfflineBanner />
        <PwaUpdateBanner />
        <PwaInstallBanner />
        <AppRoutes />
      </div>
    </AuthSessionProvider>
  );
}
