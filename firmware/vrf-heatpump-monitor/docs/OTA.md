# OTA-päivitys (HTTP/HTTPS)

Firmware tukee **OTA**-päivitystä suoraan URL:sta (`HTTPUpdate`). Komento haetaan **Supabase**-asetuksista (`settings.ota_request`); laite pollaa config-endpointia noin **10 s** välein (`OTA_POLL_INTERVAL_MS` `src/config.h`).

## Supabase-asetukset

Laite lukee `vrf-device-config` -vastauksesta:

| Kenttä | Tyyppi | Kuvaus |
|--------|--------|--------|
| `settings.ota_request.nonce` | int | **> 0** tarkoittaa pyyntöä. Sama nonce ei ajeta uudelleen onnistumisen jälkeen. Epäonnistumisen jälkeen sama nonce ei **yritä automaattisesti uudelleen** — käytä uutta noncea. |
| `settings.ota_request.url` | string | Täysi URL, esim. `https://.../firmware.bin` |

Aseta arvot bc-smartapp web-käyttöliittymän kautta tai suoraan `vrf_devices.settings` JSON-kenttään.

Telemetriassa: `diagnostics/firmware_version` vastaa `FIRMWARE_VERSION_STRING` (`src/config.h`).

## Binääri ja build

1. Rakenna sama ympäristö kuin tuotantolaite: `pio run -e waveshare_esp32s3_eth`.
2. Noudata polku `.pio/build/waveshare_esp32s3_eth/firmware.bin`.
3. Julkaise tiedosto **julkisesti** luettavaksi URL:iin (HTTP tai HTTPS).

HTTPS käyttää `WiFiClientSecure` + `setInsecure()` (ei omaa CA:tä).

## Esimerkki — käynnistä OTA

Päivitä laitteen `settings` JSON (bc-smartapp tai Supabase):

```json
{
  "ota_request": {
    "nonce": 7,
    "url": "https://example.com/path/firmware.bin"
  }
}
```

Seuraa Serial-lokia (`[OTA]`). Onnistuneen flashin jälkeen laite **käynnistyy uudelleen**; NVS tallentaa viimeksi onnistuneen noncen (`vrf_ota` / `last_nonce`).

## Poista OTA käytöstä

`src/config.h`: `#define USE_OTA 0`

## Versiointi

Päivitä **`FIRMWARE_VERSION_STRING`** jokaisessa julkaisussa.
