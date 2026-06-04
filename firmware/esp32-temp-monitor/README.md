# ESP32 lämpötila (XIAO ESP32-C3 + 2× DS18B20)

Lähettää mitat BC-Smartappin `temp-monitor-ingest` -reitille. Demo-laitteen avain migraatiossa: `886644220011`.

## Kytkentä

- DS18B20 data → GPIO4 (D2)
- Punainen → 3V3, musta → GND
- 4,7 kΩ veto data–3V3

## Asennus

1. Kopioi `secrets_template.h` → `secrets.h` (älä commitoi).
2. Täytä `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `DEVICE_KEY`.
3. Arduino IDE: laite **Seeed XIAO ESP32C3**, avaa `temp_monitor_supabase.ino`.
4. Asenna kirjastot **OneWire** ja **DallasTemperature**.

## Pilvi

Varmista että migraatio `20260606000086_esp32_temp_demo_device.sql` on ajettu ja edge function `temp-monitor-ingest` deployattu.
