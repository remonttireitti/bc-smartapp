# IoT-arkkitehtuuri (VRF) — suunnitelma

Tavoite: **vakaa MQTT** telemetrialle, luotettava **offline/online-tunnistus**, laitteen **paikallinen välimuisti**, **LAN > WiFi**-prioriteetti, **OTA**, ja **web-UI:n kaltainen paikallinen dashboard**.

## Vaihe 1 — toteutettu (firmware + web + functions)

- Web/UI: **tuoreusraja ~12 s** (`DATA_STALE_MS`), **käyntilupa- ja asetustallennus estetty** kun data ei ole tuoretta.
- Cloud Functions: **sama ikäkynnys** connectivity-tarkistuksessa kuin UI:ssa.
- Firmware: **kuumakaasu-heuristiikka** (`compressor_likely_running`) — ei DI:tä, sulatus ohitetaan.
- Firmware: **MQTT-julkaisu (valinnainen, `USE_MQTT 0`)** — sama JSON kuin Firebase `latest`; broker `config.h`:ssa. Esimerkkisilta: `tools/mqtt-bridge/`, `docs/MQTT_BRIDGE.md`.
- Dokumentit: `docs/DEVICE_CHECKLIST.md`, `README.md`.

## Vaihe 2 — MQTT ensisijainen polku

1. **Broker**: Mosquitto / EMQX / HiveMQ (LAN tai pilvi); TLS ja käyttäjät tuotannossa.
2. **Silta → Firebase** (ei ESP:n raskasta HTTPS:iä jatkuvasti):
   - pieni **Node.js**- tai **Cloud Run** -palvelu tilaus `vrf/<deviceId>/telemetry` → Firebase Admin SDK → RTDB `latest` / historia.
3. ESP voi pitää Firebase-kirjaston bootissa / harvinaisiin asetuksiin tai siirtyä täysin **MQTT + HTTP OTA**.

## Vaihe 3 — offline-puskuri (20–30 s)

- Kun **ei verkkoa / ei brokeria**, näyte **NVS:ään tai renkaaseen** samaan tapaan kuin nykyinen `history`-jono.
- **Tiheämpi väli** offline-tilassa esim. 20–30 s (erillinen ajastin kuin 2 s anturiluku).
- Kun yhteys palaa: **flush FIFO**, poista lähetetyt; UI:ssa **merkintä “ei live-lukema”** ja **ohjaus estetty** kunnes tuore paketti.

## Vaihe 4 — verkko: LAN ensin, WiFi AP kun LAN käyttää WAN:ia

- Nykyinen logiikka: Ethernet WAN → WiFi STA ei käynnisty; **paralleeli SoftAP** huoltoon.
- Tarkennetaan: kun **ETH+DHCP OK**, **WiFi STA -tilaa ei nosteta** (vain AP tarvittaessa); dokumentoidaan testiskenaariot.

## Vaihe 5 — paikallinen dashboard = web-UI

- Joko **embed sama `index.html` / resurssit`** SPIFFSiin / embed + kevyt gzip, tai **yhteinen rakenne** CSS/JS -kopio build-vaiheessa.
- **Mobiili/tabletti**: sama responsiivinen layout (viewport, kosketusalueet).

## Vaihe 6 — OTA

- **HTTP(S) OTA toteutettu**: Firebase `/ota_request` (nonce + url) → laite pollaa, fläshää `firmware.bin` -URL:sta, kirjoittaa `/ota_status`, NVS replay-esto (`docs/OTA.md`).
- Jatkokehitys: allekirjoitettu firmware, rollback-kynnys, manuaalinen “päivitä” -nappi UI:ssa.

## Huomio kuumakaasusta (kompressori-arvio)

- Inverteri: pienet tiput eivät tarkoita pysäystä → **pidemmät off-streakit** ja defrost-ikkuna ohittaa heuristiikan.
