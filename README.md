# BC Smartapp (Supabase)

Moniyritys- ja kumppanuuspohjainen palveluhallinta: työraportit, huoltoraportit, kalenteri, laskutus, varasto ja työkalut.

## Vaatimukset

- [Node.js](https://nodejs.org/) 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (paikallinen Supabase)

## Käynnistys (paikallinen)

**Aloittelijalle:** lue [SETUP-FI.md](./SETUP-FI.md) — Docker-ohje askel askeleelta.

```powershell
cd bc-smartapp
npm install
npm run db:start      # vaatii Docker Desktopin käynnissä
npm run dev
```

`.env` on jo valmiina paikallista kehitystä varten.  
Sovellus: http://localhost:5173  
Supabase Studio: http://127.0.0.1:54323

## Pilviprojekti (Supabase Cloud)

**Tuotanto (2026-05):**

| | |
|---|---|
| Sovellus | https://bc-smartapp.pages.dev |
| Supabase | https://qvqmemeexberatbqxivw.supabase.co |
| Studio | https://supabase.com/dashboard/project/qvqmemeexberatbqxivw |

Testikäyttäjät (salasana `test123456`):

- `admin@x.test` — BC Smartapp (alihankkija, luo raportteja UKH:n nimissä)
- `admin@y.test` — Uudenmaan Kylmähuolto Oy (pääurakoitsija, logo ja lomake)
- `admin@z.test` — Lämpökatsastus Oy (ei kumppani)
- `admin@t.test` — Termatek Oy (ei kumppani)

CLI ei ole pakollinen globaalisti — käytä `npx`- tai npm-skriptejä:

```bash
npm run db:login
npm run db:link
npm run db:push
```

Tai suoraan:

```bash
npx supabase login
npx supabase link --project-ref qvqmemeexberatbqxivw
npm run db:push
```

`db:login` avaa selaimen (tai pyytää access tokenin). Ilman kirjautumista `db:push` epäonnistuu:
*Cannot find project ref. Have you run supabase link?*

**Vaihtoehto ilman CLI:tä:** Supabase Studio → SQL Editor → aja tiedostot
`supabase/migrations/20260621000111_refrigerant_trading_permissions.sql` ja
`supabase/migrations/20260621000112_refrigerant_pass_through_billing.sql` järjestyksessä.

Aseta Cloudflare Pages -ympäristöön `VITE_SUPABASE_URL` ja `VITE_SUPABASE_ANON_KEY` (katso `.env.production.example`).

### Git + Cloudflare Pages (tuotanto)

| | |
|---|---|
| GitHub | https://github.com/remonttireitti/bc-smartapp |
| Tuotanto | https://bc-smartapp.pages.dev |

Muutokset: commit → `git push origin main` → Cloudflare Pages deployaa automaattisesti (jos repo on kytketty).

Cloudflare Dashboard: **Workers & Pages** → projekti → **Deployments**.  
Build: `npm run build` · output: `dist`

Ensimmäinen asennus (uudessa koneessa):

```bash
git clone https://github.com/remonttireitti/bc-smartapp.git
cd bc-smartapp
npm install
```

Manuaalinen build paikallisesti: `npm run build` (vaatii `.env.production` tai Cloudflare-muuttujat).

## Tietomalli (lyhyesti)

| Käsite | Kentät |
|--------|--------|
| Kumppanuus | `company_partnerships` + `permissions_a_to_b` |
| Jaettu raportti | `owner_company_id`, `created_by_company_id`, `branding_company_id` |
| Työn tila | `scheduled` → `in_progress` → `completed` → `billed_partner` → `billed_customer` |
| Laskutus | `work_report_billing` + `work_report_lines` |

Dev-seed luo yritykset X, Y, Z ja esimerkkityön (X luo, Y omistaa — Z ei näe).

## Seuraavat askeleet

1. Auth + profiilin liitos yritykseen (kutsu)
2. Dashboard-moduulit (kuten alkuperäinen BC Smartapp)
3. Ehdollinen huoltolomake-komponentti
4. Asiakasportaali (rooli `customer`)
5. PDF / logo generointi (Edge Function)
