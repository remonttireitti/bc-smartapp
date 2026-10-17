/**
 * Julkinen tilauslomake ja globaalin adminin hyväksyntä.
 * POST { action: 'config' | 'submit' | 'approve' | 'reject', ... }
 * - config/submit: ei kirjautumista (roskapostisuoja: hunajapurkki, minimiaika, IP-rajoitus).
 * - approve/reject: globaali admin (Authorization: Bearer <käyttäjän JWT>).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  ADDON_MODULES,
  ADDON_MODULE_LABELS,
  HUOLTO_KEYS,
  HUOLTO_LABELS,
  STAFF_ROLE_LABELS,
  cleanSignup,
  estimateMonthly,
  formatEur,
  normalizeRoles,
  parsePriceList,
  primaryRole,
  signupSelection,
  validateSignup,
  type SignupForm,
  billingPeriodLabel,
  normalizeBillingPeriod,
  periodPrice,
} from '../_shared/companySignupCore.ts';

const APP_URL = 'https://bestcool.eu';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /company_signup_requests/.test(error.message ?? '') && /exist|schema cache/i.test(error.message ?? '');
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendMail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = (Deno.env.get('SIGNUP_RESEND_API_KEY') || Deno.env.get('RESEND_API_KEY') || '').trim();
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY puuttuu' };
  const replyTo = (Deno.env.get('SIGNUP_REPLY_TO') || 'kotselainen@me.com').trim();
  const senders = [
    (Deno.env.get('SIGNUP_MAIL_FROM') || 'BC Smartapp <huolto@bestcool.eu>').trim(),
    (Deno.env.get('RESEND_FROM') || '').trim(),
  ].filter((s, i, a) => s && a.indexOf(s) === i);
  let lastError = '';
  for (const from of senders) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, reply_to: replyTo }),
    });
    if (res.ok) return { ok: true };
    lastError = `${res.status} ${(await res.text()).slice(0, 300)}`;
    console.warn('[company-signup] mail failed', from, lastError);
  }
  return { ok: false, error: lastError };
}

function mailShell(title: string, body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;max-width:560px;margin:0 auto;padding:24px;border:1px solid #d9dde3;border-radius:6px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>
<td style="vertical-align:middle"><img src="${APP_URL}/pwa-192.png" width="32" height="32" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle;padding-left:8px;font-size:16px;color:#2f3135"><b>BC</b> Smartapp</td></tr></table>
<h2 style="font-size:20px;margin:0 0 12px">${esc(title)}</h2>${body}</div>`;
}

async function loadPrices(admin: SupabaseClient) {
  const { data } = await admin.from('license_catalog').select('*').eq('id', 1).maybeSingle();
  return parsePriceList(data);
}

async function requireGlobalAdmin(req: Request, admin: SupabaseClient): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await admin.from('profiles').select('is_global_admin').eq('id', data.user.id).maybeSingle();
  const metaAdmin = (data.user.app_metadata as Record<string, unknown> | undefined)?.is_global_admin === true;
  return profile?.is_global_admin === true || metaAdmin ? data.user.id : null;
}

function selectionLines(form: Pick<SignupForm, 'modules' | 'huolto'>): string[] {
  return [
    ...ADDON_MODULES.filter((k) => form.modules[k]).map((k) => ADDON_MODULE_LABELS[k]),
    ...HUOLTO_KEYS.filter((k) => form.huolto[k]).map((k) => HUOLTO_LABELS[k]),
  ];
}

async function handleSubmit(req: Request, body: Record<string, unknown>, admin: SupabaseClient) {
  // Hunajapurkki ja liian nopea lähetys: vastataan "ok", ei tallenneta.
  if (String(body.website ?? '').trim()) return json({ ok: true });
  const startedAt = Number(body.started_at ?? 0);
  if (!startedAt || Date.now() - startedAt < 4000) return json({ ok: true });

  const form = cleanSignup((body.form ?? {}) as SignupForm);
  const errors = validateSignup(form);
  if (Object.keys(errors).length) return json({ error: 'Tarkista lomakkeen tiedot', fields: errors }, 400);

  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.slice(-16) ?? '';
  const ipHash = ip ? await sha256(`${salt}:${ip}`) : null;
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();

  if (ipHash) {
    const { count, error } = await admin
      .from('company_signup_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', hourAgo);
    if (isMissingTable(error)) return json({ error: 'Tilaus ei ole vielä käytössä' }, 503);
    if ((count ?? 0) >= 3) return json({ error: 'Liian monta tilausta. Yritä myöhemmin uudelleen.' }, 429);
  }
  const { count: total } = await admin
    .from('company_signup_requests')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', hourAgo);
  if ((total ?? 0) >= 30) return json({ error: 'Liian monta tilausta. Yritä myöhemmin uudelleen.' }, 429);

  const { data: dup } = await admin
    .from('company_signup_requests')
    .select('id')
    .eq('business_id', form.business_id)
    .eq('status', 'pending')
    .limit(1);
  if (dup && dup.length) return json({ error: 'Tällä Y-tunnuksella on jo käsiteltävä tilaus.' }, 409);

  const prices = await loadPrices(admin);
  const monthlyEstimate = estimateMonthly(signupSelection(form), prices);
  // Laskutusjakso tallennetaan estimate-kenttään (annual_billing.sql vie sen yrityksen lisenssiin hyväksynnässä).
  const billingInterval = normalizeBillingPeriod(form.billing_interval);
  const estimate = {
    ...monthlyEstimate,
    billing_interval: billingInterval,
    period: periodPrice(monthlyEstimate.net, billingInterval, prices),
  };

  const { data: row, error: insertError } = await admin
    .from('company_signup_requests')
    .insert({
      company_name: form.company_name,
      business_id: form.business_id,
      address: form.address,
      postal_code: form.postal_code,
      city: form.city,
      contact_name: form.contact_name,
      email: form.email,
      phone: form.phone,
      modules: form.modules,
      huolto: form.huolto,
      users: form.users,
      message: form.message,
      estimate,
      ip_hash: ipHash,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    })
    .select('id')
    .single();
  if (isMissingTable(insertError)) return json({ error: 'Tilaus ei ole vielä käytössä' }, 503);
  if (insertError || !row) return json({ error: 'Tallennus epäonnistui' }, 500);

  const adminEmail = (Deno.env.get('SIGNUP_ADMIN_EMAIL') || 'kotselainen@me.com').trim();
  const usersHtml = form.users
    .map((u) => `<li>${esc(u.name)} – ${esc(u.email)}${u.phone ? `, ${esc(u.phone)}` : ''} (${u.roles.map((r) => STAFF_ROLE_LABELS[r]).join(', ')})</li>`)
    .join('');
  const html = mailShell(
    `Uusi tilaus: ${form.company_name}`,
    `<p style="font-size:15px;line-height:1.5">${esc(form.company_name)} (${esc(form.business_id)})<br>${esc(form.address)}, ${esc(form.postal_code)} ${esc(form.city)}<br>
${esc(form.contact_name)}, ${esc(form.email)}, ${esc(form.phone)}</p>
<p style="font-size:15px"><b>Moduulit:</b> ${esc(selectionLines(form).join(', ') || '–')}</p>
<p style="font-size:15px"><b>Käyttäjät:</b></p><ul style="font-size:14px">${usersHtml}</ul>
<p style="font-size:15px"><b>Arvio:</b> ${formatEur(estimate.net)}/kk alv 0 % (${formatEur(estimate.gross)}/kk sis. alv 25,5 %)</p>
${form.message ? `<p style="font-size:14px;white-space:pre-wrap">${esc(form.message)}</p>` : ''}
<p style="margin:20px 0"><a href="${APP_URL}/palvelu/tilaukset/${row.id}" style="background:#1f4e79;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;display:inline-block">Avaa tilaus</a></p>`,
  );
  const mail = await sendMail(adminEmail, `Uusi tilaus: ${form.company_name}`, html);
  if (!mail.ok) console.error('[company-signup] admin mail failed', mail.error);

  return json({ ok: true });
}

type InviteResult = { email: string; status: 'invited' | 'exists' | 'error'; user_id?: string; error?: string };

/** Y-tunnus 1234567-8 → ALV-numero FI12345678 (vain jos kenttä on tyhjä). */
function vatIdFromBusinessId(businessId: string): string | null {
  const m = /^(\d{7})-(\d)$/.exec(businessId.trim());
  return m ? `FI${m[1]}${m[2]}` : null;
}

