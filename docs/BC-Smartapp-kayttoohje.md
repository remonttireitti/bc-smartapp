---
title: BC Smartapp — Käyttöohje
---

# BC Smartapp — Käyttöohje

**Versio:** 2026-06 · LV- ja kiinteistöpalveluiden työnhallinta

Sovellus toimii selaimessa puhelimella ja tietokoneella. Kirjaudu osoitteessa **https://bc-smartapp.vercel.app**.

---

## 1. Aloitus

### 1.1 Kirjautuminen

1. Avaa sovellus selaimessa.
2. Syötä yrityksellesi annettu **sähköposti** ja **väliaikainen salasana**.
3. Ensimmäisellä kerralla sovellus ohjaa **salasanan vaihtoon**. Valitse vähintään 8 merkin pituinen salasana — älä jatka väliaikaisella salasanalla.
4. Kirjautumisen jälkeen pääset **etusivulle**.

### 1.2 Ilmainen kokeilujakso

- Uuden yrityksen **30 päivän kokeilujakso** alkaa, kun yrityksen ensimmäinen käyttäjä kirjautuu ensimmäistä kertaa.
- Kokeilun aikana **kaikki moduulit** ovat käytössä.
- Etusivulla näkyy **Lisenssi ja tilaus** -osio: jäljellä olevat päivät, hinnat ja moduulit.
- Kokeilun päättyessä tarvitset tilauksen jatkamiseen — ota yhteyttä globaaliin ylläpitoon (luku 10).

### 1.3 Roolit

| Rooli | Kuvaus |
|-------|--------|
| **Ylläpitäjä** | Kaikki yrityksen toiminnot, käyttäjät, yritystiedot, kumppanuudet |
| **Asentaja / Esimies** | Työraportit, raportit, asiakkaat (roolin mukaan) |
| **Tilaaja** | Portaali: työtilaukset, omat raportit, kohteet |
| **Asiakas** | Portaali: yhden kohteen raportit |

---

## 2. Etusivu

Etusivulla näet **moduulikortit** ja **pikhaun** (asiakkaat, laitteet, raportit).

Moduulit riippuvat tilauksesta:

| Moduuli | Sisältö |
|---------|---------|
| **Peruspaketti** | Työraportit, varasto, huoltoraportit, asiakas- ja laiterekisteri |
| **Tarjoukset** | Tarjouspyynnöt, laskelmat, tulosteet |
| **Laskutus** | Laskutettavat summat, kumppani- ja asiakaslaskutus |
| **Etäseuranta** | Lämpötilaseuranta, hälytykset, VRF |
| **Työkalut** | Työkaluinventaario |

**Hallinta** on aina saatavilla (omat tiedot, yritys, käyttäjät).

---

## 3. Työraportit

**Etusivu → Työraportti**

- **Uusi työraportti** tai **toimeksianto** kumppanille.
- **Kalenteri** — aikataulutetut työt.
- **Päiväkirja**: tunnit (normaali, ylityö, päivystys, urakka), kulut, km, kylmäaine, kuvat.
- **Tuloste** — PDF/printti asiakkaalle tai arkistoon.
- **Laskutettava summa** — kumppanille ja asiakkaalle erikseen (jos laskutusmoduuli käytössä).

Tilaajat voivat lähettää **työtilauksen** portaalista; se näkyy kalenterissa odottavana.

---

## 4. Huoltoraportit

**Etusivu → Huoltoraportti**

- Uusi huoltopöytäkirja asiakkaan laitteelle.
- Mittaukset, moduulit laitetyypin mukaan (kylmäkone, lämpöpumppu, MLP jne.).
- **Tuloste** valmiista raportista.
- Laatijan nimi ja TUKES-numero tulevat **Omat tiedot** -profiilista.

---

## 5. Asiakkaat ja laitteet

**Etusivu → Asiakkaat**

- Asiakasrekisteri: yhteystiedot, osoite, huomautukset.
- **Laitteet** asiakaskohtaisesti (tag, malli, sarjanro).
- **Dokumentit** liitteinä.
- **Portaali-käyttäjät** (tilaaja / asiakas) luodaan täältä tai tilaajarekisteristä.

---

## 6. Tarjouspyynnöt

**Etusivu → Tarjouspyyntö** *(lisämoduuli)*

