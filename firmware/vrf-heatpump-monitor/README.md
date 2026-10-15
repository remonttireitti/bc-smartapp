# VRF Heat Pump Monitor (ESP32-S3 + Supabase)

Tama projekti mittaa 6 kpl DS18B20 lampotila-anturia, ohjaa laitetta paalle/pois pilvikomennolla (Supabase) ja lahettaa telemetrian bc-smartapp `vrf-monitor-ingest` -endpointiin.

## Mitattavat pisteet

| Paikka | Telemetria-avain (`temperatures/...`) |
|--------|---------------------------------------|
| Ulkolampotila (vapaa ilma) | `outdoor_c` |
| Ulkoyksikon kenno | `outdoor_coil_c` |
| Kylmaaine **meno** | `refrigerant_supply_c` |
| Kylmaaine **paluu** | `refrigerant_return_c` |
| Kuumakaasu | `hot_gas_c` |
| Teltta / suojatila | `outdoor_tent_c` |

## Pilvi (Supabase)

`src/config.h`:

- `SUPABASE_INGEST_URL` — telemetria POST (`vrf-monitor-ingest`)
- `SUPABASE_CONFIG_URL` — ohjaus + asetukset + OTA (`vrf-device-config`)
- `SUPABASE_DEVICE_KEY` — 12-numeroinen laiteavain bc-smartapp:sta
- `DEVICE_ID` — telemetria-JSON ja MQTT-topic (`vrf/<DEVICE_ID>/telemetry`)

Laite pollaa configia ~500 ms (ohjaus) ja ~5 s (asetukset). Telemetria lähetetään ~2 s välein; epäonnistuneet ingestit jonotetaan RAM-backlogiin.

## Verkko (W5500 / RJ45)

- Tuotanto: `pio run -e waveshare_esp32s3_eth` (`-DUSE_ETHERNET=1`)
- Tiukasti vain RJ45: `pio run -e waveshare_esp32s3_eth_strict_rj45`

## MQTT (valinnainen)

`USE_MQTT` = 1 julkaisee saman JSONin MQTT-brokerille. Ks. `docs/MQTT_BRIDGE.md`.

## OTA

`settings.ota_request` Supabasessa (nonce + url). Ks. `docs/OTA.md`.

## Projektin rakenne

- `platformio.ini` — build + kirjastot (ArduinoJson, ei Firebase)
- `src/config.h` — verkko / Supabase / sensorit
- `src/main.cpp` — mittaus, telemetria, paikallinen AP-portaali
- `src/cloud_config.cpp` — Supabase ohjaus, asetukset, OTA
- `src/supabase_sync.cpp` — ingest + config HTTP + telemetry backlog

## Kayttoonotto

1. Aseta `SUPABASE_*` ja `DEVICE_ID` tiedostossa `src/config.h`.
2. `pio run -e waveshare_esp32s3_eth`
3. `pio run -t upload -e waveshare_esp32s3_eth`

Paikallinen SoftAP-portaali (`VRF-SETUP`) toimii WANin rinnalla huoltoon.

## Salaisuudet (secrets.h)

Laiteavain (`SUPABASE_DEVICE_KEY`) ei ole repossa. Kopioi `src/secrets.h.example` → `src/secrets.h`
ja täytä arvo ennen buildia. `src/secrets.h` on gitignoressa.

Build: `pio run -e waveshare_esp32s3_eth` → `.pio/build/waveshare_esp32s3_eth/firmware.bin`,
kopioi `public/vrf-firmware/firmware.bin` + päivitä `public/vrf-firmware/manifest.json`.
