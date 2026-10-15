# MQTT → Firebase Realtime Database (esimerkkisilta)

ESP32 voi julkaista telemetry-JSONin aiheeseen `vrf/<DEVICE_ID>/telemetry`, kun `USE_MQTT 1` (`src/config.h`).  
Web-käyttöliittymä lukee edelleen polkua `/vrf/<DEVICE_ID>/latest`. Tämän siltaohjelman tarkoitus on kopioida MQTT-viesti samaan rakenteeseen RTDB:ssä.

## Esivaatimukset

- [Node.js](https://nodejs.org/) 18+
- Firebase-palvelutili: **Service Account** JSON (Project settings → Service accounts).
- Mosquitto / EMQX tms. käynnissä ja ESP yhdistää siihen.

## Asennus

```bash
cd tools/mqtt-bridge
npm install
```

Aseta ympäristömuuttujat (PowerShell-esimerkit):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\polku\serviceAccount.json"
$env:MQTT_URL="mqtt://192.168.1.10"
$env:DEVICE_ID="vrf-heating-01"
$env:FIREBASE_DATABASE_URL="https://<projekti>.firebasedatabase.app/"
```

## Käynnistys

```bash
node index.mjs
```

Silta tilaa `vrf/<DEVICE_ID>/telemetry` ja kirjoittaa koko JSON-objektin polkuun `/vrf/<DEVICE_ID>/latest` (RTDB `set`).

**Turvallisuus:** älä commitoi service account -JSONia; käytä vain paikallista polkua tai salaisuuksien hallintaa.

**Tuotanto:** sama logiikka voidaan siirtää Cloud Run / VPS:lle **TLS-MQTT**:llä ja rajoitetulla topic ACL:llä.
