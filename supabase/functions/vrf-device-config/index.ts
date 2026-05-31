import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-key',
};

const defaultSettings = {
  auto_stop_enabled: true,
  auto_stop_below_outdoor_c: -15,
  auto_stop_outdoor_hysteresis_c: 2,
  auto_stop_outdoor_smooth_tau_min: 0,
  compressor_alarm_enable_after_s: 300,
  alarm_input_trigger_raw_level: 0,
  di2_trigger_raw_level: 1,
  di3_trigger_raw_level: 0,
  di4_trigger_raw_level: 1,
  di3_alarm_shutdown_enabled: true,
  alarm_limits: {
    hot_gas_high_c: 110,
    refrigerant_return_low_c: -20,
    refrigerant_delta_high_c: 25,
    refrigerant_delta_low_c: 1,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Vain GET' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const deviceKey =
      req.headers.get('x-device-key')?.trim() ||
      req.headers.get('X-Device-Key')?.trim() ||
      '';

    if (!deviceKey) {
      return new Response(JSON.stringify({ error: 'Puuttuva X-Device-Key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: device, error } = await admin
      .from('vrf_devices')
      .select('id, control_requested_enabled, control_updated_at, settings, settings_updated_at, heat_enabled')
      .eq('device_key', deviceKey)
      .maybeSingle();

    if (error || !device) {
      return new Response(JSON.stringify({ error: 'Tuntematon laite' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawSettings =
      device.settings && typeof device.settings === 'object' && !Array.isArray(device.settings)
        ? (device.settings as Record<string, unknown>)
        : null;

    const settings = rawSettings
      ? { ...defaultSettings, ...rawSettings }
      : { ...defaultSettings };

    if (rawSettings?.ota_request && typeof rawSettings.ota_request === 'object') {
      settings.ota_request = rawSettings.ota_request;
    }
    if (
      rawSettings?.alarm_shutdown_reset &&
      typeof rawSettings.alarm_shutdown_reset === 'object'
    ) {
      settings.alarm_shutdown_reset = rawSettings.alarm_shutdown_reset;
    }

    const controlEnabled =
      device.control_requested_enabled ?? device.heat_enabled ?? false;

    return new Response(
      JSON.stringify({
        control: {
          enabled: controlEnabled,
          updated_at: device.control_updated_at,
        },
        settings,
        settings_updated_at: device.settings_updated_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Virhe';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