/** Tilauksesta johdetut kentät, joita company_signup_create_company ei aseta: ALV-numero ja yhteyshenkilö. */
async function fillDerivedCompanyFields(admin: SupabaseClient, companyId: string, request: Record<string, unknown>) {
  const { data } = await admin.from('companies').select('settings').eq('id', companyId).maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const billing = (settings.billing ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...settings };
  let changed = false;
  const vatId = vatIdFromBusinessId(String(request.business_id ?? ''));
  if (vatId && !String(billing.vat_id ?? '').trim()) {
    next.billing = { ...billing, vat_id: vatId };
    changed = true;
  }
  if (!settings.contact) {
    next.contact = {
      name: String(request.contact_name ?? '').trim(),
      email: String(request.email ?? '').trim(),
      phone: String(request.phone ?? '').trim(),
    };
    changed = true;
  }
  if (!changed) return;
  const { error } = await admin.from('companies').update({ settings: next }).eq('id', companyId);
  if (error) console.warn('[company-signup] vat_id', error.message);
}

/** Profiili yritykseen roolein; palauttaa virheviestin tai null. */
async function attachProfile(
  admin: SupabaseClient,
  p: { userId: string; companyId: string; role: string; roles: string[]; email: string; displayName: string; phone: string },
): Promise<string | null> {
  // Luotettava kutsutieto (vain palvelin voi kirjoittaa app_metadataa).
  const { error: metaError } = await admin.auth.admin.updateUserById(p.userId, {
    app_metadata: { company_id: p.companyId, role: p.role },
  });
  if (metaError) console.warn('[company-signup] app_metadata', metaError.message);
  const { error: upsertError } = await admin
    .from('profiles')
    .upsert(
      { id: p.userId, company_id: p.companyId, role: p.role, email: p.email, display_name: p.displayName },
      { onConflict: 'id' },
    );
  if (upsertError) return `Profiili: ${upsertError.message}`;
  const { error: rolesError } = await admin.from('profiles').update({ staff_roles: p.roles }).eq('id', p.userId);
  if (rolesError) return `Roolit: ${rolesError.message}`;
  if (p.phone) {
    // profiles.phone tulee order_contact.sql:llä; ennen sitä ohitetaan hiljaa.
    const { error: phoneError } = await admin.from('profiles').update({ phone: p.phone }).eq('id', p.userId);
    if (phoneError) console.warn('[company-signup] phone', phoneError.message);
  }
  return null;
}

