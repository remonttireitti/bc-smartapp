import {
  assertGlobalAdminOrCron,
  corsHeaders,
  getAdminClient,
  insertPlatformAudit,
  jsonResponse,
} from '../_shared/platformAdminAuth.ts';
import { PLATFORM_BACKUP_TABLES, PLATFORM_BACKUP_VERSION } from '../_shared/platformBackupTables.ts';

type BackupPayload = {
  version: number;
  kind: string;
  created_at: string;
  tables: Record<string, Record<string, unknown>[]>;
};

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

    if (!auth.userId) {
      return jsonResponse({ error: 'Palautus vaatii globaalin admin -kirjautumisen' }, 403);
    }

    const body = await req.json() as { snapshot_id?: string; confirm?: string };
    const snapshotId = String(body.snapshot_id ?? '').trim();
    const confirm = String(body.confirm ?? '').trim();

    if (!snapshotId) {
      return jsonResponse({ error: 'snapshot_id puuttuu' }, 400);
    }

    if (confirm !== 'PALAUTA') {
      return jsonResponse({ error: 'Kirjoita vahvistukseksi PALAUTA' }, 400);
    }

    const { data: snapshot, error: snapErr } = await admin
      .from('platform_backup_snapshots')
      .select('id, storage_path, file_name, status')
      .eq('id', snapshotId)
      .maybeSingle();

    if (snapErr || !snapshot) {
      return jsonResponse({ error: 'Varmuuskopiota ei löydy' }, 404);
    }

    if (snapshot.status !== 'completed') {
      return jsonResponse({ error: 'Vain valmis varmuuskopio voidaan palauttaa' }, 400);
    }

    const { data: blob, error: downloadError } = await admin.storage
      .from('platform-backups')
      .download(snapshot.storage_path);

    if (downloadError || !blob) {
      return jsonResponse({ error: downloadError?.message ?? 'Lataus epäonnistui' }, 500);
    }

    const text = await blob.text();
    const payload = JSON.parse(text) as BackupPayload;

    if (payload.version !== PLATFORM_BACKUP_VERSION || !payload.tables) {
      return jsonResponse({ error: 'Tuntematon varmuuskopiomuoto' }, 400);
    }

    const restored: Record<string, number> = {};
    const errors: string[] = [];

    for (const table of PLATFORM_BACKUP_TABLES) {
      const rows = payload.tables[table];
      if (!rows?.length) continue;

      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error: upsertError } = await admin.from(table).upsert(chunk, { onConflict: 'id' });
        if (upsertError) {
          errors.push(`${table}: ${upsertError.message}`);
          break;
        }
        restored[table] = (restored[table] ?? 0) + chunk.length;
      }
    }

    await insertPlatformAudit(admin, {
      userId: auth.userId,
      action: 'backup.restore',
      summary: `Varmuuskopio palautettiin: ${snapshot.file_name}`,
      entityType: 'platform_backup_snapshots',
      entityId: snapshot.id,
      metadata: { restored, errors },
    });

    if (errors.length > 0) {
      return jsonResponse({
        ok: false,
        restored,
        errors,
        message: 'Palautus keskeytyi virheeseen. Tarkista restored ja errors.',
      }, 400);
    }

    return jsonResponse({
      ok: true,
      restored,
      snapshot_id: snapshot.id,
      message: 'Palautus valmis. Käyttäjätilejä (auth) ei palautettu — vain liiketoimintadata.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Palautus epäonnistui';
    return jsonResponse({ error: message }, 500);
  }
});
