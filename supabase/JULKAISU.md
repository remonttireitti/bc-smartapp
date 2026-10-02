# Supabase-julkaisu (tuotanto qvqmemeexberatbqxivw)

## Migraatiot
- Supabase GitHub -integraatio ("Supabase Preview" -tarkistus) ajaa `supabase/migrations`-kansion
  migraatiot tuotantoon main-haaran pushista ja kirjaa ne `supabase_migrations.schema_migrations`-tauluun.
- **Älä aja migraatioita käsin SQL-editorissa ilman historiamerkintää.** Jos niin on tehty, merkitse
  versio ajetuksi (`supabase migration repair --status applied <versio>` tai lisäämällä rivi
  `schema_migrations`-tauluun), muuten integraatio yrittää ajaa sen uudelleen ja kaatuu
  (esim. `relation "work_report_equipment" already exists`, korjattu 2.10.2026).
- Tarkistus: `select count(*) from supabase_migrations.schema_migrations` = migraatiotiedostojen määrä.

## Edge-funktiot
Julkaisu on automaattinen kahta reittiä (sama koodi main-haarasta):
1. **GitHub Actions** (`.github/workflows/deploy.yml`, job `deploy-edge-functions`): main-pushista julkaistaan vain
   muuttuneet funktiot — `supabase/functions/<nimi>/**`, `_shared`-tiedostoa käyttävät funktiot, ja
   `config.toml`-muutoksessa kaikki config.toml:n funktiot. Käsin: Actions → "Deploy to Cloudflare Pages" →
   Run workflow → `functions` = `work-report-print-share` tai `all`.
   Vaatii repon salaisuuden `SUPABASE_ACCESS_TOKEN` (muuttuja `SUPABASE_PROJECT_REF`, oletus qvqmemeexberatbqxivw).
2. **Supabase GitHub -integraatio** ("Supabase Preview") julkaisee config.toml:n funktiot main-pushista
   migraatioiden jälkeen — jos migraatio kaatuu, myöskään funktiot eivät päivity.

**Jokaisella funktiolla pitää olla `[functions.<nimi>]` + `verify_jwt` `config.toml`:ssa** — Actions-job keskeyttää
julkaisun, jos asetus puuttuu, jotta JWT-tarkistus ei vaihdu vahingossa. Julkiset (verify_jwt = false):
work-report-print-share, monitor-share-view, temp-/vrf-monitor-ingest, vrf-device-config, platform-backup-*
(tarkistavat itse). Muut vaativat kirjautumisen (verify_jwt = true).

Käsin: `supabase functions deploy <nimi> --project-ref qvqmemeexberatbqxivw --use-api` (+ `--no-verify-jwt`, jos config.toml:ssa false).

Tarkistus (`work-report-print-share`, asiakkaan tulostelinkki `/j/:token`):
`curl -X POST -H 'Content-Type: application/json' -d '{"ping":true}' https://qvqmemeexberatbqxivw.supabase.co/functions/v1/work-report-print-share`
→ `{"ok":true,"version":"…"}` (versio = `WORK_REPORT_PUBLIC_PRINT_VERSION`).