async function handleApprove(body: Record<string, unknown>, admin: SupabaseClient, actorId: string) {
  const requestId = String(body.request_id ?? '');
  const { data: request, error } = await admin.from('company_signup_requests').select('*').eq('id', requestId).maybeSingle();
  if (error || !request) return json({ error: 'Tilausta ei löydy' }, 404);
  if (request.status === 'rejected') return json({ error: 'Tilaus on hylätty' }, 400);

  const { data: companyId, error: createError } = await admin.rpc('company_signup_create_company', { p_request_id: requestId });
  if (createError || !companyId) return json({ error: createError?.message ?? 'Yrityksen luonti epäonnistui' }, 500);

  await fillDerivedCompanyFields(admin, companyId, request);

  const previous: InviteResult[] = Array.isArray(request.invite_results?.users) ? request.invite_results.users : [];
  const results: InviteResult[] = [];
  const users = Array.isArray(request.users) ? request.users : [];
  for (const raw of users) {
    const email = String(raw?.email ?? '').trim().toLowerCase();
    if (!email) continue;
    const done = previous.find((p) => p.email === email && p.status === 'invited');
    if (done) {
      results.push(done);
      continue;
    }
    const roles = normalizeRoles(raw?.roles);
    const role = primaryRole(roles);
    const displayName = String(raw?.name ?? '').trim() || email.split('@')[0];
    // Edellisellä kerralla kutsu meni läpi mutta profiili jäi kesken: ei kutsuta uudelleen, korjataan profiili.
    let userId = previous.find((p) => p.email === email && p.user_id)?.user_id ?? null;
    if (!userId) {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { company_id: companyId, role, display_name: displayName, staff_roles: roles },
        redirectTo: `${APP_URL}/aseta-uusi-salasana`,
      });
      if (inviteError || !invited?.user) {
        const msg = inviteError?.message ?? 'Kutsu epäonnistui';
        if (/already|registered|exists/i.test(msg)) {
          // Tunnus on jo tässä yrityksessä (esim. keskeytynyt hyväksyntä) → valmis.
          const { data: own } = await admin
            .from('profiles')
            .select('id')
            .eq('company_id', companyId)
            .eq('email', email)
            .maybeSingle();
          results.push(own?.id ? { email, status: 'invited', user_id: own.id } : { email, status: 'exists', error: msg });
        } else {
          results.push({ email, status: 'error', error: msg });
        }
        continue;
      }
      userId = invited.user.id;
    }
    const phone = String(raw?.phone ?? '').trim();
    const profileError = await attachProfile(admin, { userId, companyId, role, roles, email, displayName, phone });
    results.push(profileError ? { email, status: 'error', user_id: userId, error: profileError } : { email, status: 'invited', user_id: userId });
  }

  let demo: unknown = request.invite_results?.demo ?? null;
  if (!demo) {
    const creator = results.find((r) => r.status === 'invited' && r.user_id)?.user_id ?? null;
    const { data: seeded, error: seedError } = await admin.rpc('onboarding_demo_seed', {
      p_company_id: companyId,
      p_user_id: creator,
    });
    demo = seedError ? { ok: false, error: seedError.message } : seeded;
  }

  let contactMail: unknown = request.invite_results?.contact_mail ?? null;
  if (!(contactMail as { ok?: boolean } | null)?.ok) {
    contactMail = await sendApprovedMail(admin, request, companyId, results);
  }

  const inviteResults = { users: results, demo, contact_mail: contactMail };
  const { error: saveError } = await admin
    .from('company_signup_requests')
    .update({
      status: 'approved',
      decided_at: request.decided_at ?? new Date().toISOString(),
      decided_by: request.decided_by ?? actorId,
      company_id: companyId,
      invite_results: inviteResults,
    })
    .eq('id', requestId);
  if (saveError) console.error('[company-signup] request update', saveError.message);

  return json({ ok: true, company_id: companyId, invite_results: inviteResults });
}

