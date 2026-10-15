#pragma once
#include <stdint.h>

// Laitekohtaiset salaisuudet (gitignore): src/secrets.h — ks. src/secrets.h.example.
#if __has_include("secrets.h")
#include "secrets.h"
#endif

// --- Network ---
/** Ei kaytossa Ethernet-WAN buildissa (Wi-Fi = vain SoftAP). */
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#define WIFI_CONNECT_TIMEOUT_MS 30000UL

// Access Point (Wi-Fi setup portal + Ether-rinnakkainen SoftAP)
#define WIFI_AP_SSID_PREFIX "VRF-SETUP"
/** Vapaaehtoinen fallback (WPA2 vaatii vahintaan 8 merkkia); ensisijainen pilveen device_secrets/ap_password (vain huolto-luku). */
#define WIFI_AP_PASSWORD ""

// Arduino IDE tai ilman PIO-lippuja: WAVESHARE S3 Ethernet - levyllä aseta tämään 1.
// PlatformIO `waveshare_esp32s3_eth` käyttää -DUSE_ETHERNET=1 (älä määritä tähän silloin duplikaattia).
#ifndef USE_ETHERNET
#define USE_ETHERNET 0
#endif

/**
 * WAN-käyttäytyminen ethernet-käännöillä (`USE_ETHERNET` 1 tai PlatformIO `-DUSE_ETHERNET=1`).
 * Arvo 0: RJ45 yritystä ensiksi → jos ei IP/DHCP → Wi‑Fi STA (hotspot ym.) WAN-fallbackina.
 * Arvo 1: pilvi WAN vain RJ45:n kautta; ei STAfallbackia (RJ45 häiriö = vain määritys-SoftAP).
 */
#ifndef ETHERNET_ONLY_WAN
#define ETHERNET_ONLY_WAN 1
#endif

/**
 * Rinnakkais‑SoftAP Ethernet‑WANin kanssa (HTTP-portaali miekkojen määritykseen). Oletus 1.
 */
#if USE_ETHERNET
#ifndef SOFTAP_PARALLEL_ETHERNET
#define SOFTAP_PARALLEL_ETHERNET 1
#endif
#else
#define SOFTAP_PARALLEL_ETHERNET 0
#endif
// Ethernet DHCP / link wait at boot before falling back to Wi-Fi STA (milliseconds).
#define ETH_CONNECT_TIMEOUT_MS 45000UL

/** 1 = jos DHCP ei anna IP:ta mutta linkki on ylos, kokeile yleisia GSM/LAN-osoitteita. */
#ifndef ETH_STATIC_FALLBACK_AFTER_DHCP
#define ETH_STATIC_FALLBACK_AFTER_DHCP 1
#endif
/** 0 = ei Wi-Fi STA -pilveen; WAN vain RJ45 (+ staattinen fallback). Wi-Fi = aina SoftAP. */
#ifndef ETH_WIFI_WAN_IF_RJ45_NO_IP
#define ETH_WIFI_WAN_IF_RJ45_NO_IP 0
#endif
/** Sama DNA/LAN-verkko kuin PC:llä samalla kaapelilla (kuva: 192.168.64.54 / gw .1). */
#define ETH_DNA_GW_A 192
#define ETH_DNA_GW_B 168
#define ETH_DNA_GW_C 64
#define ETH_DNA_GW_D 1
#define ETH_DNA_DEV_A 192
#define ETH_DNA_DEV_B 168
#define ETH_DNA_DEV_C 64
#define ETH_DNA_DEV_D 100
#define ETH_DNA_DNS1_A 62
#define ETH_DNA_DNS1_B 241
#define ETH_DNA_DNS1_C 198
#define ETH_DNA_DNS1_D 245
#define ETH_DNA_DNS2_A 62
#define ETH_DNA_DNS2_B 241
#define ETH_DNA_DNS2_C 198
#define ETH_DNA_DNS2_D 246

// --- Ethernet W5500 (SPI) — Waveshare ESP32-S3-ETH-8DI-8RO Wiki GPIO table ---
// https://www.waveshare.com/wiki/ESP32-S3-ETH-8DI-8RO (12–16; ei RST-pinniä tavallisessa versiossa)
// CFG_ETH_W5500_SPI_HOST: spi_host_device_t; ESP32-S3: SPI2_HOST=1 (ESPHome/Tasmota Bus1), SPI3_HOST=2
#define CFG_ETH_W5500_SPI_HOST 1
#define CFG_ETH_W5500_MOSI_GPIO 13
#define CFG_ETH_W5500_MISO_GPIO 14
#define CFG_ETH_W5500_SCLK_GPIO 15
#define CFG_ETH_W5500_CS_GPIO 16
#define CFG_ETH_W5500_INT_GPIO 12
/**
 * RST: -1 = tavallinen ESP32-S3-ETH-8DI-8RO (wiki + ESPHome, ei GPIO39).
 * POE-versio (ESP32-S3-POE-ETH-8DI-8RO): build_flags -DCFG_ETH_W5500_RST_GPIO=39
 */
