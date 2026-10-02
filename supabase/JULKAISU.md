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
- GitHub Actionsin "Deploy to Cloudflare Pages" julkaisee vain frontendin, ei edge-funktioita.
- Julkaisu: `supabase functions deploy <nimi> --project-ref qvqmemeexberatbqxivw` (julkiset funktiot,
  esim. `work-report-print-share`, lisäksi `--no-verify-jwt`; ks. `config.toml`).
- `work-report-print-share` (asiakkaan tulostelinkki `/j/:token`):
  `curl -X POST -H 'Content-Type: application/json' -d '{"ping":true}' https://qvqmemeexberatbqxivw.supabase.co/functions/v1/work-report-print-share`
  → `{"ok":true,"version":"…"}` (versio = `WORK_REPORT_PUBLIC_PRINT_VERSION`).
