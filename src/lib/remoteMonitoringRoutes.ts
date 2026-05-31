/** Etäohjaus ja seuranta — reitit */
export const REMOTE_MONITORING_HUB = '/etaseuranta';
export const TEMP_MONITORING_BASE = '/etaseuranta/lampotila';
export const VRF_MONITORING_BASE = '/etaseuranta/vrf';

export function tempMonitoringDevicePath(deviceId: string): string {
  return `${TEMP_MONITORING_BASE}/${deviceId}`;
}

export function tempMonitoringReportPrintPath(reportId: string): string {
  return `${TEMP_MONITORING_BASE}/raportit/${reportId}/tuloste`;
}