#ifndef CFG_ETH_W5500_RST_GPIO
#define CFG_ETH_W5500_RST_GPIO -1
#endif
/** W5500:lle Espressif-esimerkejä yleensä phy_addr = 1 tai 0; kokeile 0 jos DHCP ei osu. */
#define CFG_ETH_W5500_PHY_ADDR 0
#define CFG_ETH_W5500_SPI_MHZ 20

// --- Cloud (Supabase) ---
/** Unique device id (telemetry JSON, MQTT topic prefix). */
#define DEVICE_ID "vrf-heating-01"

// Offline telemetry backlog (RAM). Oldest samples dropped when full.
#ifndef HISTORY_BACKLOG_MAX_SAMPLES
#define HISTORY_BACKLOG_MAX_SAMPLES 40
#endif
#ifndef HISTORY_BACKLOG_FLUSH_BATCH
#define HISTORY_BACKLOG_FLUSH_BATCH 1
#endif

// --- Sensor bus ---
// Waveshare header-pin mappings (use only available GPIOs on this board).
#define ONE_WIRE_BUS_PIN 21
#define READ_INTERVAL_MS 2000UL

// --- Pilviliikenne (1.1.17) ---
/** Telemetria lähetetään muutoksesta (DI, releet, hälytys, tila, lämpötilaraja) + sydänlyönti. */
#define TELEMETRY_HEARTBEAT_MS 60000UL
/** Pelkkä lämpötilamuutos lähetetään enintään näin usein (tilamuutokset heti). */
#define TELEMETRY_MIN_INTERVAL_MS 15000UL
/** Lämpötilamuutos, joka laukaisee lähetyksen (°C); kuumakaasulle oma raja. */
#define TELEMETRY_TEMP_DELTA_C 0.5f
#define TELEMETRY_HOT_GAS_DELTA_C 2.0f
/** Ohjaus/asetukset/OTA haetaan yhdellä pyynnöllä tällä välillä. */
#define CONFIG_POLL_INTERVAL_MS 20000UL
/** Pilviasetuksen muutoksen jälkeen haetaan tiheämmin hetken aikaa. */
#define CONFIG_POLL_FAST_INTERVAL_MS 5000UL
#define CONFIG_POLL_FAST_WINDOW_MS 120000UL

// --- Control and alarms ---
// Onboard relay control via TCA9554 (I2C expander, address 0x20).
#define RELAY_EXIO_I2C_ADDR 0x20
#define RELAY_EXIO_SCL_PIN 41
#define RELAY_EXIO_SDA_PIN 42
#define HEAT_ENABLE_RELAY_CHANNEL 1
/** 0 = bit LOW = kytkimen päälle (yleinen invertterirele); 1 = HIGH = päälle. */
#define HEAT_ENABLE_ACTIVE_HIGH 0
/**
 * Hälytyslähtö (rele, oletus CH8 / RO8) seuraa DI3-hälytystä. Pilviasetukset (vrf_devices.settings):
 *   alarm_output_enabled (oletus true), alarm_output_mode "NO" | "NC" (oletus NO),
 *   alarm_output_channel 2…8 (oletus 8, ei käyntiluvan kanava). Tallentuu NVS:ään.
 * NO = rele virraton normaalisti, vetää hälytyksessä (sama kuin 1.1.16).
 * NC = rele vetää normaalisti, päästää hälytyksessä — myös sähkökatko / laite kaatunut = "hälytys".
 */
#define ALARM_RELAY_CHANNEL 8
#define ALARM_RELAY_ACTIVE_HIGH HEAT_ENABLE_ACTIVE_HIGH
#define ALARM_OUTPUT_ENABLED_DEFAULT 1
#define ALARM_OUTPUT_NC_DEFAULT 0
#define ALARM_OUTPUT_CHANNEL_MIN 2
#define ALARM_OUTPUT_CHANNEL_MAX 8

