import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthSessionProvider, useAuthSession } from './contexts/AuthSessionContext';
import CustomerDetailPage from './pages/CustomerDetailPage';
import EquipmentDetailPage from './pages/EquipmentDetailPage';
import CustomersPage from './pages/CustomersPage';
import ManagementLayout from './components/ManagementLayout';
import Dashboard from './pages/Dashboard';
import CompanySettingsPage from './pages/CompanySettingsPage';
import Login from './pages/Login';
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
import SubscribersPage from './pages/SubscribersPage';
import {
  CustomerPortalPreviewPage,
  SubscriberPortalPreviewPage,
} from './pages/PortalPreviewPage';

function AppRoutes() {
  const { session, loading } = useAuthSession();

  if (loading) {
    return <div className="app-loading">Ladataan…</div>;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
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
      <Route path="/tyoraportit" element={<WorkReportsPage session={session} />} />
      <Route path="/laskutus" element={<BillingPage session={session} />} />
      <Route path="/varasto" element={<InventoryPage session={session} />} />
      <Route path="/tyokalut" element={<ToolsPage session={session} />} />
      <Route path="/asiakkaat" element={<CustomersPage session={session} />} />
      <Route path="/asiakkaat/:customerId/laitteet/:equipmentId" element={<EquipmentDetailPage session={session} />} />
      <Route path="/asiakkaat/:id" element={<CustomerDetailPage session={session} />} />
      <Route path="/hallinta" element={<ManagementLayout session={session} />}>
        <Route index element={<Navigate to="/hallinta/omat" replace />} />
        <Route path="omat" element={<ProfileSettingsPage />} />
        <Route path="global-admin" element={<GlobalAdminPage />} />
        <Route path="yritys" element={<CompanySettingsPage />} />
        <Route path="tilaajat" element={<SubscribersPage />} />
        <Route path="kayttajat" element={<UsersPage />} />
        <Route path="kumppanuudet" element={<PartnershipsPage />} />
        <Route path="kumppanilaskutus" element={<WorkReportBillingSummaryPage />} />
      </Route>
      <Route path="/tyoraportit/tilaus/uusi" element={<PortalWorkOrderPage session={session} />} />
      <Route path="/tyoraportit/tilaus/:id/muokkaa" element={<PortalWorkOrderPage session={session} />} />
      <Route path="/tyoraportit/uusi" element={<WorkReportNewPage session={session} />} />
      <Route path="/tyoraportit/toimeksianto/uusi" element={<WorkReportOrderPage session={session} />} />
      <Route path="/tyoraportit/toimeksianto/:id/muokkaa" element={<WorkReportOrderPage session={session} />} />
      <Route path="/tyoraportit/:id/muokkaa" element={<WorkReportNewPage session={session} />} />
      <Route path="/tyoraportit/:id/laskutus/tuloste" element={<WorkReportPartnerBillingPrintPage session={session} />} />
      <Route path="/tyoraportit/:id/tuloste" element={<WorkReportPrintPage session={session} />} />
      <Route path="/tyoraportit/:id" element={<WorkReportDetailPage session={session} />} />
      <Route path="/huoltoraportit" element={<MaintenanceReportsPage session={session} />} />
      <Route path="/huoltoraportit/uusi" element={<MaintenanceReportEditPage session={session} />} />
      <Route path="/huoltoraportit/:id" element={<MaintenanceReportEditPage session={session} />} />
      <Route path="/huoltoraportit/:id/tuloste" element={<MaintenanceReportPrintPage session={session} />} />
      <Route path="/tarjouspyynnot" element={<QuoteRequestHubPage session={session} />} />
      <Route path="/tarjouspyynnot/lista" element={<QuoteRequestsPage session={session} />} />
      <Route path="/tarjouspyynnot/laiterekisteri" element={<PumpDeviceRegistryPage session={session} />} />
      <Route path="/tarjouspyynnot/uusi" element={<QuoteRequestEditPage session={session} />} />
      <Route path="/tarjouspyynnot/:id/tuloste" element={<QuoteRequestPrintPage session={session} />} />
      <Route path="/tarjouspyynnot/:id" element={<QuoteRequestEditPage session={session} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthSessionProvider>
      <AppRoutes />
    </AuthSessionProvider>
  );
}
