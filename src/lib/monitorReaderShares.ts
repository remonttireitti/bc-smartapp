import { supabase } from './supabase';

export type MonitorShareKind = 'vrf' | 'temp';

export type MonitorReaderShare = {
  id: string;
  company_id: string;
  kind: MonitorShareKind;
  vrf_device_id: string | null;
  temp_device_id: string | null;
  access_token: string;
  label: string | null;
  viewer_user_id: string | null;
  enabled: boolean;
  expires_at: string | null;
  created_at: string;
};

export const MONITOR_READER_SHARE_SELECT =
  'id, company_id, kind, vrf_device_id, temp_device_id, access_token, label, viewer_user_id, enabled, expires_at, created_at';

export function monitorReaderSharePath(token: string): string {
  return `/seuranta/luku/${token}`;
}

export function monitorReaderShareUrl(token: string): string {
  if (typeof window === 'undefined') return monitorReaderSharePath(token);
  return `${window.location.origin}${monitorReaderSharePath(token)}`;
}

export function monitorReaderHubPath(): string {
  return '/etaseuranta/luku';
}

export function monitorReaderVrfPath(deviceId: string): string {
  return `/etaseuranta/luku/vrf/${deviceId}`;
}

export function isMonitorViewerRole(role: string | null | undefined): boolean {
  return role === 'monitor_viewer';
}

export async function fetchMonitorSharesForVrfDevice(deviceId: string): Promise<MonitorReaderShare[]> {
  const { data, error } = await supabase
    .from('monitor_reader_shares')
    .select(MONITOR_READER_SHARE_SELECT)
    .eq('kind', 'vrf')
    .eq('vrf_device_id', deviceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as MonitorReaderShare[] | null) ?? [];
}

export async function fetchMonitorSharesForViewer(): Promise<MonitorReaderShare[]> {
  const { data, error } = await supabase
    .from('monitor_reader_shares')
    .select(MONITOR_READER_SHARE_SELECT)
    .eq('enabled', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as MonitorReaderShare[] | null) ?? [];
}

/** Kirjautuneen katsojan jakotoken VRF-laitteelle (trendi/raportti edge functionin kautta). */
export async function fetchViewerShareTokenForVrfDevice(
  deviceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('monitor_reader_shares')
    .select('access_token')
    .eq('kind', 'vrf')
    .eq('vrf_device_id', deviceId)
    .eq('enabled', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.access_token ? String(data.access_token) : null;
}

export type CreateMonitorShareInput = {
  kind: MonitorShareKind;
  device_id: string;
  label?: string;
  expires_at?: string | null;
  viewer_email?: string;
  viewer_password?: string;
  viewer_display_name?: string;
};

export async function createMonitorShare(input: CreateMonitorShareInput) {
  const { data, error } = await supabase.functions.invoke('create-monitor-share', { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as {
    ok: boolean;
    share_id: string;
    access_token: string;
    label: string | null;
    viewer_user_id: string | null;
    expires_at: string | null;
  };
}

export async function setMonitorShareEnabled(shareId: string, enabled: boolean) {
  const { error } = await supabase.from('monitor_reader_shares').update({ enabled }).eq('id', shareId);
  if (error) throw new Error(error.message);
}

export async function regenerateMonitorShareToken(shareId: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const { data, error } = await supabase
    .from('monitor_reader_shares')
    .update({ access_token: token })
    .eq('id', shareId)
    .select('access_token')
    .single();
  if (error) throw new Error(error.message);
  return String(data.access_token);
}

export type MonitorShareViewBundle = {
  share: { id: string; kind: MonitorShareKind; label: string | null };
  device: Record<string, unknown>;
  readings: Record<string, unknown>[];
};

export type MonitorShareViewOptions = {
  hours?: number;
  start?: string;
  end?: string;
};

function buildMonitorShareViewBody(token: string, hoursOrOptions: number | MonitorShareViewOptions = 24) {
  if (typeof hoursOrOptions === 'number') {
    return { token, hours: hoursOrOptions };
  }
  if (hoursOrOptions.start && hoursOrOptions.end) {
    return { token, start: hoursOrOptions.start, end: hoursOrOptions.end };
  }
  return { token, hours: hoursOrOptions.hours ?? 24 };
}

export async function loadMonitorShareView(
  token: string,
  hoursOrOptions: number | MonitorShareViewOptions = 24,
): Promise<MonitorShareViewBundle> {
  const { data, error } = await supabase.functions.invoke('monitor-share-view', {
    body: buildMonitorShareViewBody(token, hoursOrOptions),
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as MonitorShareViewBundle;
}

export function monitorShareViewFunctionUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/monitor-share-view`;
}

/** Julkinen token-näkymä ilman kirjautumista (anon key + edge function). */
export async function loadMonitorShareViewPublic(
  token: string,
  hoursOrOptions: number | MonitorShareViewOptions = 24,
): Promise<MonitorShareViewBundle> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(monitorShareViewFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify(buildMonitorShareViewBody(token, hoursOrOptions)),
  });
  const data = (await response.json()) as MonitorShareViewBundle & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? 'Jaetun seurannan lataus epäonnistui');
  }
  return data;
}
