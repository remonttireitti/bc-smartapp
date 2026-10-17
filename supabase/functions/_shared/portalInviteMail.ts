// Portaalitunnusten sähköposti (Resend). Älä koskaan lokita salasanaa tai API-avainta.
// deno-lint-ignore no-explicit-any
type Admin = any;

const APP_URL = 'https://bestcool.eu';
const FALLBACK_REPLY_TO = 'kotselainen@me.com';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Omistajayrityksen nimi ja vastausosoite (yrityksen ylläpitäjän sähköposti, muuten oletus). */
async function ownerInfo(admin: Admin, companyId: string): Promise<{ name: string; replyTo: string }> {
  const { data: company } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  const { data: admins } = await admin
    .from('profiles')
    .select('email, created_at')
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .not('email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1);
  const replyTo = String(admins?.[0]?.email ?? '').trim();
  return { name: String(company?.name ?? '').trim() || 'BC Smartapp', replyTo: replyTo.includes('@') ? replyTo : FALLBACK_REPLY_TO };
}

export async function sendPortalCredentialsMail(
  admin: Admin,
  p: { to: string; password: string; companyId: string; kind: 'customer' | 'subscriber'; isReset: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = (Deno.env.get('RESEND_API_KEY') || '').trim();
  if (!apiKey) return { ok: false, error: 'Sähköpostipalvelu ei ole käytössä' };
  const { name, replyTo } = await ownerInfo(admin, p.companyId);
  const portal = p.kind === 'subscriber' ? 'tilaajaportaaliin' : 'asiakasportaaliin';
  const title = p.isReset ? 'Uusi salasana' : 'Tunnukset portaaliin';
  const intro = p.isReset
    ? `${esc(name)} on luonut sinulle uuden salasanan ${portal}.`
    : `${esc(name)} on avannut sinulle tunnukset ${portal}. Portaalissa näet raportit ja voit lähettää työtilauksia.`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280">${k}</td><td style="padding:6px 0;font-weight:bold;font-family:Menlo,Consolas,monospace">${v}</td></tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;max-width:560px;margin:0 auto;padding:24px;border:1px solid #d9dde3;border-radius:6px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>
<td style="vertical-align:middle"><img src="${APP_URL}/pwa-192.png" width="32" height="32" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle;padding-left:8px;font-size:16px;color:#2f3135"><b>BC</b> Smartapp</td></tr></table>
<h2 style="font-size:20px;margin:0 0 12px">${title}</h2>
<p style="margin:0 0 16px">${intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse">
${row('Käyttäjätunnus', esc(p.to))}${row('Salasana', esc(p.password))}</table>
<p style="margin:0 0 20px"><a href="${APP_URL}/login" style="display:inline-block;background:#1f6f43;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Kirjaudu portaaliin</a></p>
<p style="margin:0;color:#6b7280;font-size:13px">Kysyttävää? Vastaa tähän viestiin, niin se menee yritykselle ${esc(name)}.</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'BC Smartapp <huolto@bestcool.eu>',
      to: [p.to],
      subject: p.isReset ? `Uusi salasana – ${name}` : `Portaalitunnukset – ${name}`,
      html,
      reply_to: replyTo,
    }),
  });
  if (res.ok) return { ok: true };
  console.warn('[portal-mail] send failed', res.status);
  return { ok: false, error: 'Sähköpostin lähetys epäonnistui' };
}
