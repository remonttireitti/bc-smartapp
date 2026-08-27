# AGENTS.md

## Cursor Cloud specific instructions

BC Smartapp is a Vite + React 19 + TypeScript PWA frontend backed by a **local Supabase stack running in Docker** (Postgres, Auth, Storage, Studio, Edge Functions). There is no separate backend server — the app talks directly to Supabase. UI text is in Finnish.

The update script only runs `npm install`. Docker, the Supabase stack, and the dev server are **not** started automatically — a future agent must start them each session as described below.

### Start the backend (local Supabase) — required before running or testing the app

1. Start the Docker daemon (not running by default in a fresh session):
   - `sudo dockerd` (run it in a background tmux session; it must stay running)
   - The `ubuntu` user is in the `docker` group, but if `docker ps` gives a permission error, run `sudo chmod 666 /var/run/docker.sock`.
   - Docker is configured with the `fuse-overlayfs` storage driver and `iptables-legacy` (see `/etc/docker/daemon.json`); this is required in this VM.
2. Start Supabase: `npm run db:start` (aka `npx supabase start`). First run pulls images and can take a few minutes.
3. Create the local `.env` (gitignored, so it may not persist between sessions). It uses the **fixed well-known local anon key**:
   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
   ```
   If in doubt, get keys from `npx supabase status -o json` (`ANON_KEY`).
4. Seed dev users: `npm run setup:dev`. Creates 4 admin logins (password `test123456`): `admin@x.test`, `admin@y.test`, `admin@z.test`, `admin@t.test`. Re-run this after any `npm run db:reset`.

Useful URLs: app `http://localhost:5173`, Supabase API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, Mailpit `http://127.0.0.1:54324`.

### Run / lint / test / build

- Dev server: `npm run dev` (Vite on port 5173). Requires `.env` + running Supabase.
- Typecheck (this repo has no separate lint script; `tsc` is the check): `npx tsc -b`.
- Build (production): `npm run build` — runs `check-build-env.mjs` which **requires a production `supabase.co` `VITE_SUPABASE_URL`** and will fail against the local URL. Use `npx tsc -b` to validate types locally instead of the full build.
- Integration test scripts (`npm run test:*`, e.g. `test:device-draft`) run against the local Supabase via `tsx` and require the stack to be up.

### Gotchas

- `npm run setup:dev` stops the `imgproxy` and `pooler` containers as a side effect; this is expected and harmless for app development.
- Migrations in `supabase/migrations/` are applied automatically by `npm run db:start`. `supabase/seed.sql` is only comments — real dev data comes from `npm run setup:dev`.
- The `firmware/` and `tempmonitor/` dirs are ESP32/PlatformIO device code, unrelated to the web app; ignore for normal web development.
