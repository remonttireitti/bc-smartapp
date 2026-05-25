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
| Sovellus | https://bc-smartapp.vercel.app |
| Supabase | https://qvqmemeexberatbqxivw.supabase.co |
| Studio | https://supabase.com/dashboard/project/qvqmemeexberatbqxivw |

Testikäyttäjät (salasana `test123456`):

- `admin@x.test` — BC Smartapp (alihankkija, luo raportteja UKH:n nimissä)
- `admin@y.test` — Uudenmaan Kylmähuolto Oy (pääurakoitsija, logo ja lomake)
- `admin@z.test` — Lämpökatsastus Oy (ei kumppani)
- `admin@t.test` — Termatek Oy (ei kumppani)

```bash
supabase login
supabase link --project-ref qvqmemeexberatbqxivw
supabase db push
```

Aseta Vercel-ympäristöön `VITE_SUPABASE_URL` ja `VITE_SUPABASE_ANON_KEY` (katso `.env.production.example`).

Uudelleenjulkaisu: `npm run build` ja `npx vercel deploy --prod --yes`

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
