import { Navigate, useLocation, useParams, type RouteObject } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import type { ComponentType } from 'react';
import LicenseModuleGate from '../components/LicenseModuleGate';
import ManagementLayout from '../components/ManagementLayout';
import type { LicenseModuleKey } from '../lib/companyLicense';
import {
  tempMonitoringDevicePath,
  tempMonitoringReportPrintPath,
} from '../lib/remoteMonitoringRoutes';
import CustomerDetailPage from '../pages/CustomerDetailPage';
import EquipmentDetailPage from '../pages/EquipmentDetailPage';
import CustomersPage from '../pages/CustomersPage';
import Dashboard from '../pages/Dashboard';
import CompanySettingsPage from '../pages/CompanySettingsPage';
import PartnershipsPage from '../pages/PartnershipsPage';
import UsersPage from '../pages/UsersPage';
import ProfileSettingsPage from '../pages/ProfileSettingsPage';
import MaintenanceReportEditPage from '../pages/MaintenanceReportEditPage';
import MaintenanceReportPrintPage from '../pages/MaintenanceReportPrintPage';
import MaintenanceReportsPage from '../pages/MaintenanceReportsPage';
import WorkReportDetailPage from '../pages/WorkReportDetailPage';
import WorkReportNewPage from '../pages/WorkReportNewPage';
import PortalWorkOrderPage from '../pages/PortalWorkOrderPage';
import WorkReportOrderPage from '../pages/WorkReportOrderPage';
import WorkReportBillingSummaryPage from '../pages/WorkReportBillingSummaryPage';
import WorkReportPartnerBillingPrintPage from '../pages/WorkReportPartnerBillingPrintPage';
import WorkReportPrintPage from '../pages/WorkReportPrintPage';
import BillingPage from '../pages/BillingPage';
import WorkReportsPage from '../pages/WorkReportsPage';
import QuoteRequestsPage from '../pages/QuoteRequestsPage';
import QuoteRequestHubPage from '../pages/QuoteRequestHubPage';
import QuoteRequestEditPage from '../pages/QuoteRequestEditPage';
import QuoteRequestPrintPage from '../pages/QuoteRequestPrintPage';
import InstallationPlanHubPage from '../pages/InstallationPlanHubPage';
import InstallationPlansPage from '../pages/InstallationPlansPage';
import InstallationPlanEditPage from '../pages/InstallationPlanEditPage';
import InstallationPlanPrintPage from '../pages/InstallationPlanPrintPage';
import GlobalAdminPage from '../pages/GlobalAdminPage';
import PumpDeviceRegistryPage from '../pages/PumpDeviceRegistryPage';
import InventoryPage from '../pages/InventoryPage';
import ToolsPage from '../pages/ToolsPage';
import TempMonitoringPage from '../pages/TempMonitoringPage';
import TempMonitorDetailPage from '../pages/TempMonitorDetailPage';
import TempMonitorReportPrintPage from '../pages/TempMonitorReportPrintPage';
import RemoteMonitoringHubPage from '../pages/RemoteMonitoringHubPage';
import VrfMonitoringPage from '../pages/VrfMonitoringPage';
import MonitorReaderTokenPage from '../pages/MonitorReaderTokenPage';
import WorkReportPublicPrintPage from '../pages/WorkReportPublicPrintPage';
import MonitorReaderHubPage from '../pages/MonitorReaderHubPage';
import MonitorReaderVrfPage from '../pages/MonitorReaderVrfPage';
import VrfMonitorDetailPage from '../pages/VrfMonitorDetailPage';
import SubscribersPage from '../pages/SubscribersPage';
import ChangePasswordPage from '../pages/ChangePasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import {
  CustomerPortalPreviewPage,
  SubscriberPortalPreviewPage,
} from '../pages/PortalPreviewPage';
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

/** Uusi vs. muokkaus jakaa saman sivukomponentin — key pakottaa tyhjän lomakkeen /uusi-polulla. */
function LicensedWorkReportNewRoute({ session }: { session: Session }) {
  const location = useLocation();
  return <LicensedWorkReportNewPage session={session} key={location.pathname} />;
}
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
const LicensedInstallationPlanHubPage = withLicenseModule('quotes', InstallationPlanHubPage);
const LicensedInstallationPlansPage = withLicenseModule('quotes', InstallationPlansPage);
const LicensedInstallationPlanEditPage = withLicenseModule('quotes', InstallationPlanEditPage);
const LicensedInstallationPlanPrintPage = withLicenseModule('quotes', InstallationPlanPrintPage);
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