/** "Tilaus hyväksytty" tilauksen yhteyshenkilölle (kerran; tulos invite_results.contact_mail). */
async function sendApprovedMail(
  admin: SupabaseClient,
  request: Record<string, unknown>,
  companyId: string,
  results: InviteResult[],
): Promise<{ ok: boolean; error?: string; at: string }> {
  const to = String(request.email ?? '').trim();
  const at = new Date().toISOString();
  if (!to) return { ok: false, error: 'Sähköposti puuttuu', at };
  const prices = await loadPrices(admin);
  const { data: breakdown } = await admin.rpc('company_monthly_price_breakdown', { p_company_id: companyId });
  const b = (breakdown ?? {}) as {
    net?: number;
    gross?: number;
    billing_interval?: string;
    period_net?: number;
    period_gross?: number;
    discount_pct?: number;
  };
  const period = normalizeBillingPeriod(b.billing_interval);
  const periodRow = period !== 'monthly' && Number.isFinite(Number(b.period_net))
    ? `<tr><td style="${'padding:4px 12px 4px 0;font-size:15px;vertical-align:top;color:#6b7280;white-space:nowrap'}">Laskutusjakso</td><td style="${'padding:4px 12px 4px 0;font-size:15px;vertical-align:top'}">${esc(billingPeriodLabel(period))}: ${formatEur(Number(b.period_net))} alv 0 % (${formatEur(Number(b.period_gross))} sis. alv 25,5 %), alennus ${Number(b.discount_pct ?? 0).toLocaleString('fi-FI')} %</td></tr>`
    : '';
  const net = Number(b.net);
  const gross = Number(b.gross);
  const modules = ['Peruspaketti', ...selectionLines({
    modules: (request.modules ?? {}) as SignupForm['modules'],
    huolto: (request.huolto ?? {}) as SignupForm['huolto'],
  })];
  const invited = results.filter((r) => r.status === 'invited').map((r) => r.email);
  const p = 'font-size:15px;line-height:1.5;margin:0 0 12px';
  const td = 'padding:4px 12px 4px 0;font-size:15px;vertical-align:top';
  const th = `${td};color:#6b7280;white-space:nowrap`;
  const html = mailShell(
    'Tilaus hyväksytty',
    `<p style="${p}">Hei ${esc(request.contact_name)},</p>
<p style="${p}">BC Smartapp -tilauksenne yritykselle <b>${esc(request.company_name)}</b> on hyväksytty.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-collapse:collapse">
<tr><td style="${th}">Moduulit</td><td style="${td}">${esc(modules.join(', '))}</td></tr>
${periodRow}
${Number.isFinite(net) ? `<tr><td style="${th}">Kuukausihinta</td><td style="${td}">${formatEur(net)}/kk alv 0 % (${formatEur(Number.isFinite(gross) ? gross : net)}/kk sis. alv 25,5 %)</td></tr>` : ''}
<tr><td style="${th}">Kokeilujakso</td><td style="${td}">${prices.trial_days} päivää maksutta, alkaa ensimmäisestä kirjautumisesta</td></tr>
</table>
${invited.length ? `<p style="${p}">Kutsut lähetettiin käyttäjille: ${esc(invited.join(', '))}. Kukin asettaa salasanansa kutsuviestin linkistä.</p>` : ''}
<p style="margin:20px 0"><a href="${APP_URL}" style="background:#2f3135;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;display:inline-block">Kirjaudu: bestcool.eu</a></p>
<p style="font-size:14px;color:#6b7280;margin:16px 0 0">Kysyttävää? kotselainen@me.com</p>`,
  );
  const mail = await sendMail(to, `Tilaus hyväksytty: ${String(request.company_name ?? '')}`, html);
  if (!mail.ok) console.error('[company-signup] approved mail failed', mail.error);
  return { ok: mail.ok, error: mail.error, at };
}

