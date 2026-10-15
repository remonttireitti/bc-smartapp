# Laitteelle paluu — nopea tarkistuslista

1. **Build**
   - `pio run -e waveshare_esp32s3_eth`
2. **Portti**
   - Tarkista `platformio.ini` → `upload_port` (esim. COM3 Windowsissa).
3. **Flash + serial**
   - `pio run -e waveshare_esp32s3_eth -t upload`
   - `pio device monitor`
4. **MQTT (valinnainen)**
   - `src/config.h`: aseta `MQTT_BROKER_HOST` oikeaksi LAN-IP:ksi tai pilvi-brokeriksi.
   - `#define USE_MQTT 1` kun broker on saatavilla.
   - Halutessasi käynnistä silta: `docs/MQTT_BRIDGE.md` + `tools/mqtt-bridge/`.
5. **OTA (oletus päällä)**
   - `USE_OTA` / `OTA_POLL_INTERVAL_MS` / `FIRMWARE_VERSION_STRING` → `src/config.h`.
   - Etäpäivitys RTDB:n kautta: `docs/OTA.md`.
6. **Pilvi**
   - `firebase deploy --only hosting,functions` (UI:n 12 s tuoreus + connectivity).
7. **Web**
   - Kovalla päivityksellä lataa uusi `app.js` (cache-param vaihtunut).