export function buildAuthenticatedRoutes(session: Session): RouteObject[] {
  return [
    { path: '/login', element: <Navigate to="/" replace /> },
    { path: '/unohdin-salasana', element: <Navigate to="/" replace /> },
    { path: '/aseta-uusi-salasana', element: <ResetPasswordPage /> },
    { path: '/vaihda-salasana', element: <ChangePasswordPage session={session} /> },
    {
      path: '/esikatselu/tilaaja/:subscriberId',
      element: <SubscriberPortalPreviewPage session={session} kind="subscriber" />,
    },
    {
      path: '/esikatselu/asiakas/:customerId',
      element: <CustomerPortalPreviewPage session={session} kind="customer" />,
    },
    { path: '/', element: <Dashboard session={session} /> },
    { path: '/global-admin', element: <Navigate to="/hallinta/global-admin" replace /> },
    { path: '/tyoraportit', element: <LicensedWorkReportsPage session={session} /> },
    { path: '/laskutus', element: <LicensedBillingPage session={session} /> },
    { path: '/varasto', element: <LicensedInventoryPage session={session} /> },
    { path: '/etaseuranta', element: <LicensedRemoteMonitoringHubPage session={session} /> },
    { path: '/etaseuranta/luku', element: <MonitorReaderHubPage session={session} /> },
    { path: '/etaseuranta/luku/vrf/:deviceId', element: <MonitorReaderVrfPage session={session} /> },
    { path: '/seuranta/luku/:token', element: <MonitorReaderTokenPage /> },
    { path: '/tyoraportti/jako/:token', element: <WorkReportPublicPrintPage /> },
    { path: '/etaseuranta/lampotila', element: <LicensedTempMonitoringPage session={session} /> },
    {
      path: '/etaseuranta/lampotila/raportit/:reportId/tuloste',
      element: <LicensedTempMonitorReportPrintPage session={session} />,
    },
    { path: '/etaseuranta/lampotila/:deviceId', element: <LicensedTempMonitorDetailPage session={session} /> },
    { path: '/etaseuranta/vrf', element: <LicensedVrfMonitoringPage session={session} /> },
    { path: '/etaseuranta/vrf/:deviceId', element: <LicensedVrfMonitorDetailPage session={session} /> },
    { path: '/lampotila', element: <Navigate to="/etaseuranta/lampotila" replace /> },
    { path: '/lampotila/raportit/:reportId/tuloste', element: <LegacyTempReportRedirect /> },
    { path: '/lampotila/:deviceId', element: <LegacyTempDeviceRedirect /> },
    { path: '/tyokalut', element: <LicensedToolsPage session={session} /> },
    { path: '/asiakkaat', element: <LicensedCustomersPage session={session} /> },
    {
      path: '/asiakkaat/:customerId/laitteet/:equipmentId',
      element: <LicensedEquipmentDetailPage session={session} />,
    },
    { path: '/asiakkaat/:id', element: <LicensedCustomerDetailPage session={session} /> },
    {
      path: '/hallinta',
      element: <ManagementLayout session={session} />,
      children: [
        { index: true, element: <Navigate to="/hallinta/omat" replace /> },
        { path: 'omat', element: <ProfileSettingsPage /> },
        { path: 'global-admin', element: <GlobalAdminPage /> },
        { path: 'yritys', element: <CompanySettingsPage /> },
        { path: 'tilaajat', element: <SubscribersPage /> },
        { path: 'kayttajat', element: <UsersPage /> },
        { path: 'kumppanuudet', element: <PartnershipsPage /> },
        {
          path: 'kumppanilaskutus',
          element: <LicensedWorkReportBillingSummaryRoute session={session} />,
        },
      ],
    },
    { path: '/tyoraportit/tilaus/uusi', element: <PortalWorkOrderPage session={session} /> },
    { path: '/tyoraportit/tilaus/:id/muokkaa', element: <PortalWorkOrderPage session={session} /> },
    { path: '/tyoraportit/uusi', element: <LicensedWorkReportNewRoute session={session} /> },
    { path: '/tyoraportit/toimeksianto/uusi', element: <LicensedWorkReportOrderPage session={session} /> },
    { path: '/tyoraportit/toimeksianto/:id/muokkaa', element: <LicensedWorkReportOrderPage session={session} /> },
    { path: '/tyoraportit/:id/muokkaa', element: <LicensedWorkReportNewRoute session={session} /> },
    {
      path: '/tyoraportit/:id/laskutus/tuloste',
      element: <LicensedWorkReportPartnerBillingPrintPage session={session} />,
    },
    { path: '/tyoraportit/:id/tuloste', element: <LicensedWorkReportPrintPage session={session} /> },
    { path: '/tyoraportit/:id', element: <LicensedWorkReportDetailPage session={session} /> },
    { path: '/huoltoraportit', element: <LicensedMaintenanceReportsPage session={session} /> },
    { path: '/huoltoraportit/uusi', element: <LicensedMaintenanceReportEditPage session={session} /> },
    {
      path: '/huoltoraportit/:id/tuloste',
      element: <LicensedMaintenanceReportPrintPage session={session} />,
    },
    { path: '/huoltoraportit/:id', element: <LicensedMaintenanceReportEditPage session={session} /> },
    { path: '/tarjouspyynnot', element: <LicensedQuoteRequestHubPage session={session} /> },
    { path: '/tarjouspyynnot/lista', element: <LicensedQuoteRequestsPage session={session} /> },
    { path: '/tarjouspyynnot/laiterekisteri', element: <LicensedPumpDeviceRegistryPage session={session} /> },
    { path: '/tarjouspyynnot/uusi', element: <LicensedQuoteRequestEditPage session={session} /> },
    { path: '/tarjouspyynnot/:id/tuloste', element: <LicensedQuoteRequestPrintPage session={session} /> },
    { path: '/tarjouspyynnot/:id', element: <LicensedQuoteRequestEditPage session={session} /> },
    { path: '/asennus-suunnittelu', element: <LicensedInstallationPlanHubPage session={session} /> },
    { path: '/asennus-suunnittelu/lista', element: <LicensedInstallationPlansPage session={session} /> },
    { path: '/asennus-suunnittelu/uusi', element: <LicensedInstallationPlanEditPage session={session} /> },
    { path: '/asennus-suunnittelu/:id/tuloste', element: <LicensedInstallationPlanPrintPage session={session} /> },
    { path: '/asennus-suunnittelu/:id', element: <LicensedInstallationPlanEditPage session={session} /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ];
}
