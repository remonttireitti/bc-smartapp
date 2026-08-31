import type { Equipment } from '../types';
import { normalizeHuoltoReportData } from './huoltoRaportti/defaults';
import { buildHuoltoEquipmentTechnicalSnapshot } from './huoltoRaportti/equipmentSnapshot';
import type { HuoltoReportData } from './huoltoRaportti/types';

export type MaintenanceReportForEquipmentSync = {
  id: string;
  customer_id: string | null;
  equipment_id: string | null;
  status: string;
  data: unknown;
  updated_at: string;
  completed_at: string | null;
  created_at: string;
};

const trim = (value: unknown) => String(value ?? '').trim();

export function huoltoReportMatchesEquipment(data: HuoltoReportData, eq: Equipment): boolean {
  const deviceTag = trim(eq.tag || eq.name);
  const deviceSerial = trim(eq.serial_number);
  const reportTag = trim(data.laiteTunnus);
  const reportSerial = trim(data.laiteSarjanumero);

  if (deviceTag && reportTag && deviceTag === reportTag) return true;
  if (deviceSerial && reportSerial && deviceSerial === reportSerial) return true;
  if (deviceSerial && reportTag && deviceSerial === reportTag) return true;
  if (deviceTag && reportSerial && deviceTag === reportSerial) return true;
  return false;
}

function reportStatusRank(status: string): number {
  if (status === 'submitted') return 2;
  if (status === 'draft') return 1;
  return 0;
}

export function maintenanceReportSortMs(row: MaintenanceReportForEquipmentSync): number {
  if (row.completed_at) return Date.parse(row.completed_at);
  return Date.parse(row.updated_at || row.created_at);
}

export function compareMaintenanceReportsForEquipmentSync(
  a: MaintenanceReportForEquipmentSync,
  b: MaintenanceReportForEquipmentSync,
): number {
  const statusCmp = reportStatusRank(b.status) - reportStatusRank(a.status);
  if (statusCmp !== 0) return statusCmp;
  return maintenanceReportSortMs(b) - maintenanceReportSortMs(a);
}

export function findLatestMaintenanceReportForEquipment(
  equipment: Equipment,
  reports: MaintenanceReportForEquipmentSync[],
): MaintenanceReportForEquipmentSync | null {
  const linked = reports.filter((row) => row.equipment_id === equipment.id);
  if (linked.length > 0) {
    return [...linked].sort(compareMaintenanceReportsForEquipmentSync)[0] ?? null;
  }

  const matched = reports.filter((row) => {
    if (row.customer_id !== equipment.customer_id) return false;
    const data = normalizeHuoltoReportData(row.data as HuoltoReportData);
    return huoltoReportMatchesEquipment(data, equipment);
  });
  if (matched.length === 0) return null;
  return [...matched].sort(compareMaintenanceReportsForEquipmentSync)[0] ?? null;
}

export function snapshotHasTechnicalData(snapshot: Record<string, unknown> | null | undefined): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const keys = [
    'kylmaaineTyyppi',
    'kylmaaineLaatu',
    'kylmaaineMaaraYhteensa',
    'kylmaaineCO2Ekv',
    'laiteKayttotarkoitus',
    'kp1Data',
    'kp2Data',
    'kp3Data',
    'evaporatorData',
    'condenserData',
    'mlpData',
    'ulkoyksikko',
    'sisayksikko',
    'konvektorit',
    'nestelauhduttimetVj',
  ];
  return keys.some((key) => {
    const value = snapshot[key];
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return trim(value).length > 0;
  });
}

export function buildEquipmentUpdateFromHuoltoReport(
  reportData: HuoltoReportData,
  equipment: Pick<Equipment, 'tag' | 'name' | 'model' | 'serial_number' | 'location' | 'device_type'>,
): {
  snapshot: Record<string, unknown>;
  device_type: string | null;
  tag?: string | null;
  model?: string | null;
  serial_number?: string | null;
  location?: string | null;
} {
  const normalized = normalizeHuoltoReportData(reportData);
  const snapshot = buildHuoltoEquipmentTechnicalSnapshot(normalized);
  const patch: ReturnType<typeof buildEquipmentUpdateFromHuoltoReport> = {
    snapshot,
    device_type: trim(normalized.laiteTyyppi) || equipment.device_type || null,
  };

  const reportTag = trim(normalized.laiteTunnus);
  const reportModel = trim(normalized.laiteMalli);
  const reportSerial = trim(normalized.laiteSarjanumero);
  const reportLocation = trim(normalized.laiteSijainti);

  if (!trim(equipment.tag) && reportTag) patch.tag = reportTag;
  if (!trim(equipment.model) && reportModel) patch.model = reportModel;
  if (!trim(equipment.serial_number) && reportSerial) patch.serial_number = reportSerial;
  if (!trim(equipment.location) && reportLocation) patch.location = reportLocation;

  return patch;
}