// Waveshare 8DI: DI2=GPIO5, DI3=GPIO6, DI4=GPIO7 (käyntitieto).
// DI4 erotettu RO1-lähdöstä (rele kanava 1 = ohjaus, ei sama kuin DI1-tulo).
#define DI4_UNIT_READY_PIN 7
#define DI2_COMPRESSOR_PIN 5
#define ALARM_INPUT_PIN 6
/** Waveshare opto: +12 V liitännässä → GPIO LOW. di*_raw = ulkoinen jännitetaso (1 = +12 V). */
#define DI_STATUS_OPTO_INVERTED 1
#define ALARM_INPUT_ACTIVE_HIGH 0
// DI3 hälytys: +12 V = normaali (ei hälytystä), 0 V = hälytys → trigger 0 (INV).
#define ALARM_INPUT_TRIGGER_RAW_LEVEL 0
#define ALARM_INPUT_USE_PULLUP 1
#define DI_STATUS_USE_PULLUP ALARM_INPUT_USE_PULLUP
#define DI_STATUS_MAJORITY_SAMPLES 5
#define DI_STATUS_MAJORITY_MIN 3
#define DI_STATUS_DEBOUNCE_SAMPLES 2

/** DI3: useita peräkkäisiä näytteitä ennen tilan vaihtoa (estää häilyvän johdin). */
#define DI3_ALARM_MAJORITY_SAMPLES 7
#define DI3_ALARM_MAJORITY_MIN 5
#define DI3_ALARM_DEBOUNCE_SAMPLES 3

// Main alarm status follows DI alarm input directly.
#define ANY_ALARM_FOLLOWS_DI 1

// DI3 hälytys: pakkosammutus vähintään näin kauan, sitten käynnistys jos hälytys poissa.
#define DI3_ALARM_SHUTDOWN_DURATION_MS (30UL * 60UL * 1000UL)

// Temperature alarm limits for sanity monitoring.
#define HOT_GAS_HIGH_ALARM_C 110.0f
#define REFRIGERANT_RETURN_LOW_ALARM_C -20.0f
#define REFRIGERANT_DELTA_HIGH_ALARM_C 25.0f
#define REFRIGERANT_DELTA_LOW_ALARM_C 1.0f

// Sulatusheuristiikka (kenno + kylmäaine meno; ei erillista DI-signaalia).
#define DEFROST_COIL_RISE_START_C           0.85f
#define DEFROST_SUPPLY_FALL_START_C          0.55f
#define DEFROST_MIN_DURATION_S               75
#define DEFROST_MAX_DURATION_MS              (2700UL * 1000UL)
#define DEFROST_COOLDOWN_MS                  (180UL * 1000UL)
#define DEFROST_END_SUPPLY_RECOVER_C         0.45f
#define DEFROST_END_COIL_FALL_C              0.55f
#define DEFROST_HEAT_DEMAND_OFF_END_SAMPLES   12
/** Älä aloita sulatusarviota heti käyntiluvan jälkeen (öljypalautus käynnistyksessä). */
#define DEFROST_SUPPRESS_AFTER_HEAT_ON_MS (5UL * 60UL * 1000UL)
/** Kennon pitää olla selvästi kylmempi kuin ulkoilma ennen sulatusarviota (sulatus vs. öljypalautus). */
#define DEFROST_COIL_COLDER_THAN_OUTDOOR_C 2.0f

// Safety setting defaults (can be overridden from Supabase settings).
#define AUTO_STOP_ENABLED_DEFAULT 1
#define AUTO_STOP_BELOW_OUTDOOR_C_DEFAULT -15.0f
// Outdoor heat lock releases when smoothed outdoor ≥ below_c + hysteresis (°C).
#define AUTO_STOP_OUTDOOR_HYSTERESIS_C_DEFAULT 2.0f
// Exponential smoothing time constant for outdoor signal (minutes); 0 = no smoothing.
#define AUTO_STOP_OUTDOOR_SMOOTH_TAU_MIN_DEFAULT 0
#define AUTO_STOP_OUTDOOR_SMOOTH_TAU_MIN_MAX 720
/** Kuumakaasu- ja Δ-hälyt eivät ole voimassa heti käyntilupan päällä; viive (s). */
#define COMPRESSOR_ALARM_ENABLE_AFTER_S_DEFAULT 300

// If configured ROM addresses do not match, fallback to bus index order.
#define ALLOW_SENSOR_INDEX_FALLBACK 1
#define ONE_WIRE_SEARCH_RETRIES 3
/**
 * Teltta-anturi usein pois päältä; peilaa ulkolämpö jotta UI/sähköposti eivät näytä "puuttuvaa"
 * eikä anturivikaa pelkästä teltasta. Aseta 0 jos teltta on oikea erillinen anturi.
 */
