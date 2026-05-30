import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import type { Plugin } from 'vite';

import { calculateTripLegDistances } from './src/lib/openRouteServiceCore';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function getSupabaseKeys() {
  return {
    url: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

export function tripDistancePlugin(): Plugin {
  return {
    name: 'calculate-trip-distance-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/calculate-trip-distance' || req.method !== 'POST') {
          next();
          return;
        }

        try {
          const authHeader = req.headers.authorization;
          if (!authHeader) {
            sendJson(res, 401, { error: 'Ei kirjautumista' });
            return;
          }

          const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim();
          if (!apiKey) {
            sendJson(res, 500, {
              error: 'OPENROUTESERVICE_API_KEY puuttuu .env-tiedostosta (dev-reittilaskenta).',
            });
            return;
          }

          const { url, anonKey } = getSupabaseKeys();
          if (!anonKey) {
            sendJson(res, 500, { error: 'VITE_SUPABASE_ANON_KEY puuttuu.' });
            return;
          }

          const userClient = createClient(url, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });

          const { data: authData, error: authError } = await userClient.auth.getUser();
          if (authError || !authData.user) {
            sendJson(res, 401, { error: 'Kirjautuminen epäonnistui' });
            return;
          }

          const { data: profile } = await userClient
            .from('profiles')
            .select('role')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (profile?.role === 'customer' || profile?.role === 'subscriber') {
            sendJson(res, 403, { error: 'Ei oikeutta laskea ajomatkoja.' });
            return;
          }

          const body = JSON.parse(await readBody(req)) as { legs?: { from?: string; to?: string }[] };
          const legs = Array.isArray(body.legs) ? body.legs : [];
          if (legs.length === 0) {
            sendJson(res, 400, { error: 'Anna vähintään yksi reittipätkä.' });
            return;
          }

          const results = await calculateTripLegDistances(
            apiKey,
            legs.map((leg) => ({ from: String(leg.from ?? ''), to: String(leg.to ?? '') })),
          );

          sendJson(res, 200, { results });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Reittilaskenta epäonnistui.';
          sendJson(res, 500, { error: message });
        }
      });
    },
  };
}