async function handleReject(body: Record<string, unknown>, admin: SupabaseClient, actorId: string) {
  const requestId = String(body.request_id ?? '');
  const reason = String(body.reason ?? '').trim().slice(0, 1000);
  const { data: request } = await admin.from('company_signup_requests').select('*').eq('id', requestId).maybeSingle();
  if (!request) return json({ error: 'Tilausta ei löydy' }, 404);
  if (request.status !== 'pending') return json({ error: 'Tilaus on jo käsitelty' }, 400);

  const { error } = await admin
    .from('company_signup_requests')
    .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: actorId, reject_reason: reason || null })
    .eq('id', requestId);
  if (error) return json({ error: error.message }, 500);

  const html = mailShell(
    'Tilauksesi BC Smartappiin',
    `<p style="font-size:15px;line-height:1.5">Hei ${esc(request.contact_name)},</p>
<p style="font-size:15px;line-height:1.5">kiitos kiinnostuksestasi BC Smartappia kohtaan. Valitettavasti emme voi tällä kertaa avata tiliä yritykselle ${esc(request.company_name)}.</p>
${reason ? `<p style="font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(reason)}</p>` : ''}
<p style="font-size:15px;line-height:1.5">Jos haluat kysyä lisää, vastaa tähän viestiin.</p>
<p style="font-size:15px;line-height:1.5">Ystävällisin terveisin<br>BC Smartapp</p>`,
  );
  const mail = await sendMail(request.email, 'Tilauksesi BC Smartappiin', html);
  return json({ ok: true, mail_sent: mail.ok, mail_error: mail.ok ? undefined : mail.error });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (action === 'config') {
      const { error } = await admin.from('company_signup_requests').select('id', { head: true, count: 'exact' }).limit(1);
      if (error) return json({ enabled: false });
      return json({ enabled: true, prices: await loadPrices(admin) });
    }
    if (action === 'submit') return await handleSubmit(req, body, admin);

    if (action === 'approve' || action === 'reject') {
      const actorId = await requireGlobalAdmin(req, admin);
      if (!actorId) return json({ error: 'Vain globaali admin' }, 403);
      return action === 'approve' ? await handleApprove(body, admin, actorId) : await handleReject(body, admin, actorId);
    }
    return json({ error: 'Tuntematon toiminto' }, 400);
  } catch (err) {
    console.error('[company-signup]', err);
    return json({ error: err instanceof Error ? err.message : 'Virhe' }, 500);
  }
});
