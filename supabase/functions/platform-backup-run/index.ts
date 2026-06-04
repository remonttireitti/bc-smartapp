import {
  assertGlobalAdminOrCron,
  corsHeaders,
  getAdminClient,
  insertPlatformAudit,
  jsonResponse,
} from '../_shared/platformAdminAuth.ts';
import {
  BACKUP_RETENTION,
  PLATFORM_BACKUP_TABLES,
  PLATFORM_BACKUP_VERSION,
} from '../_shared/platformBackupTables.ts';

type BackupKind = 'daily' | 'weekly' | 'manual';

async function exportTable(admin: ReturnType<typeof getAdminClient>, table: string) {
  const { data, error } = await admin.from(table).select('*');
  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return { rows: [] as Record<string, unknown>[], skipped: true };
    }
    throw new Error(`${table}: ${error.message}`);
  }
  return { rows: (data ?? []) as Record<string, unknown>[], skipped: false };
}

async function pruneOldBackups(admin: ReturnType<typeof getAdminClient>, kind: BackupKind, keep: number) {
  const { data: rows } = await admin
    .from('platform_backup_snapshots')
    .select('id, storage_path')
    .eq('kind', kind)
    .eq('status', 'completed')
    .order('started_at', { ascending: false });

  const stale = (rows ?? []).slice(keep);
  if (stale.length === 0) return;

  const paths = stale.map((r) => r.storage_path as string);
  await admin.storage.from('platform-backups').remove(paths);
  await admin.from('platform_backup_snapshots').delete().in('id', stale.map((r) => r.id));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  try {
    const admin = getAdminClient();
    const auth = await assertGlobalAdminOrCron(req, admin);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const body = await req.json().catch(() => ({})) as { kind?: BackupKind };
    const kind: BackupKind = body.kind === 'weekly' || body.kind === 'manual' ? body.kind : 'daily';

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${kind}-${stamp}.json`;
    const storagePath = `${kind}/${fileName}`;

    const { data: snapshot, error: snapErr } = await admin
      .from('platform_backup_snapshots')
      .insert({
        kind,
        status: 'running',
        storage_path: storagePath,
        file_name: fileName,
        created_by: auth.userId,
      })
      .select('id')
      .single();

    if (snapErr || !snapshot) {
      return jsonResponse({ error: snapErr?.message ?? 'Snapshot-rivi epäonnistui' }, 500);
    }

    const tables: Record<string, unknown> = {};
    const tableCounts: Record<string, number> = {};

    for (const table of PLATFORM_BACKUP_TABLES) {
      const { rows, skipped } = await exportTable(admin, table);
      if (!skipped) {
        tables[table] = rows;
        tableCounts[table] = rows.length;
      }
    }

    const payload = {
      version: PLATFORM_BACKUP_VERSION,
      kind,
      created_at: new Date().toISOString(),
      table_counts: tableCounts,
      tables,
    };

    const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
    const { error: uploadError } = await admin.storage
      .from('platform-backups')
      .upload(storagePath, jsonBytes, {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      await admin
        .from('platform_backup_snapshots')
        .update({
          status: 'failed',
          error_message: uploadError.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', snapshot.id);
      return jsonResponse({ error: uploadError.message }, 500);
    }

    await admin
      .from('platform_backup_snapshots')
      .update({
        status: 'completed',
        byte_size: jsonBytes.byteLength,
        table_counts: tableCounts,
        completed_at: new Date().toISOString(),
      })
      .eq('id', snapshot.id);

    await pruneOldBackups(admin, 'daily', BACKUP_RETENTION.daily);
    await pruneOldBackups(admin, 'weekly', BACKUP_RETENTION.weekly);

    if (auth.userId) {
      await insertPlatformAudit(admin, {
        userId: auth.userId,
        action: 'backup.create',
        summary: `Varmuuskopio luotu (${kind})`,
        entityType: 'platform_backup_snapshots',
        entityId: snapshot.id,
        metadata: { kind, file_name: fileName, byte_size: jsonBytes.byteLength },
      });
    }

    return jsonResponse({
      ok: true,
      snapshot_id: snapshot.id,
      kind,
      file_name: fileName,
      byte_size: jsonBytes.byteLength,
      table_counts: tableCounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Varmuuskopio epäonnistui';
    return jsonResponse({ error: message }, 500);
  }
});