- Uusi tarjous (lämpöpumppu, korjaus, ilmalämpöpumppu jne.).
- Laskelmat, laiterekisteri, valmis **tarjoustuloste**.
- Tarjouksen voimassaoloaika tulosteessa.

---

## 7. Varasto

**Etusivu → Varasto** *(peruspaketti)*

- Materiaalit ja kylmäaine.
- Linkitys työraportin päiväkirjaan.

---

## 8. Etäohjaus ja seuranta

**Etusivu → Etäohjaus ja seuranta** *(lisämoduuli)*

- **Lämpötila**: kannettavat mittarit, trendit, hälytysrajat, raportit.
- **VRF**: laitteet, hälytykset, asetukset.
- **Lukuoikeus**: jaettava linkki ilman kirjautumista (rajoitettu näkymä).

---

## 9. Työkalut

**Etusivu → Työkalut** *(lisämoduuli)*

- Työkaluinventaario ja hallinta.

---

## 10. Laskutus

**Etusivu → Laskutus** *(lisämoduuli)*

- **Kumppanilaskutus** — toisen yrityksen tekemät työt.
- **Asiakaslaskutus** — omat työraportit.
- Merkitse raportit laskutetuiksi; seuraa avoimia summia.
- Huom: BC Smartapp **ei ole laskutusohjelma** — se seuraa laskutettavia summia ja kassavirtaa.

---

## 11. Hallinta

**Etusivu → Hallinta**

### Omat tiedot
- Nimi, TUKES-numero, kotiosoite / toimipiste (ajomatkat).
- **Vaihda salasana**.

### Yritystiedot *(ylläpitäjä)*
- Nimi, logo, osoite, yhteystiedot.
- Km-hinnat, laskutusasetukset.
- Kumppanuuskutsut (näkyvyys kumppanuuslistassa).

### Käyttäjät *(ylläpitäjä)*
- Lisää käyttäjiä väliaikaisella salasanalla — salasana on vaihdettava heti.
- Roolit: ylläpitäjä, asentaja, esimies.

### Tilaajat
- Moniasiakastilaajien rekisteri (portaali).

### Kumppanuudet
- Kutsu toinen yritys kumppaniksi.
- Määritä oikeudet: työraportit, huolto, asiakkaat, varasto, tarjoukset jne.

### Kumppanilaskutus
- Yhteenveto laskutettavista (*vaatii laskutusmoduulin*).

---

## 12. Kumppanuustyöskentely

1. **Hallinta → Kumppanuudet → Kutsu kumppani** — valitse yritys, jolla on kumppanuuskutsut sallittu.
2. Hyväksy kutsu toisessa yrityksessä.
3. Määritä **oikeudet** (luku / kirjoitus moduuleittain).
4. Kumppani voi luoda työraportteja **puolestasi** tai nähdä jaetut raportit.

---

## 13. Tilaus ja hinnoittelu

Kokeilun jälkeen tilaus koostuu:

| Tuote | Oletushinta |
|-------|-------------|
| Peruspaketti | 49 €/kk |
| Tarjoukset | +19 €/kk |
| Laskutus | +19 €/kk |
| Etäseuranta | +29 €/kk |
| Työkalut | +9 €/kk |

Hinnat voivat muuttua — ajantasainen tieto etusivun **Lisenssi ja tilaus** -osiossa.

Maksu ja tilauksen aktivointi hoidetaan toistaiseksi **manuaalisesti** ylläpidon kautta.

---

## 14. Vinkkejä

- **Pikahaku** etusivulla: kirjoita vähintään 2 merkkiä (asiakas, laite, raportti).
- **PWA**: asenna sovellus puhelimen aloitusnäytölle selaimen valikosta.
- Luonnokset **tallentuvat automaattisesti** — älä jätä pitkiä tekstejä tallentamatta ennen sivulta poistumista.
- Uloskirjautuminen tapahtuu automaattisesti pitkän käyttämättömyyden jälkeen.

---

## 15. Yhteystiedot — globaali ylläpito

Tilin luonti, kokeilujakso, tilaus, moduulit, tekninen tuki:

**Enn Kotselainen**  
BC Smartapp / Remonttireitti

- **Sähköposti:** info@remonttireitti.fi
- **Verkkosivu:** https://www.remonttireitti.fi
- **Sovellus:** https://bc-smartapp.vercel.app

---

*BC Smartapp — moniyritys, kumppanuudet ja portaalit*
