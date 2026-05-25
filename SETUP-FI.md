# BC Smartapp — paikallinen käynnistys (Windows)

Tämä ohje on aloittelijalle. **Sinun ei tarvitse osata Dockeria** — riittää että se on käynnissä taustalla.

## Mitä Docker tekee?

Docker ajaa Supabasen (tietokanta + kirjautuminen) **omalla koneellasi**. Se on kuin minipilvi tietokoneen sisällä. Sinä et koske Dockeriin muuten kuin:

1. Käynnistät **Docker Desktop** -ohjelman
2. Odotat että alareunassa lukee **"Engine running"**

Sen jälkeen kaikki hoituu terminaalikomennoilla projektikansiossa.

---

## Kerran tehtävät asiat

### 1. Docker Desktop

- Asenna: https://docs.docker.com/desktop/setup/install/windows-install/
- Käynnistä ohjelma **Docker Desktop**
- Anna sen käynnistyä kokonaan (voi kestää pari minuuttia ensimmäisellä kerralla)

### 2. Projektin riippuvuudet

PowerShell / terminaali:

```powershell
cd C:\Users\Administrator\.cursor\projects\d-2\bc-smartapp
npm install
```

---

## Joka kerta kun kehität

### Vaihe 1 — Docker päälle

Avaa **Docker Desktop** ja varmista että se on käynnissä.

### Vaihe 2 — Supabase päälle

```powershell
cd C:\Users\Administrator\.cursor\projects\d-2\bc-smartapp
npm run db:start
```

Ensimmäisellä kerralla lataa paljon — odota rauhassa (5–15 min).  
Kun valmis, näet viestin: **"Started supabase local development setup"**.

### Vaihe 3 — Web-sovellus

Uusi terminaali-ikkuna:

```powershell
cd C:\Users\Administrator\.cursor\projects\d-2\bc-smartapp
npm run dev
```

Avaa selaimessa: **http://localhost:5173**

### Vaihe 4 — Tietokanta-hallinta (Studio)

Avaa: **http://127.0.0.1:54323**

Täällä voit katsoa tauluja, luoda käyttäjiä jne.

---

## Luo testikäyttäjät (X, Y, Z)

Studion metadata-kenttä on usein lukittu. Aja:

```powershell
npm run setup:dev
```

| Tunnus | Yritys | Kumppanuus |
|--------|--------|------------|
| admin@x.test | BC Smartapp | Alihankkija — luo raportteja UKH:n nimissä |
| admin@y.test | Uudenmaan Kylmähuolto Oy | Pääurakoitsija — omistaa asiakkaan Asiakas Oy |
| admin@z.test | Lämpökatsastus Oy | Ei kumppani |
| admin@t.test | Termatek Oy | Ei kumppani |

Salasana kaikilla: `test123456`

**Huom:** Aja `npm run setup:dev` uudelleen aina kun ajat `npm run db:reset`.

---

## Hyödylliset komennot

| Komento | Mitä tekee |
|---------|------------|
| `npm run db:start` | Käynnistää Supabasen |
| `npm run db:stop` | Sammuttaa Supabasen |
| `npm run db:reset` | Tyhjentää DB + ajaa migraatiot uudelleen |
| `npx supabase status` | Näyttää osoitteet ja avaimet |
| `npm run dev` | Käynnistää web-sovelluksen |

---

## Ongelmat?

**"Docker daemon not running"**  
→ Käynnistä Docker Desktop ja odota "Engine running".

**"Port already in use"**  
→ Joku muu käyttää porttia. Sammuta: `npm run db:stop` ja yritä uudelleen.

**Sovellus ei kirjaudu sisään**  
→ Tarkista `.env`-tiedosto (URL + avain). Aja `npx supabase status` ja vertaa avaimia.

**Haluat aloittaa alusta tietokannan kanssa**  
→ `npm run db:reset`

---

## Tarvitseeko Supabase Cloud -projektia?

**Ei paikalliseen kehitykseen.** Cloud tarvitaan vasta kun viet sovelluksen tuotantoon internetiin.
