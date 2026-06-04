import {
  assertGlobalAdminOrCron,
  corsHeaders,
  getAdminClient,
  insertPlatformAudit,
  jsonResponse,
} from '../_shared/platformAdminAuth.ts';

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
      return jsonResponse({ error: 'Lataus vaatii globaalin admin -kirjautumisen' }, 403);
    }

    const body = await req.json() as { snapshot_id?: string };
    const snapshotId = String(body.snapshot_id ?? '').trim();
    if (!snapshotId) {
      return jsonResponse({ error: 'snapshot_id puuttuu' }, 400);
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
      return jsonResponse({ error: 'Vain valmis varmuuskopio ladattavissa' }, 400);
    }

    const { data: signed, error: signError } = await admin.storage
      .from('platform-backups')
      .createSignedUrl(snapshot.storage_path, 3600);

    if (signError || !signed?.signedUrl) {
      return jsonResponse({ error: signError?.message ?? 'Allekirjoitus epäonnistui' }, 500);
    }

    await insertPlatformAudit(admin, {
      userId: auth.userId,
      action: 'backup.download',
      summary: `Varmuuskopio ladattiin: ${snapshot.file_name}`,
      entityType: 'platform_backup_snapshots',
      entityId: snapshot.id,
    });

    return jsonResponse({
      ok: true,
      url: signed.signedUrl,
      file_name: snapshot.file_name,
      expires_in: 3600,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lataus epäonnistui';
    return jsonResponse({ error: message }, 500);
  }
});
