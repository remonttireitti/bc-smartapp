/** Export/restore order respects FK dependencies (parents before children). */
export const PLATFORM_BACKUP_TABLES = [
  'companies',
  'company_partnerships',
  'profiles',
  'subscribers',
  'customers',
  'customer_partner_access',
  'equipment',
  'form_templates',
  'tools',
  'refrigerant_cylinders',
  'inventory_items',
  'trip_destinations',
  'work_reports',
  'work_report_billing',
  'work_report_daily_logs',
  'work_report_daily_expense_lines',
  'work_report_daily_log_details',
  'work_report_daily_log_images',
  'work_report_trip_legs',
  'work_report_attachments',
  'maintenance_reports',
  'maintenance_report_images',
  'quote_requests',
  'temp_devices',
  'temp_monitor_sessions',
  'temp_readings',
  'temp_monitor_reports',
  'vrf_devices',
  'vrf_readings',
  'monitor_reader_shares',
] as const;

export type PlatformBackupTable = (typeof PLATFORM_BACKUP_TABLES)[number];

export const PLATFORM_BACKUP_VERSION = 1;

export const BACKUP_RETENTION = {
  daily: 14,
  weekly: 8,
} as const;