#ifndef SENSOR_MIRROR_TENT_FROM_OUTDOOR_IF_MISSING
#define SENSOR_MIRROR_TENT_FROM_OUTDOOR_IF_MISSING 1
#endif

/** 0 = vain Supabase; 1 = julkaise sama telemetry-JSON myös MQTT-brokerille (ks. mqtt_client.cpp). */
#ifndef USE_MQTT
#define USE_MQTT 0
#endif
#if USE_MQTT
#define MQTT_BROKER_HOST "192.168.1.10"
#define MQTT_BROKER_PORT 1883
#define MQTT_USER ""
#define MQTT_PASS ""
/** Viimeisin JSON säilyy brokerilla (helpottaa uusia tilaajia); 0 jos ei halua retain. */
#ifndef MQTT_RETAIN_TELEMETRY
#define MQTT_RETAIN_TELEMETRY 1
#endif
#endif

/**
 * Supabase cloud (bc-smartapp vrf-monitor-ingest + vrf-device-config).
 * Telemetria ingest + ohjaus/asetukset/OTA config-poll.
 */
#ifndef USE_SUPABASE
#define USE_SUPABASE 1
#endif
#ifndef SUPABASE_INGEST_URL
#define SUPABASE_INGEST_URL "https://qvqmemeexberatbqxivw.supabase.co/functions/v1/vrf-monitor-ingest"
#endif
#ifndef SUPABASE_CONFIG_URL
#define SUPABASE_CONFIG_URL "https://qvqmemeexberatbqxivw.supabase.co/functions/v1/vrf-device-config"
#endif
/** 12-numeroinen avain bc-smartapp → VRF ohjaus ja seuranta → Luo laite. */
#ifndef SUPABASE_DEVICE_KEY
/** Ei versionhallinnassa: src/secrets.h (kopioi src/secrets.h.example). */
#define SUPABASE_DEVICE_KEY ""
#endif

/** Sovelluksen versio (telemetria + OTA-tarkistus). Päivitä jokaisessa julkaisussa. */
#ifndef FIRMWARE_VERSION_STRING
#define FIRMWARE_VERSION_STRING "1.1.17"
#endif

/**
 * HTTP(S) OTA: Supabase settings.ota_request → nonce (int >0) + url.
 * Laite tallentaa NVS:ään viimeisin onnistunut nonce (ks. ota_update.cpp).
 */
#ifndef USE_OTA
#define USE_OTA 1
#endif

/** Heuristinen “kompressori todennäköisesti käynnissä” kuumakaasun perusteella (°C). */
#ifndef COMPRESSOR_COIL_COLDER_THAN_OUTDOOR_K
/** Kenno selvästi kylmempi kuin ulkoilma → kompressori todennäköisesti käy. */
#define COMPRESSOR_COIL_COLDER_THAN_OUTDOOR_K 2.0f
#endif
#ifndef HOT_GAS_COMPRESSOR_LIKELY_ON_C
#define HOT_GAS_COMPRESSOR_LIKELY_ON_C 55.0f
#endif
#ifndef HOT_GAS_COMPRESSOR_LIKELY_OFF_C
#define HOT_GAS_COMPRESSOR_LIKELY_OFF_C 38.0f
#endif

// DS18B20 ROM-taulukot (8 tavua: family + 6-byte ID + CRC). Paikkamerkki 28 00 … 03…08 ei välttämättä
// löydä yhtään anturia; silloin ALLOW_SENSOR_INDEX_FALLBACK käyttää bus-indeksiä = sensorPoints-rivin indeksi.
// Aja WAVESHARE_SCANNER tai lue Serial/boot + telemetria diagnostics/onewire_scan_text — päivitä tähän ne 8-byte ROM:t.
static const uint8_t SENSOR_ADDR_OUTDOOR[8] = {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03};
static const uint8_t SENSOR_ADDR_REFRIGERANT_SUPPLY[8] = {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04};
static const uint8_t SENSOR_ADDR_REFRIGERANT_RETURN[8] = {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05};
static const uint8_t SENSOR_ADDR_HOT_GAS[8] = {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x06};
static const uint8_t SENSOR_ADDR_OUTDOOR_COIL[8] = {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07};
static const uint8_t SENSOR_ADDR_OUTDOOR_TENT[8] = {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08};
