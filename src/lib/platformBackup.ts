import { supabase } from './supabase';

export type PlatformBackupKind = 'daily' | 'weekly' | 'manual';

export type PlatformBackupSnapshot = {
  id: string;
  kind: PlatformBackupKind;
  status: 'running' | 'completed' | 'failed';
  storage_path: string;
  file_name: string;
  byte_size: number | null;
  table_counts: Record<string, number>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
};

async function invokePlatformBackup<T>(functionName: string, body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Ei kirjautumista');

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw new Error(error.message);
  const row = data as T & { error?: string };
  if (row && typeof row === 'object' && 'error' in row && row.error) {
    throw new Error(row.error);
  }
  return row;
}

export async function fetchPlatformBackupSnapshots(limit = 50) {
  const { data, error } = await supabase.rpc('global_admin_list_backup_snapshots', {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const payload = data as { rows: PlatformBackupSnapshot[] };
  return (payload.rows ?? []) as PlatformBackupSnapshot[];
}

export async function runPlatformBackup(kind: PlatformBackupKind) {
  return invokePlatformBackup<{
    ok: boolean;
    snapshot_id: string;
    byte_size: number;
    table_counts: Record<string, number>;
  }>('platform-backup-run', { kind });
}

export async function downloadPlatformBackup(snapshotId: string) {
  return invokePlatformBackup<{ ok: boolean; url: string; file_name: string }>(
    'platform-backup-download',
    { snapshot_id: snapshotId },
  );
}

export async function restorePlatformBackup(snapshotId: string) {
  return invokePlatformBackup<{ ok: boolean; restored: Record<string, number>; message: string }>(
    'platform-backup-restore',
    { snapshot_id: snapshotId, confirm: 'PALAUTA' },
  );
}
