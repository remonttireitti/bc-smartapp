#include <Arduino.h>
#include <math.h>
#include <string.h>
#include <WiFi.h>
#include <ETH.h>
#include <esp_eth.h>
#include <Wire.h>
#include <Preferences.h>
#include <WebServer.h>
#include <time.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

#include <cstdio>

#include <esp_netif.h>
#include <esp_log.h>
#if USE_ETHERNET
#include <esp_netif_net_stack.h>
#include "lwip/dns.h"
#include "lwip/netif.h"
#endif

#include "config.h"
#include "cloud_config.h"
#include "mqtt_client.h"
#include "ota_update.h"
#include "supabase_sync.h"
#include "w5500_eth.h"

extern "C" const uint8_t portal_css_start[] asm(
    "_binary_src_portal_portal_css_start");
extern "C" const uint8_t portal_css_end[] asm("_binary_src_portal_portal_css_end");
extern "C" const uint8_t portal_schematic_svg_start[] asm(
    "_binary_public_assets_heat_pump_schematic_svg_start");
extern "C" const uint8_t portal_schematic_svg_end[] asm(
    "_binary_public_assets_heat_pump_schematic_svg_end");

bool heatEnabled = true;
bool permitRequestedFromCloud = true;
bool autoStopEnabled = AUTO_STOP_ENABLED_DEFAULT;
float autoStopBelowOutdoorC = AUTO_STOP_BELOW_OUTDOOR_C_DEFAULT;
float outdoorAutoStopHysteresisC = AUTO_STOP_OUTDOOR_HYSTERESIS_C_DEFAULT;
uint32_t outdoorAutoStopSmoothTauMin = AUTO_STOP_OUTDOOR_SMOOTH_TAU_MIN_DEFAULT;
float gOutdoorAutoStopEma = NAN;
bool outdoorSafetyLockActive = false;
float hotGasHighAlarmC = HOT_GAS_HIGH_ALARM_C;
float refrigerantReturnLowAlarmC = REFRIGERANT_RETURN_LOW_ALARM_C;
float refrigerantDeltaHighAlarmC = REFRIGERANT_DELTA_HIGH_ALARM_C;
float refrigerantDeltaLowAlarmC = REFRIGERANT_DELTA_LOW_ALARM_C;
uint32_t compressorAlarmEnableAfterS = COMPRESSOR_ALARM_ENABLE_AFTER_S_DEFAULT;
int di2TriggerRawLevel = 1;
int di3TriggerRawLevel = ALARM_INPUT_TRIGGER_RAW_LEVEL;
int di4TriggerRawLevel = 1;
/** @deprecated — sama kuin di3TriggerRawLevel (yhteensopivuus). */
int alarmInputTriggerRawLevel = ALARM_INPUT_TRIGGER_RAW_LEVEL;
/** DI3-reuna sammuttaa RO1:n ja aloittaa minimiviiveen. */
bool di3AlarmShutdownEnabled = true;

OneWire oneWire(ONE_WIRE_BUS_PIN);
DallasTemperature ds18b20(&oneWire);
/** Uusin 1-wire -luettelo (readSensors) → telemetria diagnostics/onewire_scan_text. */
static char g_onewireDiagSnapshot[700] = {'\0'};

Preferences preferences;
WebServer portalServer(80);

unsigned long lastReadMs = 0;
unsigned long lastControlPollMs = 0;
unsigned long lastPublishMs = 0;
bool portalSaved = false;
/** true kun RJ45 sai IP:n DHCP:lla (Ethernet on valittu WAN). */
bool g_wanEthernetActive = false;
/**
 * SOFTAP_PARALLEL: HTTP-portaalin käyttö RJ45 WAN:n rinnalla (pollataan loop()-issa).
 * Lukittu setup-AP-tila hoitaa handleClient:in omassa while-loopissaan.
 */
bool g_parallelEthernetCredentialPortal = false;
bool gEthernetFailsafeSoftApPump = false;
static bool g_credentialPortalRoutesRegistered = false;
static bool g_credentialPortalServerBegun = false;

bool relayControllerReady = false;
bool relayWriteOk = false;
uint8_t relayOutputCache = 0;
unsigned long lastSettingsPollMs = 0;
#if USE_OTA
unsigned long lastOtaPollMs = 0;
#endif
float outdoorAutoStopSignalC = NAN;
bool clockSynced = false;
bool alarmShutdownActive = false;
unsigned long alarmShutdownStartMs = 0;
bool prevDi3AlarmLevel = false;
bool g_di3DebouncedAlarm = false;
int g_di3DebounceStreak = 0;
bool g_di3FilteredSample = false;

// Hälytyslähtö (pilviasetus, NVS).
bool alarmOutputEnabled = ALARM_OUTPUT_ENABLED_DEFAULT != 0;
bool alarmOutputNc = ALARM_OUTPUT_NC_DEFAULT != 0;
uint8_t alarmOutputChannel = ALARM_RELAY_CHANNEL;
static uint8_t g_alarmOutputAppliedChannel = 0;
/** Pakota seuraava telemetria heti (asetus muuttui tms.). */
bool g_forceTelemetry = true;

struct StatusInputDebouncer {
  int pin;
  bool debounced = false;
  bool filtered = false;
  int streak = 0;
};

StatusInputDebouncer g_di4UnitReady;
StatusInputDebouncer g_di2Compressor;

Preferences defrostPreferences;
bool g_defrostActive = false;
unsigned long g_defrostStartMs = 0;
unsigned long g_defrostCooldownUntilMs = 0;
int g_defrostOffSamples = 0;
float g_defrostHistCoil[3] = {NAN, NAN, NAN};
float g_defrostHistSupply[3] = {NAN, NAN, NAN};
int g_defrostDayYmd = 0;
uint32_t g_defrostTodayCount = 0;
uint32_t g_defrostYesterdayCount = 0;
float g_defrostAvgDurationMin = 0.f;
uint32_t g_defrostAvgSampleCount = 0;
float g_lastDefrostCoilEndC = NAN;
float g_lastDefrostDurationMin = NAN;
uint64_t g_lastDefrostEndedMs = 0;
bool g_prevHeatDemandForDefrost = false;
unsigned long g_heatDemandOnMs = 0;

static uint32_t ipAddressToEspNetifV4(const IPAddress &ip) {
  return ESP_IP4TOADDR(ip[0], ip[1], ip[2], ip[3]);
}

/** Monilla LAN-reitittimillä DHCP palauttaa tyhjää / rikkinäistä DNS:ää → NTP/pilvi epäonnistuu. */
static void espNetifSetDnsV4(esp_netif_t *netif, const IPAddress &mainDns,
                              const IPAddress &backupDns) {
  if (netif == nullptr) {
    return;
  }

  esp_netif_dns_info_t primary{};
  primary.ip.type = ESP_IPADDR_TYPE_V4;
  primary.ip.u_addr.ip4.addr = ipAddressToEspNetifV4(mainDns);
  esp_netif_dns_info_t backup{};
  backup.ip.type = ESP_IPADDR_TYPE_V4;
  backup.ip.u_addr.ip4.addr = ipAddressToEspNetifV4(backupDns);

  esp_netif_set_dns_info(netif, ESP_NETIF_DNS_MAIN, &primary);
  esp_netif_set_dns_info(netif, ESP_NETIF_DNS_BACKUP, &backup);
}

static void espNetifApplyFallbackDns(esp_netif_t *netif) {
  espNetifSetDnsV4(netif, IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));
}

/** GSM-hotspotit: gateway-DNS ensin (8.8.8.8 usein blokattu / ei reititetty). */
static void espNetifApplyWifiGatewayDns(esp_netif_t *netif, IPAddress gw) {
  const IPAddress mainDns =
      (gw != IPAddress(0, 0, 0, 0) && gw != IPAddress(255, 255, 255, 255))
          ? gw
          : IPAddress(8, 8, 8, 8);
  const IPAddress backupDns(1, 1, 1, 1);
  espNetifSetDnsV4(netif, mainDns, backupDns);
}

bool isNetworkConnected();
bool connectToWiFi(const String &ssid, const String &password, uint32_t timeoutMs);
void saveWiFiCredentials(const String &ssid, const String &password);

struct SensorPoint {
  const char *key;
  const uint8_t *address;
  float celsius;
  bool valid;
};

/**
 * INDEX fallback: rivin indeksi i on sama kuin 1-Wire-search -järjestys.
 * Oletusasennus (5 anturia, ei telttaa ketjussa): Ulko -> Kenno -> Meno -> Paluu -> HG;
 * outdoor_tent_c on viimeisenä jotta viimeinen slotti voi puuttua / peilata ulkoa.
 */
SensorPoint sensorPoints[] = {
    {"outdoor_c", SENSOR_ADDR_OUTDOOR, NAN, false},
    {"outdoor_coil_c", SENSOR_ADDR_OUTDOOR_COIL, NAN, false},
    {"refrigerant_supply_c", SENSOR_ADDR_REFRIGERANT_SUPPLY, NAN, false},
    {"refrigerant_return_c", SENSOR_ADDR_REFRIGERANT_RETURN, NAN, false},
    {"hot_gas_c", SENSOR_ADDR_HOT_GAS, NAN, false},
    {"outdoor_tent_c", SENSOR_ADDR_OUTDOOR_TENT, NAN, false},
};

void readSensors();

const char *kPrefsNamespace = "wifi_cfg";
const char *kPrefsSsidKey = "ssid";
const char *kPrefsPassKey = "pass";

// Last known cloud mirror (survives reboot / offline).
const char *kCloudPrefsNamespace = "vrf_cloud";
constexpr uint32_t kCloudMirrorMagic = 0x56465205;  // V2: erilliset DI-laukaisutasot

struct CloudMirrorV1 {
  uint32_t magic;
  bool heat_en;
  bool auto_stop_en;
  float auto_stop_c;
  float hot_gas;
  float ref_ret_l;
  float ref_delta_h;
  float ref_delta_l;
  uint32_t comp_delay_s;
  uint8_t di2_tr;
  uint8_t di3_tr;
  uint8_t di4_tr;
};

static CloudMirrorV1 g_lastSavedMirror = {};
static bool g_haveLastSavedMirror = false;

void loadCloudMirrorFromNvs();
void mirrorFromState(CloudMirrorV1 *out);
bool mirrorEquals(const CloudMirrorV1 *a, const CloudMirrorV1 *b);
void saveCloudMirrorToNvsIfChanged();

constexpr uint8_t kTca9554RegInput = 0x00;
constexpr uint8_t kTca9554RegOutput = 0x01;
constexpr uint8_t kTca9554RegPolarity = 0x02;
constexpr uint8_t kTca9554RegConfig = 0x03;

bool exioWriteRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(RELAY_EXIO_I2C_ADDR);
  Wire.write(reg);
  Wire.write(value);
  const uint8_t err = Wire.endTransmission();
  return err == 0;
}

bool setupRelayController() {
  Wire.begin(RELAY_EXIO_SDA_PIN, RELAY_EXIO_SCL_PIN);
  // All pins as outputs, normal polarity, all off at boot.
  if (!exioWriteRegister(kTca9554RegConfig, 0x00)) {
    return false;
  }
  if (!exioWriteRegister(kTca9554RegPolarity, 0x00)) {
    return false;
  }
  relayOutputCache = 0x00;
  return exioWriteRegister(kTca9554RegOutput, relayOutputCache);
}

void setRelayChannelEnergized(const uint8_t channel1Based, const bool energized,
                              const bool activeHigh) {
  if (channel1Based < 1 || channel1Based > 8) {
    return;
  }
  const uint8_t relayBit = static_cast<uint8_t>(channel1Based - 1);
  const bool shouldSetBit = activeHigh ? energized : !energized;
  if (shouldSetBit) {
    relayOutputCache =
        relayOutputCache | static_cast<uint8_t>(1U << relayBit);
  } else {
    relayOutputCache =
        relayOutputCache & static_cast<uint8_t>(~(1U << relayBit));
  }
}

bool relayChannelPhysicallyEnergized(const uint8_t channel1Based,
                                     const bool activeHigh) {
  if (channel1Based < 1 || channel1Based > 8) {
    return false;
  }
  const uint8_t relayBit = static_cast<uint8_t>(channel1Based - 1);
  const bool bitSet =
      (relayOutputCache & static_cast<uint8_t>(1U << relayBit)) != 0;
  return activeHigh ? bitSet : !bitSet;
}

bool alarmOutputChannelValid(const int channel) {
  return channel >= ALARM_OUTPUT_CHANNEL_MIN && channel <= ALARM_OUTPUT_CHANNEL_MAX &&
         channel != HEAT_ENABLE_RELAY_CHANNEL;
}

/** NO: vetää hälytyksessä. NC: vetää normaalisti, päästää hälytyksessä. Pois käytöstä: aina virraton. */
bool alarmOutputDesiredEnergized() {
  if (!alarmOutputEnabled) {
    return false;
  }
  return alarmOutputNc ? !g_di3DebouncedAlarm : g_di3DebouncedAlarm;
}

void applyRelayOutputs() {
  const bool userWantsHeat = heatEnabled;
  const bool effectiveHeatOn =
      userWantsHeat && (!alarmShutdownActive || !di3AlarmShutdownEnabled);
  setRelayChannelEnergized(HEAT_ENABLE_RELAY_CHANNEL, effectiveHeatOn,
                           HEAT_ENABLE_ACTIVE_HIGH);
  if (!alarmOutputChannelValid(alarmOutputChannel)) {
    alarmOutputChannel = ALARM_RELAY_CHANNEL;
  }
  if (g_alarmOutputAppliedChannel != 0 && g_alarmOutputAppliedChannel != alarmOutputChannel &&
      alarmOutputChannelValid(g_alarmOutputAppliedChannel)) {
    // Kanava vaihtui: vanha lähtö lepoon.
    setRelayChannelEnergized(g_alarmOutputAppliedChannel, false, ALARM_RELAY_ACTIVE_HIGH);
  }
  setRelayChannelEnergized(alarmOutputChannel, alarmOutputDesiredEnergized(),
                           ALARM_RELAY_ACTIVE_HIGH);
  g_alarmOutputAppliedChannel = alarmOutputChannel;
  relayWriteOk = relayControllerReady &&
                 exioWriteRegister(kTca9554RegOutput, relayOutputCache);
}

void applyHeatOutput() {
  applyRelayOutputs();
}

void initStatusDiPin(const int pin) {
#if DI_STATUS_USE_PULLUP
  pinMode(pin, INPUT_PULLUP);
#else
  pinMode(pin, INPUT);
#endif
}

int readStatusDiGpioRaw(const int pin) {
  return digitalRead(pin) == HIGH ? 1 : 0;
}

int readStatusDiExternalRaw(const int pin) {
#if DI_STATUS_OPTO_INVERTED
  return digitalRead(pin) == LOW ? 1 : 0;
#else
  return digitalRead(pin) == HIGH ? 1 : 0;
#endif
}

/** Vähintään yksi opto johtaa → DI-kisko näyttää aktiiviselta (ei kaikki irrallaan). */
bool statusDiBusEnergized() {
  return readStatusDiGpioRaw(DI2_COMPRESSOR_PIN) == 0 ||
         readStatusDiGpioRaw(ALARM_INPUT_PIN) == 0 ||
         readStatusDiGpioRaw(DI4_UNIT_READY_PIN) == 0;
}

bool readStatusDiInstant(const int pin, const int triggerRawLevel) {
  return readStatusDiExternalRaw(pin) == triggerRawLevel;
}

bool readStatusDiFiltered(const int pin, const int triggerRawLevel) {
  int activeVotes = 0;
  for (int i = 0; i < DI_STATUS_MAJORITY_SAMPLES; ++i) {
    if (readStatusDiInstant(pin, triggerRawLevel)) {
      ++activeVotes;
    }
    delayMicroseconds(400);
  }
  return activeVotes >= DI_STATUS_MAJORITY_MIN;
}

void updateStatusInputDebouncer(StatusInputDebouncer &input, const int triggerRawLevel) {
  input.filtered = readStatusDiFiltered(input.pin, triggerRawLevel);
  if (input.filtered == input.debounced) {
    input.streak = 0;
    return;
  }
  ++input.streak;
  if (input.streak >= DI_STATUS_DEBOUNCE_SAMPLES) {
    input.debounced = input.filtered;
    input.streak = 0;
  }
}

/** Yksittäinen DI3-luku (ei debounce). */
bool readAlarmInputInstant() {
  return readStatusDiInstant(ALARM_INPUT_PIN, di3TriggerRawLevel);
}

/** Useita lukuja per mittaus — estää hetkellisen häilyksen. */
bool readAlarmInputFiltered() {
  int activeVotes = 0;
  for (int i = 0; i < DI3_ALARM_MAJORITY_SAMPLES; ++i) {
    if (readAlarmInputInstant()) {
      ++activeVotes;
    }
    delayMicroseconds(400);
  }
  return activeVotes >= DI3_ALARM_MAJORITY_MIN;
}

void updateDi3AlarmDebouncedState() {
  g_di3FilteredSample = readAlarmInputFiltered();
  if (g_di3FilteredSample == g_di3DebouncedAlarm) {
    g_di3DebounceStreak = 0;
    return;
  }
  ++g_di3DebounceStreak;
  if (g_di3DebounceStreak >= DI3_ALARM_DEBOUNCE_SAMPLES) {
    g_di3DebouncedAlarm = g_di3FilteredSample;
    g_di3DebounceStreak = 0;
    applyRelayOutputs();
  }
}

/** Debounced DI3 — käytetään hälytyksessä, telemetriaan ja hälytystauossa. */
bool readAlarmInputDebounced() {
  return g_di3DebouncedAlarm;
}

bool readAlarmInput() {
  return readAlarmInputDebounced();
}

int readAlarmInputRaw() {
  return readStatusDiExternalRaw(ALARM_INPUT_PIN);
}

bool getSensorValue(const char *key, float *outValue) {
  for (const auto &point : sensorPoints) {
    if (strcmp(point.key, key) == 0 && point.valid) {
      *outValue = point.celsius;
      return true;
    }
  }
  return false;
}

void mirrorFromState(CloudMirrorV1 *out) {
  memset(out, 0, sizeof(CloudMirrorV1));
  out->magic = kCloudMirrorMagic;
  out->heat_en = heatEnabled;
  out->auto_stop_en = autoStopEnabled;
  out->auto_stop_c = autoStopBelowOutdoorC;
  out->hot_gas = hotGasHighAlarmC;
  out->ref_ret_l = refrigerantReturnLowAlarmC;
  out->ref_delta_h = refrigerantDeltaHighAlarmC;
  out->ref_delta_l = refrigerantDeltaLowAlarmC;
  out->comp_delay_s = compressorAlarmEnableAfterS;
  out->di2_tr = static_cast<uint8_t>(di2TriggerRawLevel == 0 ? 0 : 1);
  out->di3_tr = static_cast<uint8_t>(di3TriggerRawLevel == 0 ? 0 : 1);
  out->di4_tr = static_cast<uint8_t>(di4TriggerRawLevel == 0 ? 0 : 1);
}

bool mirrorEquals(const CloudMirrorV1 *a, const CloudMirrorV1 *b) {
  return memcmp(a, b, sizeof(CloudMirrorV1)) == 0;
}

void loadCloudMirrorFromNvs() {
  CloudMirrorV1 loaded;
  memset(&loaded, 0, sizeof(loaded));
  preferences.begin(kCloudPrefsNamespace, true);
  const size_t sz =
      preferences.getBytesLength("mirror_v1");
  if (sz != sizeof(CloudMirrorV1)) {
    preferences.end();
    Serial.println("NVS: ei tallessa olevaa pilvi-peilausta, kaytetaan oletuksia.");
    return;
  }
  preferences.getBytes("mirror_v1", &loaded, sizeof(CloudMirrorV1));
  preferences.end();

  if (loaded.magic != kCloudMirrorMagic) {
    Serial.println("NVS: pilvi-peilauksen versio ei tasmaa, kaytetaan oletuksia.");
    return;
  }

  heatEnabled = loaded.heat_en;
  permitRequestedFromCloud = heatEnabled;
  autoStopEnabled = loaded.auto_stop_en;
  autoStopBelowOutdoorC = loaded.auto_stop_c;
  hotGasHighAlarmC = loaded.hot_gas;
  refrigerantReturnLowAlarmC = loaded.ref_ret_l;
  refrigerantDeltaHighAlarmC = loaded.ref_delta_h;
  refrigerantDeltaLowAlarmC = loaded.ref_delta_l;
  compressorAlarmEnableAfterS = loaded.comp_delay_s;
  di2TriggerRawLevel = loaded.di2_tr == 0 ? 0 : 1;
  di3TriggerRawLevel = loaded.di3_tr == 0 ? 0 : 1;
  di4TriggerRawLevel = loaded.di4_tr == 0 ? 0 : 1;
  alarmInputTriggerRawLevel = di3TriggerRawLevel;

  g_lastSavedMirror = loaded;
  g_haveLastSavedMirror = true;
  Serial.println("NVS: viimeinen pilvi-peilaus ladattu (ohjaus + asetukset).");
}

struct AlarmOutputNvs {
  uint32_t magic;
  uint8_t enabled;
  uint8_t nc;
  uint8_t channel;
  uint8_t reserved;
};
constexpr uint32_t kAlarmOutputMagic = 0x414F5401;  // "AOT" v1

void loadAlarmOutputFromNvs() {
  AlarmOutputNvs v;
  memset(&v, 0, sizeof(v));
  preferences.begin(kCloudPrefsNamespace, true);
  const size_t sz = preferences.getBytesLength("alarm_out");
  if (sz == sizeof(v)) {
    preferences.getBytes("alarm_out", &v, sizeof(v));
  }
  preferences.end();
  if (sz != sizeof(v) || v.magic != kAlarmOutputMagic) {
    Serial.println("NVS: halytyslahto oletuksilla (NO, CH8).");
    return;
  }
  alarmOutputEnabled = v.enabled != 0;
  alarmOutputNc = v.nc != 0;
  alarmOutputChannel = alarmOutputChannelValid(v.channel) ? v.channel : ALARM_RELAY_CHANNEL;
  Serial.printf("NVS: halytyslahto %s, %s, CH%u\n", alarmOutputEnabled ? "kaytossa" : "pois",
                alarmOutputNc ? "NC" : "NO", static_cast<unsigned>(alarmOutputChannel));
}

void saveAlarmOutputToNvs() {
  AlarmOutputNvs v;
  memset(&v, 0, sizeof(v));
  v.magic = kAlarmOutputMagic;
  v.enabled = alarmOutputEnabled ? 1 : 0;
  v.nc = alarmOutputNc ? 1 : 0;
  v.channel = alarmOutputChannel;
  preferences.begin(kCloudPrefsNamespace, false);
  preferences.putBytes("alarm_out", &v, sizeof(v));
  preferences.end();
}

/** Pilviasetus → hälytyslähtö. Palauttaa true jos jotain muuttui. */
bool applyAlarmOutputSettings(const bool hasEnabled, const bool enabled, const bool hasMode,
                              const bool nc, const bool hasChannel, const int channel) {
  bool changed = false;
  if (hasEnabled && enabled != alarmOutputEnabled) {
    alarmOutputEnabled = enabled;
    changed = true;
  }
  if (hasMode && nc != alarmOutputNc) {
    alarmOutputNc = nc;
    changed = true;
  }
  if (hasChannel) {
    if (!alarmOutputChannelValid(channel)) {
      Serial.printf("Halytyslahto: kanava %d ei kelpaa (sallittu %d-%d, ei CH%d) — ohitetaan.\n", channel,
                    ALARM_OUTPUT_CHANNEL_MIN, ALARM_OUTPUT_CHANNEL_MAX, HEAT_ENABLE_RELAY_CHANNEL);
    } else if (static_cast<uint8_t>(channel) != alarmOutputChannel) {
      alarmOutputChannel = static_cast<uint8_t>(channel);
      changed = true;
    }
  }
  if (changed) {
    applyRelayOutputs();
    saveAlarmOutputToNvs();
    g_forceTelemetry = true;
    Serial.printf("Halytyslahto paivitetty: %s, %s, CH%u\n", alarmOutputEnabled ? "kaytossa" : "pois",
                  alarmOutputNc ? "NC" : "NO", static_cast<unsigned>(alarmOutputChannel));
  }
  return changed;
}

void saveCloudMirrorToNvsIfChanged() {
  CloudMirrorV1 now;
  mirrorFromState(&now);
  if (g_haveLastSavedMirror && mirrorEquals(&now, &g_lastSavedMirror)) {
    return;
  }

  preferences.begin(kCloudPrefsNamespace, false);
  const size_t written =
      preferences.putBytes("mirror_v1", &now, sizeof(CloudMirrorV1));
  preferences.end();

  if (written == sizeof(CloudMirrorV1)) {
    g_lastSavedMirror = now;
    g_haveLastSavedMirror = true;
    Serial.println("NVS: pilvi-peilaus tallennettu.");
  } else {
    Serial.printf("NVS: tallennus epaonnistui (kirjoitettiin %u tavua)\n",
                  static_cast<unsigned>(written));
  }
}

void updateDi3AlarmShutdown() {
  const bool diBusEnergized = statusDiBusEnergized();
  updateStatusInputDebouncer(g_di4UnitReady, di4TriggerRawLevel);
  updateStatusInputDebouncer(g_di2Compressor, di2TriggerRawLevel);
  updateDi3AlarmDebouncedState();

  // di_bus_energized vain diagnostiikkaan — DI2/DI3/DI4 luetaan aina (myös käyntilupa pois).
  (void)diBusEnergized;

  const bool di3 = g_di3DebouncedAlarm;
  const unsigned long now = millis();

  if (!di3AlarmShutdownEnabled) {
    if (alarmShutdownActive) {
      alarmShutdownActive = false;
      applyHeatOutput();
    }
    prevDi3AlarmLevel = di3;
    return;
  }

  static bool di3EdgeBaselineReady = false;
  if (!di3EdgeBaselineReady) {
    prevDi3AlarmLevel = di3;
    di3EdgeBaselineReady = true;
    return;
  }

  if (!alarmShutdownActive) {
    if (di3 && !prevDi3AlarmLevel) {
      alarmShutdownActive = true;
      alarmShutdownStartMs = now;
      applyHeatOutput();
      Serial.println("DI3 alarm edge: heat forced OFF (minimum 30 min; release when clear).");
    }
  } else {
    const unsigned long elapsed = now - alarmShutdownStartMs;
    const bool minElapsed = elapsed >= DI3_ALARM_SHUTDOWN_DURATION_MS;
    if (minElapsed && !di3) {
      alarmShutdownActive = false;
      applyHeatOutput();
      Serial.println("DI3 lockout ended: alarm cleared, heat follows cloud command.");
    }
  }

  prevDi3AlarmLevel = di3;
}

void enforceOutdoorSafetyLock() {
  if (!autoStopEnabled) {
    outdoorSafetyLockActive = false;
    outdoorAutoStopSignalC = NAN;
    gOutdoorAutoStopEma = NAN;
    return;
  }

  float outdoor = NAN;
  if (!getSensorValue("outdoor_c", &outdoor)) {
    outdoorAutoStopSignalC = NAN;
    return;
  }

  float ctrlOutdoor = outdoor;
  if (outdoorAutoStopSmoothTauMin > 0U) {
    const float tauMs =
        static_cast<float>(outdoorAutoStopSmoothTauMin) * 60000.0f;
    const float dt = static_cast<float>(READ_INTERVAL_MS);
    const float alpha = dt / (tauMs + dt);
    if (isnan(gOutdoorAutoStopEma)) {
      gOutdoorAutoStopEma = outdoor;
    } else {
      gOutdoorAutoStopEma =
          alpha * outdoor + (1.0f - alpha) * gOutdoorAutoStopEma;
    }
    ctrlOutdoor = gOutdoorAutoStopEma;
  } else {
    gOutdoorAutoStopEma = NAN;
  }

  outdoorAutoStopSignalC = ctrlOutdoor;

  const float releaseAbove =
      autoStopBelowOutdoorC +
      (outdoorAutoStopHysteresisC < 0.f ? 0.f : outdoorAutoStopHysteresisC);

  if (!outdoorSafetyLockActive) {
    if (ctrlOutdoor <= autoStopBelowOutdoorC) {
      outdoorSafetyLockActive = true;
      if (heatEnabled) {
        heatEnabled = false;
        applyHeatOutput();
        saveCloudMirrorToNvsIfChanged();
        Serial.printf(
            "Safety lock ON: outdoor ctrl %.2f C <= %.2f C (raw %.2f C), heat "
            "disabled.\n",
            ctrlOutdoor,
            autoStopBelowOutdoorC,
            outdoor);
      }
    }
    return;
  }

  if (heatEnabled) {
    heatEnabled = false;
    applyHeatOutput();
    saveCloudMirrorToNvsIfChanged();
  }

  if (ctrlOutdoor >= releaseAbove) {
    outdoorSafetyLockActive = false;
    Serial.printf(
        "Safety lock OFF: outdoor ctrl %.2f C >= %.2f C (release = below + "
        "%.2f C; raw %.2f C).\n",
        ctrlOutdoor,
        releaseAbove,
        outdoorAutoStopHysteresisC < 0.f ? 0.f : outdoorAutoStopHysteresisC,
        outdoor);
  }
}

#if USE_ETHERNET
bool ethernetHasIp() {
  return ETH.localIP() != IPAddress(0, 0, 0, 0);
}

static void lwipSetGlobalDnsPrimaryBackup(const IPAddress &mainDns,
                                          const IPAddress &backupDns) {
  ip_addr_t d1{};
  IP4_ADDR(ip_2_ip4(&d1), mainDns[0], mainDns[1], mainDns[2], mainDns[3]);
  dns_setserver(0, &d1);
  ip_addr_t d2{};
  IP4_ADDR(ip_2_ip4(&d2), backupDns[0], backupDns[1], backupDns[2],
           backupDns[3]);
  dns_setserver(1, &d2);
}

void ensureEthernetDefaultWanNetif() {
  if (!ethernetHasIp()) {
    return;
  }
  esp_netif_t *eth_n = esp_netif_get_handle_from_ifkey("ETH_DEF");
  if (eth_n == nullptr) {
    return;
  }
  struct netif *lwip_n =
      static_cast<struct netif *>(esp_netif_get_netif_impl(eth_n));
  if (lwip_n != nullptr) {
    netif_set_default(lwip_n);
    Serial.println("[NET] Oletus-WAN: Ethernet lwIP netif (SoftAP ei ohjaa).");
  }
}

static bool probeWanDnsOnce(const char *host) {
  ensureEthernetDefaultWanNetif();
  IPAddress resolved;
  if (WiFi.hostByName(host, resolved)) {
    Serial.printf("[NET] DNS OK %s -> %s\n", host, resolved.toString().c_str());
    return true;
  }
  const IPAddress gw = ETH.gatewayIP();
  if (gw != IPAddress(0, 0, 0, 0)) {
    const IPAddress backup(ETH_DNA_DNS1_A, ETH_DNA_DNS1_B, ETH_DNA_DNS1_C,
                           ETH_DNA_DNS1_D);
    esp_netif_t *eth_n = esp_netif_get_handle_from_ifkey("ETH_DEF");
    if (eth_n != nullptr) {
      espNetifSetDnsV4(eth_n, gw, backup);
    }
    lwipSetGlobalDnsPrimaryBackup(gw, backup);
    Serial.printf("[NET] DNS uudelleen gatewaylla %s\n", gw.toString().c_str());
    delay(300);
    if (WiFi.hostByName(host, resolved)) {
      Serial.printf("[NET] DNS OK (GW) %s -> %s\n", host,
                    resolved.toString().c_str());
      return true;
    }
  }
  Serial.printf("[NET] DNS FAIL %s\n", host);
  return false;
}

void applyEthernetWanDns() {
  esp_netif_t *eth_n = esp_netif_get_handle_from_ifkey("ETH_DEF");
  if (eth_n == nullptr) {
    Serial.println("[NET] VAROITUS: ETH_DEF netif puuttuu — DNS-fallback ohitettu.");
    return;
  }
  const IPAddress gw = ETH.gatewayIP();
  if (gw[0] == ETH_DNA_GW_A && gw[1] == ETH_DNA_GW_B && gw[2] == ETH_DNA_GW_C &&
      gw[3] == ETH_DNA_GW_D) {
    const IPAddress d1(ETH_DNA_DNS1_A, ETH_DNA_DNS1_B, ETH_DNA_DNS1_C,
                       ETH_DNA_DNS1_D);
    espNetifSetDnsV4(eth_n, gw, d1);
    lwipSetGlobalDnsPrimaryBackup(gw, d1);
    Serial.print("[NET] DNS DNA (Ethernet): gateway ");
    Serial.print(gw);
    Serial.print(F(" / "));
    Serial.println(d1);
  } else if (gw != IPAddress(0, 0, 0, 0) && gw != IPAddress(255, 255, 255, 255)) {
    espNetifSetDnsV4(eth_n, gw, IPAddress(1, 1, 1, 1));
    lwipSetGlobalDnsPrimaryBackup(gw, IPAddress(1, 1, 1, 1));
    Serial.print("[NET] DNS gateway (Ethernet): ");
    Serial.println(gw);
  } else {
    espNetifApplyFallbackDns(eth_n);
    lwipSetGlobalDnsPrimaryBackup(IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));
    Serial.println("[NET] DNS fallback kaytossa (Ethernet).");
  }
  ensureEthernetDefaultWanNetif();
}

bool tryConfigureEthStatic(const IPAddress &ip, const IPAddress &gw,
                           const IPAddress &mask, const IPAddress &dns1,
                           const IPAddress &dns2) {
  if (!ETH.linkUp()) {
    return false;
  }
  Serial.printf("[ETH] Staattinen kokeilu: IP=%s GW=%s DNS=%s\n",
                ip.toString().c_str(), gw.toString().c_str(),
                dns1.toString().c_str());
  if (!ETH.config(ip, gw, mask, dns1, dns2)) {
    return false;
  }
  delay(400);
  return ETH.localIP() == ip;
}

bool tryEthStaticFallbackAfterDhcp() {
#if !ETH_STATIC_FALLBACK_AFTER_DHCP
  return false;
#else
  struct Candidate {
    uint8_t ip[4];
    uint8_t gw[4];
    uint8_t dns1[4];
    uint8_t dns2[4];
  };
  static const Candidate k[] = {
      {{ETH_DNA_DEV_A, ETH_DNA_DEV_B, ETH_DNA_DEV_C, ETH_DNA_DEV_D},
       {ETH_DNA_GW_A, ETH_DNA_GW_B, ETH_DNA_GW_C, ETH_DNA_GW_D},
       {ETH_DNA_GW_A, ETH_DNA_GW_B, ETH_DNA_GW_C, ETH_DNA_GW_D},
       {ETH_DNA_DNS1_A, ETH_DNA_DNS1_B, ETH_DNA_DNS1_C, ETH_DNA_DNS1_D}},
      {{192, 168, 8, 100}, {192, 168, 8, 1}, {8, 8, 8, 8}, {1, 1, 1, 1}},
      {{192, 168, 1, 100}, {192, 168, 1, 1}, {8, 8, 8, 8}, {1, 1, 1, 1}},
      {{192, 168, 0, 100}, {192, 168, 0, 1}, {8, 8, 8, 8}, {1, 1, 1, 1}},
  };
  const IPAddress mask(255, 255, 255, 0);
  for (const auto &c : k) {
    const IPAddress ip(c.ip[0], c.ip[1], c.ip[2], c.ip[3]);
    const IPAddress gw(c.gw[0], c.gw[1], c.gw[2], c.gw[3]);
    const IPAddress dns1(c.dns1[0], c.dns1[1], c.dns1[2], c.dns1[3]);
    const IPAddress dns2(c.dns2[0], c.dns2[1], c.dns2[2], c.dns2[3]);
    if (tryConfigureEthStatic(ip, gw, mask, dns1, dns2)) {
      applyEthernetWanDns();
      if (probeWanDnsOnce("www.googleapis.com")) {
        Serial.print("[ETH] Staattinen WAN ok: ");
        Serial.println(ETH.localIP());
        return true;
      }
      Serial.println(
          "[ETH] Staattinen IP paikallinen, DNS ei vastaa — seuraava kokeilu.");
    }
  }
  return false;
#endif
}

#if ETH_WIFI_WAN_IF_RJ45_NO_IP
bool tryWifiWanFallbackNoModemAccess() {
  Serial.println(
      "[NET] RJ45 ei DHCP:ta — yritetaan Wi-Fi STAta pilveen.");
  const String buildSsid = WIFI_SSID;
  const String buildPassword = WIFI_PASSWORD;
  if (buildSsid.isEmpty() || buildSsid == "YOUR_WIFI_SSID") {
    return false;
  }
  saveWiFiCredentials(buildSsid, buildPassword);
  return connectToWiFi(buildSsid, buildPassword, WIFI_CONNECT_TIMEOUT_MS);
}
#endif

#if USE_ETHERNET
static void enableSoftApOnlyPreservingEthernet() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect(true, true);
  delay(80);
}
#endif

bool tryConfigureEthStatic(const IPAddress &ip, const IPAddress &gw,
                           const IPAddress &mask) {
  return tryConfigureEthStatic(ip, gw, mask, gw, IPAddress(1, 1, 1, 1));
}

bool waitForEthernetReady(uint32_t timeoutMs) {
  const unsigned long start = millis();
  unsigned long lastLog = 0;

  while (millis() - start < 15000UL) {
    if (ETH.linkUp()) {
      break;
    }
    delay(200);
  }
  if (!ETH.linkUp()) {
    Serial.println("[ETH] Linkki ei noussut 15 s:ssa");
    return false;
  }
  Serial.println("[ETH] Linkki ylos, odotetaan DHCP:aa...");
  esp_eth_handle_t eh = w5500EthernetHandle();
  if (eh != nullptr) {
    uint8_t mac[6];
    if (esp_eth_ioctl(eh, ETH_CMD_G_MAC_ADDR, mac) == ESP_OK) {
      Serial.printf(
          "[ETH] MAC: %02X:%02X:%02X:%02X:%02X:%02X\n", mac[0], mac[1],
          mac[2], mac[3], mac[4], mac[5]);
    }
  }
  delay(2500);
  esp_netif_t *eth_n = esp_netif_get_handle_from_ifkey("ETH_DEF");
  if (eth_n != nullptr) {
    esp_netif_dhcpc_stop(eth_n);
    esp_netif_dhcpc_start(eth_n);
  }

  const unsigned long dhcpStart = millis();
  while (millis() - dhcpStart < timeoutMs) {
    if (ethernetHasIp()) {
      return true;
    }
    if (millis() - lastLog >= 5000UL) {
      lastLog = millis();
      Serial.printf("[ETH] DHCP odottaa... linkUp=%d IP=%s\n",
                    ETH.linkUp() ? 1 : 0,
                    ETH.localIP().toString().c_str());
    }
    delay(250);
  }
  return ethernetHasIp();
}
#endif

String htmlEscape(const String &input) {
  String output = input;
  output.replace("&", "&amp;");
  output.replace("<", "&lt;");
  output.replace(">", "&gt;");
  output.replace("\"", "&quot;");
  return output;
}

String scannedNetworksOptions() {
  String options;
  const int count = WiFi.scanNetworks(false, true);
  if (count <= 0) {
    options = "<option value=''>Ei verkkoja loytynyt</option>";
    return options;
  }

  for (int i = 0; i < count; ++i) {
    const String ssid = WiFi.SSID(i);
    if (ssid.isEmpty()) {
      continue;
    }

    const String encrypted = WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "locked";
    options += "<option value='" + htmlEscape(ssid) + "'>" + htmlEscape(ssid) + " (" + encrypted + ", RSSI " + String(WiFi.RSSI(i)) + " dBm)</option>";
  }

  if (options.isEmpty()) {
    options = "<option value=''>Ei verkkoja loytynyt</option>";
  }

  return options;
}

void saveWiFiCredentials(const String &ssid, const String &password) {
  preferences.begin(kPrefsNamespace, false);
  preferences.putString(kPrefsSsidKey, ssid);
  preferences.putString(kPrefsPassKey, password);
  preferences.end();
}

bool loadWiFiCredentials(String *ssid, String *password) {
  preferences.begin(kPrefsNamespace, true);
  *ssid = preferences.getString(kPrefsSsidKey, "");
  *password = preferences.getString(kPrefsPassKey, "");
  preferences.end();
  return !ssid->isEmpty();
}

void clearWiFiCredentials() {
  preferences.begin(kPrefsNamespace, false);
  preferences.remove(kPrefsSsidKey);
  preferences.remove(kPrefsPassKey);
  preferences.end();
}

bool connectToWiFi(const String &ssid, const String &password, uint32_t timeoutMs) {
  static const char *kNetTag = "NET_WIFI";

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(200);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);

  String targetSsid = ssid;
  const int scanCount = WiFi.scanNetworks(false, true);
  ESP_LOGI(kNetTag, "Scan: %d verkko(a), haetaan '%s'", scanCount, ssid.c_str());
  for (int i = 0; i < scanCount; ++i) {
    const String found = WiFi.SSID(i);
    ESP_LOGI(kNetTag, "  [%d] '%s' RSSI=%d enc=%d",
             i, found.c_str(), WiFi.RSSI(i), WiFi.encryptionType(i));
    if (found.equalsIgnoreCase(ssid)) {
      targetSsid = found;
    }
  }

  ESP_LOGI(kNetTag, "Yhdistetaan: '%s'", targetSsid.c_str());
  WiFi.begin(targetSsid.c_str(), password.c_str());

  const unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    const wl_status_t st = WiFi.status();
    if (st == WL_CONNECTED) {
      ESP_LOGI(kNetTag, "Wi-Fi OK IP=%s GW=%s RSSI=%d",
               WiFi.localIP().toString().c_str(),
               WiFi.gatewayIP().toString().c_str(), WiFi.RSSI());
      Serial.print("Wi-Fi connected, IP: ");
      Serial.println(WiFi.localIP());
      esp_netif_t *sta = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
      delay(2000);
      IPAddress resolved;
      auto tryDnsHost = [&](const char *host) -> bool {
        return WiFi.hostByName(host, resolved);
      };
      if (tryDnsHost("www.googleapis.com")) {
        ESP_LOGI(kNetTag, "DNS OK (DHCP) googleapis.com -> %s",
                 resolved.toString().c_str());
      } else if (sta != nullptr) {
        const IPAddress gw = WiFi.gatewayIP();
        espNetifApplyWifiGatewayDns(sta, gw);
        ESP_LOGI(kNetTag, "DNS primary=%s (GW) backup=1.1.1.1",
                 gw.toString().c_str());
        if (tryDnsHost("www.googleapis.com")) {
          ESP_LOGI(kNetTag, "DNS OK googleapis.com -> %s",
                   resolved.toString().c_str());
        } else {
          ESP_LOGW(kNetTag, "Gateway DNS fail, kokeillaan 8.8.8.8");
          espNetifSetDnsV4(sta, IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));
          if (tryDnsHost("www.googleapis.com")) {
            ESP_LOGI(kNetTag, "DNS OK googleapis.com -> %s",
                     resolved.toString().c_str());
          } else {
            ESP_LOGW(kNetTag, "DNS FAIL googleapis.com (tarkista modeemin mobiilidata)");
          }
        }
      }
      Serial.println("[NET] DNS asetettu WiFi STA.");
      return true;
    }
    delay(250);
  }

  ESP_LOGW(kNetTag, "Wi-Fi timeout SSID='%s' status=%d", targetSsid.c_str(),
           static_cast<int>(WiFi.status()));
  Serial.printf("Wi-Fi connect timeout for SSID: %s\n", targetSsid.c_str());
  return false;
}

String currentIpString() {
#if USE_ETHERNET
  if (ethernetHasIp()) {
    return ETH.localIP().toString();
  }
#endif
  if (WiFi.status() == WL_CONNECTED) {
    return WiFi.localIP().toString();
  }
  return String("0.0.0.0");
}

bool isNetworkConnected() {
#if USE_ETHERNET
  if (ethernetHasIp()) {
    return true;
  }
#endif
  return WiFi.status() == WL_CONNECTED;
}

void setupClock() {
  // Finland timezone with DST (EET/EEST).
  configTzTime("EET-2EEST,M3.5.0/3,M10.5.0/4", "pool.ntp.org", "time.google.com");
  const unsigned long start = millis();
  while (millis() - start < 30000UL) {
    const time_t now = time(nullptr);
    if (now > 1700000000) {
      clockSynced = true;
      Serial.printf("Clock synced: %ld\n", static_cast<long>(now));
      return;
    }
    delay(250);
  }
  clockSynced = false;
  Serial.println("Clock sync failed, using millis fallback timestamps.");
}

uint64_t currentTimestampMs() {
  const time_t now = time(nullptr);
  if (now > 1700000000) {
    clockSynced = true;
    return static_cast<uint64_t>(now) * 1000ULL;
  }
  clockSynced = false;
  return static_cast<uint64_t>(millis());
}

const char *portalFiName(const char *key) {
  if (strcmp(key, "outdoor_c") == 0) return "Ulkolampotila";
  if (strcmp(key, "outdoor_tent_c") == 0) return "Teltta / suoja";
  if (strcmp(key, "outdoor_coil_c") == 0) return "Ulkoyksikon kenno";
  if (strcmp(key, "refrigerant_supply_c") == 0) return "Kylmaaine meno";
  if (strcmp(key, "refrigerant_return_c") == 0) return "Kylmaaine paluu";
  if (strcmp(key, "hot_gas_c") == 0) return "Kuumakaasu";
  return key;
}

String portalTempCell(const SensorPoint &p) {
  if (!p.valid) {
    return String("--");
  }
  return String(p.celsius, 1) + " C";
}

String portalHpDegreesOrDash(const char *sensorKey) {
  for (const auto &p : sensorPoints) {
    if (strcmp(p.key, sensorKey) == 0 && p.valid) {
      return String(p.celsius, 1);
    }
  }
  return String("--");
}

String portalSupplyReturnDeltaKOrDash() {
  float sup = NAN;
  float ret = NAN;
  for (const auto &p : sensorPoints) {
    if (strcmp(p.key, "refrigerant_supply_c") == 0 && p.valid) {
      sup = p.celsius;
    }
    if (strcmp(p.key, "refrigerant_return_c") == 0 && p.valid) {
      ret = p.celsius;
    }
  }
  if (!isnan(sup) && !isnan(ret)) {
    return String(sup - ret, 1);
  }
  return String("--");
}

void portalNetChip(String &h, const __FlashStringHelper *label,
                   const String &valueEscapedHtml, uint8_t tone) {
  h += "<div class=\"portal-net-chip";
  if (tone == 1) {
    h += " portal-net-chip--ok";
  } else if (tone == 2) {
    h += " portal-net-chip--warn";
  } else if (tone == 3) {
    h += " portal-net-chip--bad";
  }
  h +=
      "\"><span class=\"portal-net-chip__lab\">";
  h += label;
  h +=
      "</span><span "
      "class=\"portal-net-chip__val\">";
  h += valueEscapedHtml;
  h += "</span></div>";
}

String portalHtmlHead(const String &titleEscaped) {
  String h;
  h.reserve(512);
  h += F("<!DOCTYPE html><html lang=\"fi\"><head><meta charset=\"utf-8\"/>");
  h += F("<meta name=\"viewport\" "
         "content=\"width=device-width,initial-scale=1\">");
  h += F("<meta http-equiv=\"refresh\" content=\"15\">");
  h += "<title>";
  h += titleEscaped;
  h += F("</title><link rel=\"stylesheet\" href=\"/portal.css\"></head>");
  h += F("<body><main class=\"container\">");
  return h;
}

String portalBuildNetworkDiagnosticsHtml() {
  String s;
  s.reserve(3200);
  s += F("<section class=\"subpanel\">");
  s += F("<div class=\"portal-dash-head\"><h2>Kaapeli ja verkko</h2>");
  s += F("<span class=\"hint\">");
  s += htmlEscape(String(DEVICE_ID));
  s += F("</span></div><div class=\"portal-net-strip\">");

#if USE_ETHERNET
  {
    const bool linkOk = ETH.linkUp();
    portalNetChip(
        s, F("RJ45 fyysinen linkki"),
        htmlEscape(linkOk ? String(F("Kylla (PHY linkki)"))
                           : String(F("EI LINKKIA — kaapeli / kytkin / portti"))),
        linkOk ? uint8_t(1) : uint8_t(3));

    uint8_t ipTone = 0;
    String ipBody;
    if (ethernetHasIp()) {
      ipTone = 1;
      ipBody = htmlEscape(ETH.localIP().toString());
      ipBody +=
          F("<span class=\"hint\" "
            "style=\"display:block;margin-top:6px;line-height:1.4;"
            "font-size:0.84rem;color:#9fb2cc\">");
      ipBody += F("IPv4-gateway ");
      ipBody += htmlEscape(ETH.gatewayIP().toString());
      ipBody += F(" &middot; Maski ");
      ipBody += htmlEscape(ETH.subnetMask().toString());
      ipBody += F("</span>");
    } else if (linkOk) {
      ipTone = 2;
      ipBody =
          htmlEscape(String(F("Linkki OK DHCP ei osoitetta (VLAN tai reititin).")));
    } else {
      ipBody = htmlEscape(String("--"));
    }
    portalNetChip(s,
                  ethernetHasIp() ? F("Ethernet IP WAN")
                                  : F("Ethernet DHCP / IP"),
                  ipBody, ipTone);

    portalNetChip(s, F("RJ45 nopeus"),
                   linkOk
                       ? htmlEscape(
                             String(static_cast<unsigned>(
                                        ethernetLinkSpeedMbps())) +
                             String(F(" Mb/s · ")) +
                             String(
                                 ethernetFullDuplex()
                                     ? String(F("full duplex"))
                                     : String(F("half duplex"))))
                       : htmlEscape(String(F("--"))),
                   0);
  }
#else
  portalNetChip(s, F("Ethernet"),
                htmlEscape(String(F("Ei tassa firmware-rakennassa."))),
                uint8_t(0));
#endif

  {
    const bool wanOk = isNetworkConnected();
    uint8_t wanTone =
#if USE_ETHERNET
        wanOk                           ? uint8_t(1)
        : ((!ETH.linkUp()) && (WiFi.status() != WL_CONNECTED)) ? uint8_t(3)
        : ((!ethernetHasIp()) && ETH.linkUp())               ? uint8_t(2)
                                                              : uint8_t(3);
#else
        wanOk ? uint8_t(1) : uint8_t(3);
#endif

    String w = wanOk ? htmlEscape(currentIpString())
                     : htmlEscape(String(F("(ei WAN- osoitetta)")));
#if USE_ETHERNET
    w +=
        F("<span class=\"hint\" style=\"display:block;margin-top:8px;line-height:"
          "1.45;font-size:0.84rem\">");
    if (!ETH.linkUp()) {
      w += F("<strong>Ei RJ45-linkkia:</strong> ");
    }
    if (ETH.linkUp() && (!ethernetHasIp())) {
      w += F("<strong>EI DHCP osoitetta.</strong> ");
    }
    w += F("</span>");
#endif

    portalNetChip(s, F("Laite WAN (ensisijainen IP)"), w, wanTone);
  }

  {
    const bool staOn = WiFi.status() == WL_CONNECTED;
    String st =
        staOn ? htmlEscape(WiFi.SSID() + String(F(" · ")) + WiFi.localIP().toString())
              : htmlEscape(String(F("(ei kytkossa)")));
    portalNetChip(s, F("Wi-Fi STA (varalla)"), st,
                  staOn ? uint8_t(1) : uint8_t(0));
  }

  {
    uint8_t ft = 0;
    String ln;
    if (!supabaseConfigured()) {
      ln = htmlEscape(String(F("Ei konfiguroitu (SUPABASE_* puuttuu).")));
      ft = 2;
    } else if (supabaseLastIngestOk()) {
      ln = htmlEscape(supabaseLastIngestMessage());
      ft = 1;
    } else if (supabaseLastIngestMessage().length() > 0) {
      ln = htmlEscape(supabaseLastIngestMessage());
      ft = 2;
    } else {
      ln = htmlEscape(String(F("Odottaa ensimmaista ingestia.")));
      ft = 0;
    }

    portalNetChip(s, F("Supabase / pilvi"), ln, ft);
  }

  {
    String ap = htmlEscape(WiFi.softAPIP().toString());
    ap += F(" &middot; SSID ");
    ap += htmlEscape(String(WIFI_AP_SSID_PREFIX));
    portalNetChip(s, F("SoftAP (tama portaali)"), ap, 0);
  }

  s += F("</div></section>");
  return s;
}

void handlePortalCss() {
  const size_t n =
      static_cast<size_t>(portal_css_end - portal_css_start);
  portalServer.sendHeader(F("Cache-Control"), F("max-age=86400"));
  portalServer.send_P(
      200, PSTR("text/css; charset=utf-8"),
      reinterpret_cast<const char *>(portal_css_start), n);
}

void handlePortalSchematicSvg() {
  const size_t n = static_cast<size_t>(portal_schematic_svg_end -
                                       portal_schematic_svg_start);
  portalServer.sendHeader(F("Cache-Control"), F("max-age=86400"));
  portalServer.send_P(
      200, PSTR("image/svg+xml; charset=utf-8"),
      reinterpret_cast<const char *>(portal_schematic_svg_start), n);
}

void handlePortalDashboard() {
  readSensors();

  String html;
  html.reserve(20000);

  html += portalHtmlHead(htmlEscape(String(F("VRF Monitori - paikalinen AP"))));

  html += F("<section class=\"panel header header--kayntilupa\">");
  html += F("<div class=\"header-kayntilupa-inner\">");
  html += F("<h1 class=\"header-kayntilupa-title\">VRF Monitori</h1>");
  html += F("<p class=\"hint portal-meta-hint\">");
  html += F("Sama ulkoasu kuin web (tyylit /portal.css). Paivitys ~15 s.</p>");
  html += F("</div></section>");

  html += portalBuildNetworkDiagnosticsHtml();

  html += F("<div class=\"portal-local-banner\">");
  html += F("<strong>Huom.</strong> Pilvi ja trendit vaativat WANin ja Supabase. ");
  html += F("<a class=\"portal-back-link\" href=\"/wifi\">Wi-Fi varayhteys</a>");
  html += F("</div>");

  String hpBoard = String(F("hp-board"));
  html += F("<section class=\"subpanel dashboard-panel\">");
  html += "<div id=\"systemSchematic\" class=\"" + hpBoard + "\">";
  html += F("<div class=\"hp-wrap\">");
  html += F(
      "<img class=\"hp-schematic-img\" "
      "src=\"/assets/heat-pump-schematic.svg\" width=\"715\" height=\"367\" "
      "alt=\"\" decoding=\"async\"/>");

  html += F("<div class=\"portal-hotspot hp-hotspot hp-hotspot--sky\" role=\"presentation\"><span "
            "class=\"hp-hotspot__eyebrow\">ULKOILMA</span>");
  html += F("<span class=\"hp-hotspot__value\">");
  html += portalHpDegreesOrDash("outdoor_c");
  html += F("</span><span class=\"hp-hotspot__unit\">C</span></div>");

  html +=
      F("<div class=\"portal-hotspot hp-hotspot hp-hotspot--tent\" "
        "role=\"presentation\"><span class=\"hp-hotspot__eyebrow\">Meno/"
        "paluu dT</span><span class=\"hp-hotspot__value\">");
  html += portalSupplyReturnDeltaKOrDash();
  html += F("</span><span class=\"hp-hotspot__unit\">K</span></div>");

  html += F("<div class=\"portal-hotspot hp-hotspot hp-hotspot--coil\" role=\"presentation\"><span "
            "class=\"hp-hotspot__eyebrow\">Ulkoyks. kenno</span>");
  html += F("<span class=\"hp-hotspot__value\">");
  html += portalHpDegreesOrDash("outdoor_coil_c");
  html += F("</span><span class=\"hp-hotspot__unit\">C</span></div>");

  html += F("<div class=\"portal-hotspot hp-hotspot hp-hotspot--supply\" role=\"presentation\"><span "
            "class=\"hp-hotspot__eyebrow\">Kylmaine meno</span>");
  html += F("<span class=\"hp-hotspot__value\">");
  html += portalHpDegreesOrDash("refrigerant_supply_c");
  html += F("</span><span class=\"hp-hotspot__unit\">C</span></div>");

  html += F("<div class=\"portal-hotspot hp-hotspot hp-hotspot--return\" role=\"presentation\"><span "
            "class=\"hp-hotspot__eyebrow\">Kylmaine paluu</span>");
  html += F("<span class=\"hp-hotspot__value\">");
  html += portalHpDegreesOrDash("refrigerant_return_c");
  html += F("</span><span class=\"hp-hotspot__unit\">C</span></div>");

  html += F("<div class=\"portal-hotspot hp-hotspot hp-hotspot--hotgas\" role=\"presentation\"><span "
            "class=\"hp-hotspot__eyebrow\">Kuumakaasu</span>");
  html += F("<span class=\"hp-hotspot__value\">");
  html += portalHpDegreesOrDash("hot_gas_c");
  html += F("</span><span class=\"hp-hotspot__unit\">C</span></div>");

  html += F("</div>");
  html += F("</div></section>");

  html += F("<section class=\"subpanel alarms-panel\">");
  html += F("<div class=\"alarms-panel__head\"><h2>Lammitys</h2>");
  html += F("<p class=\"hint alarms-panel__hint\">DI3 voi estaa kaynnistyksen.</p></div>");
  html += F("<div class=\"alarms\"><div class=\"alarm\" data-state=\"");
  html += heatEnabled ? F("false") : F("true");
  html += F("\"><span class=\"name\">Kayntilupa</span><span class=\"value\">");
  html += heatEnabled ? F("PAALLA") : F("POIS");
  html += F("</span></div></div>");

  html += F("<div class=\"portal-actions\">");
  html += F("<form method=\"POST\" action=\"/toggle\">");
  html += F("<input type=\"hidden\" name=\"enable\" value=\"1\">");
  html += F("<button class=\"btn-primary\" type=\"submit\">Lammitys paalle</button></form>");
  html += F("<form method=\"POST\" action=\"/toggle\">");
  html += F("<input type=\"hidden\" name=\"enable\" value=\"0\">");
  html += F("<button class=\"btn-secondary\" type=\"submit\">Lammitys pois</button></form>");
  html += F("</div></section>");

  html += F("<p class=\"hint\" style=\"text-align:center;\">");
  html += htmlEscape(String(WIFI_AP_SSID_PREFIX));
  html += F(" &middot; ");
  html += htmlEscape(WiFi.softAPIP().toString());
  html += F("</p></main></body></html>");

  portalServer.send(200, "text/html", html);
}

void handlePortalWifi() {
  String html;
  html.reserve(14000);
  html += portalHtmlHead(htmlEscape(String(F("VRF Wi-Fi"))));
  html += F("<section class=\"panel portal-wifi-pane\">");
  html += F("<p><a class=\"portal-back-link\" href=\"/\">← Dashboard</a></p>");
  html += F("<h2>Wi-Fi varayhteys</h2>");
  html += F("<p class=\"hint\">Tallennus ja uudelleenkaynnistys.</p>");
  html += portalBuildNetworkDiagnosticsHtml();
#if USE_ETHERNET
  html +=
      F("<p class=\"hint\">Jarjestys: RJ45 Ethernet ensijainen WAN. Jos kaapelissa "
        "ei ole verkkoa, tallenna WLAN varayhteys; AP on kaytossa rinnakkain RJ45 WAN:n "
        "kanssa (SOFTAP_PARALLEL).</p>");
#else
  html +=
      F("<p class=\"hint\">Wi-Fi asetukset talteen tahan; WLAN on ensisijainen "
        "yhteys.</p>");
#endif
  html += F("<form method=\"POST\" action=\"/save\" class=\"subpanel\">");
  html += F("<label>Loydetty SSID</label><select name=\"ssid_select\">");
  html += scannedNetworksOptions();
  html += F("</select><label>tai SSID kasin</label>");
  html += F("<input name=\"ssid_manual\" placeholder=\"Wi-Fi nimi\">");
  html += F("<label>Salasana</label>");
  html += F("<input type=\"password\" name=\"password\" placeholder=\"Wi-Fi salasana\">");
  html += F("<button class=\"portal-wifi-submit\" type=\"submit\">");
  html += F("Tallenna ja kaynnista uudelleen</button></form>");
  html += F("</section></main></body></html>");
  portalServer.send(200, "text/html", html);
}

void handlePortalSave() {
  String ssid = portalServer.arg("ssid_manual");
  const String selected = portalServer.arg("ssid_select");
  const String password = portalServer.arg("password");
  ssid.trim();

  if (ssid.isEmpty()) {
    ssid = selected;
    ssid.trim();
  }

  if (ssid.isEmpty()) {
    portalServer.send(400, "text/plain", "SSID puuttuu.");
    return;
  }

  saveWiFiCredentials(ssid, password);
  portalSaved = true;
  portalServer.send(200, "text/plain", "Tallennettu. Laite kaynnistyy uudelleen...");
  delay(750);
  ESP.restart();
}

void handlePortalToggle() {
  if (!portalServer.hasArg("enable")) {
    portalServer.send(400, "text/plain", "Puuttuva parametri.");
    return;
  }
  heatEnabled = portalServer.arg("enable") == "1";
  permitRequestedFromCloud = heatEnabled;
  applyHeatOutput();
  portalServer.sendHeader("Location", "/", true);
  portalServer.send(302, "text/plain", "");
}

void registerPortalHttpRoutes() {
  portalServer.on("/portal.css", HTTP_GET, handlePortalCss);
  portalServer.on("/assets/heat-pump-schematic.svg", HTTP_GET,
                  handlePortalSchematicSvg);
  portalServer.on("/", HTTP_GET, handlePortalDashboard);
  portalServer.on("/wifi", HTTP_GET, handlePortalWifi);
  portalServer.on("/save", HTTP_POST, handlePortalSave);
  portalServer.on("/toggle", HTTP_POST, handlePortalToggle);
  portalServer.onNotFound([]() {
    portalServer.sendHeader("Location", "/", true);
    portalServer.send(302, "text/plain", "");
  });
}

static void credentialPortalEnsureHttpRoutes() {
  if (g_credentialPortalRoutesRegistered) {
    return;
  }
  registerPortalHttpRoutes();
  g_credentialPortalRoutesRegistered = true;
}

static void credentialPortalEnsureServerBegun() {
  credentialPortalEnsureHttpRoutes();
  if (!g_credentialPortalServerBegun) {
    portalServer.begin();
    g_credentialPortalServerBegun = true;
  }
}

#if USE_ETHERNET && ETHERNET_ONLY_WAN
static void startEthernetFailsafeSoftApNonBlocking() {
  Serial.println(
      "[NET] RJ45 WAN ei valmis → Wi-Fi SoftAP (VRF-SETUP), ei STA-pilveen.");
  enableSoftApOnlyPreservingEthernet();
  const String apPassword = WIFI_AP_PASSWORD;
  const bool apOk =
      apPassword.length() >= 8 ? WiFi.softAP(WIFI_AP_SSID_PREFIX, apPassword.c_str())
                               : WiFi.softAP(WIFI_AP_SSID_PREFIX);
  if (!apOk) {
    Serial.println("[NET] Ether-failsafe SoftAP: softAP() epaonnistui.");
    return;
  }
  credentialPortalEnsureServerBegun();
  gEthernetFailsafeSoftApPump = true;
  Serial.print("[NET] Paikallinen AP: ");
  Serial.print(WIFI_AP_SSID_PREFIX);
  Serial.print(F(" URL http://"));
  Serial.println(WiFi.softAPIP());
  ensureEthernetDefaultWanNetif();
}
#endif

#if USE_ETHERNET && (SOFTAP_PARALLEL_ETHERNET || ETHERNET_ONLY_WAN)
void startParallelCredentialSoftApIfWanEthernet() {
  if (!g_wanEthernetActive) {
    return;
  }
  Serial.println(
      "[NET] RJ45 WAN ok → Wi-Fi SoftAP (VRF-SETUP), Ethernet pidetään päällä.");
  enableSoftApOnlyPreservingEthernet();
  const String apPassword = WIFI_AP_PASSWORD;
  const bool apOk =
      apPassword.length() >= 8
          ? WiFi.softAP(WIFI_AP_SSID_PREFIX, apPassword.c_str())
          : WiFi.softAP(WIFI_AP_SSID_PREFIX);
  if (!apOk) {
    Serial.println("[NET] Parallel SoftAP: softAP() epaonnistui.");
    return;
  }
  credentialPortalEnsureServerBegun();
  g_parallelEthernetCredentialPortal = true;
  Serial.print("[NET] Maaritys-AP: ");
  Serial.print(WIFI_AP_SSID_PREFIX);
  Serial.print(F(" IP "));
  Serial.println(WiFi.softAPIP());
  ensureEthernetDefaultWanNetif();
}
#endif

void credentialPortalPumpInLoopIfNeeded() {
#if USE_ETHERNET && (SOFTAP_PARALLEL_ETHERNET || ETHERNET_ONLY_WAN)
  if (g_parallelEthernetCredentialPortal && g_wanEthernetActive) {
    portalServer.handleClient();
  }
#endif
  if (gEthernetFailsafeSoftApPump) {
    portalServer.handleClient();
  }
}

void startWiFiSetupPortal() {
  g_parallelEthernetCredentialPortal = false;
  Serial.println(
      "[NET] Verkkopolku: ei Ethernetia eika Wi-Fi STA:ta -> lukittu AP "
      "(tallenna Wi-Fi tai kaapeli).");
  WiFi.disconnect(true, true);
  delay(200);
  WiFi.mode(WIFI_AP);
  const String apPassword = WIFI_AP_PASSWORD;
  if (apPassword.length() >= 8) {
    WiFi.softAP(WIFI_AP_SSID_PREFIX, apPassword.c_str());
  } else {
    WiFi.softAP(WIFI_AP_SSID_PREFIX);
  }

  Serial.println("Wi-Fi AP setup mode enabled.");
  Serial.print("Connect to AP and open: http://");
  Serial.println(WiFi.softAPIP());

  credentialPortalEnsureServerBegun();

  while (!portalSaved) {
    portalServer.handleClient();
    delay(5);
  }

  portalServer.stop();
  delay(800);
  ESP.restart();
}

void setupNetwork() {
  g_wanEthernetActive = false;
  g_parallelEthernetCredentialPortal = false;
  gEthernetFailsafeSoftApPump = false;
#if USE_ETHERNET
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
  delay(120);

#if ETHERNET_ONLY_WAN
  clearWiFiCredentials();
  Serial.println(
      "[NET] WAN vain RJ45 (DNA 192.168.64.x). Wi-Fi = aina SoftAP, ei STA.");
#else
  Serial.println(
      "[NET] Jarjestys: Ethernet (RJ45) ensisijainen → tarvittaessa Wi-Fi STA NVS/oletus → "
      "lukittu AP.");
#endif
  Serial.println(
      "Ethernet W5500: alustus (SPI), odotetaan linkkia ja DHCP:aa...");
  const bool ethInit = w5500EthernetBegin();
  if (ethInit) {
    bool wanOk = waitForEthernetReady(ETH_CONNECT_TIMEOUT_MS);
#if ETH_STATIC_FALLBACK_AFTER_DHCP
    if (!wanOk && ETH.linkUp()) {
      Serial.println(
          "[NET] DHCP ei antanut IP:ta — kokeillaan yleisia staattisia "
          "GSM-osoitteita (modeemiin ei tarvita paasy).");
      wanOk = tryEthStaticFallbackAfterDhcp();
    }
#endif
    if (wanOk) {
      g_wanEthernetActive = true;
      Serial.print("Ethernet OK, IP: ");
      Serial.println(ETH.localIP());
      applyEthernetWanDns();
      probeWanDnsOnce("www.googleapis.com");
      return;
    }
    Serial.println(
        "Ethernet ei tullut kuntoon (linkki/DHCP) — RJ45 WAN epaonnistui."
#if !ETHERNET_ONLY_WAN
        " Siirtyminen Wi-Fi STA -fallbackiin."
#endif
    );
    Serial.printf(
        "[NET] RJ45 WAN diagnostiikka: ETH.linkUp()=%s, IP=%s (timeout %lu ms).\n",
        ETH.linkUp() ? "KYLLA" : "EI",
        ETH.localIP().toString().c_str(),
        (unsigned long)ETH_CONNECT_TIMEOUT_MS);
#if ETH_WIFI_WAN_IF_RJ45_NO_IP
    if (tryWifiWanFallbackNoModemAccess()) {
      g_wanEthernetActive = false;
      Serial.print("[NET] Wi-Fi WAN fallback OK, IP: ");
      Serial.println(WiFi.localIP());
      return;
    }
#endif
  } else {
    Serial.println(
        "Ethernet (W5500) alustus epaonnistui — RJ45 WAN ei kaytossa.");
  }
#if ETHERNET_ONLY_WAN
  startEthernetFailsafeSoftApNonBlocking();
  return;
#endif
#endif

#if !(USE_ETHERNET && ETHERNET_ONLY_WAN)
  Serial.println(
      "[NET] WAN ei Ethernetilla → yritetaan Wi-Fi STAta (build-asetukset / NVS); "
      "viime vaihe lukittu AP.");
  WiFi.persistent(false);
  WiFi.disconnect(true);

  const String buildSsid = WIFI_SSID;
  const String buildPassword = WIFI_PASSWORD;
  if (!buildSsid.isEmpty() && buildSsid != "YOUR_WIFI_SSID") {
    saveWiFiCredentials(buildSsid, buildPassword);
    Serial.printf("[NET] Wi-Fi build-asetukset: SSID=%s\n", buildSsid.c_str());
    if (connectToWiFi(buildSsid, buildPassword, WIFI_CONNECT_TIMEOUT_MS)) {
      return;
    }
  } else {
    String storedSsid;
    String storedPassword;
    if (loadWiFiCredentials(&storedSsid, &storedPassword)) {
      if (connectToWiFi(storedSsid, storedPassword, WIFI_CONNECT_TIMEOUT_MS)) {
        return;
      }
    }
  }

  startWiFiSetupPortal();
#endif
}

void readSensors() {
  int detected = ds18b20.getDeviceCount();
  for (int attempt = 0; attempt < ONE_WIRE_SEARCH_RETRIES && detected == 0; ++attempt) {
    ds18b20.begin();
    delay(40);
    detected = ds18b20.getDeviceCount();
  }

  ds18b20.requestTemperatures();

  static bool loggedOneWireBusOnce = false;
  if (!loggedOneWireBusOnce) {
    loggedOneWireBusOnce = true;
    Serial.printf("\n[1-Wire] GPIO%u: getDeviceCount()=%d.\n",
                  static_cast<unsigned>(ONE_WIRE_BUS_PIN), detected);
    DeviceAddress adr;
    for (int ix = 0; ix < detected; ++ix) {
      if (!ds18b20.getAddress(adr, static_cast<uint8_t>(ix))) {
        Serial.printf("  #%d: ROM luku epäonnistui.\n", ix);
        continue;
      }
      const float tx = ds18b20.getTempC(adr);
      Serial.printf(
          "  #%d ROM %02X%02X%02X%02X%02X%02X%02X%02X  %.2f C\n",
          ix,
          static_cast<unsigned>(adr[0]),
          static_cast<unsigned>(adr[1]),
          static_cast<unsigned>(adr[2]),
          static_cast<unsigned>(adr[3]),
          static_cast<unsigned>(adr[4]),
          static_cast<unsigned>(adr[5]),
          static_cast<unsigned>(adr[6]),
          static_cast<unsigned>(adr[7]),
          tx);
    }
    Serial.println(
        "sensorPoints[][i]-avaimet (kun index fallback käytössä i==bussilla): "
        "0=outdoor_c 1=outdoor_coil_c 2=refrigerant_supply_c 3=refrigerant_return_c "
        "4=hot_gas_c 5=outdoor_tent_c (teltan voi peilata CONFIG:ista ulkoa jos puuttuu)");
    Serial.println(
        "Päivitä config.h 8-byte ROM:t tai WAVESHARE_SCANNER -ympäristö; \"puuttuva\" "
        "näyttö usein tarkoittaa vähemmän kuin 6 anturia tai väärää indeksipariä.\n");
  }

  for (size_t i = 0; i < (sizeof(sensorPoints) / sizeof(sensorPoints[0])); ++i) {
    auto &point = sensorPoints[i];
    DeviceAddress addr;
    memcpy(addr, point.address, sizeof(DeviceAddress));
    const float temp = ds18b20.getTempC(addr);

    if (temp == DEVICE_DISCONNECTED_C) {
#if ALLOW_SENSOR_INDEX_FALLBACK
      const float fallbackTemp = ds18b20.getTempCByIndex(static_cast<uint8_t>(i));
      if (fallbackTemp != DEVICE_DISCONNECTED_C) {
        point.valid = true;
        point.celsius = fallbackTemp;
        Serial.printf("%s = %.2f C (index fallback)\n", point.key, point.celsius);
        continue;
      }
#endif
      point.valid = false;
      point.celsius = NAN;
      Serial.printf("Sensor %s disconnected.\n", point.key);
    } else {
      point.valid = true;
      point.celsius = temp;
      Serial.printf("%s = %.2f C\n", point.key, point.celsius);
    }
  }

  {
    memset(g_onewireDiagSnapshot, 0, sizeof g_onewireDiagSnapshot);
    const int nBus = ds18b20.getDeviceCount();
    const size_t slots = sizeof(sensorPoints) / sizeof(sensorPoints[0]);
    size_t wp = snprintf(
        g_onewireDiagSnapshot,
        sizeof g_onewireDiagSnapshot,
        "devices=%d|slots=%u|gpio%u|",
        nBus,
        static_cast<unsigned>(slots),
        static_cast<unsigned>(ONE_WIRE_BUS_PIN));
    DeviceAddress adr;
    for (int ix = 0; ix < nBus && ix < 8 && wp + 70 < sizeof g_onewireDiagSnapshot; ++ix) {
      if (!ds18b20.getAddress(adr, static_cast<uint8_t>(ix))) {
        wp += snprintf(
            g_onewireDiagSnapshot + wp,
            sizeof g_onewireDiagSnapshot - wp,
            "#%d:norom ",
            ix);
        continue;
      }
      const float tx = ds18b20.getTempC(adr);
      wp += snprintf(
          g_onewireDiagSnapshot + wp,
          sizeof g_onewireDiagSnapshot - wp,
          "#%d:%02X%02X%02X%02X%02X%02X%02X%02X=%.1f ",
          ix,
          static_cast<unsigned>(adr[0]),
          static_cast<unsigned>(adr[1]),
          static_cast<unsigned>(adr[2]),
          static_cast<unsigned>(adr[3]),
          static_cast<unsigned>(adr[4]),
          static_cast<unsigned>(adr[5]),
          static_cast<unsigned>(adr[6]),
          static_cast<unsigned>(adr[7]),
          static_cast<double>(tx));
    }
    if (static_cast<int>(slots) > nBus) {
      wp += snprintf(
          g_onewireDiagSnapshot + wp,
          sizeof g_onewireDiagSnapshot - wp,
          "|WARN_slots_gt_devices");
    }
  }

#if SENSOR_MIRROR_TENT_FROM_OUTDOOR_IF_MISSING
  SensorPoint *tentSp = nullptr;
  SensorPoint *outSp = nullptr;
  for (auto &p : sensorPoints) {
    if (strcmp(p.key, "outdoor_tent_c") == 0) {
      tentSp = &p;
    } else if (strcmp(p.key, "outdoor_c") == 0) {
      outSp = &p;
    }
  }
  if (tentSp != nullptr && outSp != nullptr && outSp->valid && !tentSp->valid) {
    tentSp->valid = true;
    tentSp->celsius = outSp->celsius;
    Serial.println(
        "[Sensors] outdoor_tent_c <-- outdoor_c (kun erillinen teltta-anturi puuttuu)");
  }
#endif
}

int currentLocalYmd() {
  struct tm ti;
  const time_t t = time(nullptr);
  if (t < 1700000000) {
    return 0;
  }
  localtime_r(&t, &ti);
  return (ti.tm_year + 1900) * 10000 + (ti.tm_mon + 1) * 100 + ti.tm_mday;
}

void pushDefrostHistSamples(float coilC, float supplyC) {
  for (int i = 0; i < 2; ++i) {
    g_defrostHistCoil[i] = g_defrostHistCoil[i + 1];
    g_defrostHistSupply[i] = g_defrostHistSupply[i + 1];
  }
  g_defrostHistCoil[2] = coilC;
  g_defrostHistSupply[2] = supplyC;
}

bool defrostHistReady(const float *triple) {
  return !isnan(triple[0]) && !isnan(triple[1]) && !isnan(triple[2]);
}

void loadDefrostPrefs() {
  defrostPreferences.begin("defrost", true);
  g_defrostDayYmd = defrostPreferences.getInt("day_ymd", 0);
  g_defrostTodayCount = defrostPreferences.getUInt("cnt_today", 0);
  g_defrostYesterdayCount = defrostPreferences.getUInt("cnt_yest", 0);
  g_defrostAvgDurationMin = defrostPreferences.getFloat("avg_min", 0.f);
  g_defrostAvgSampleCount = defrostPreferences.getUInt("avg_n", 0);
  if (defrostPreferences.isKey("last_coil")) {
    g_lastDefrostCoilEndC = defrostPreferences.getFloat("last_coil", NAN);
  } else {
    g_lastDefrostCoilEndC = NAN;
  }
  if (defrostPreferences.isKey("last_dur_m")) {
    g_lastDefrostDurationMin = defrostPreferences.getFloat("last_dur_m", NAN);
  } else {
    g_lastDefrostDurationMin = NAN;
  }
  g_lastDefrostEndedMs =
      (static_cast<uint64_t>(defrostPreferences.getUInt("end_hi", 0)) << 32) |
      static_cast<uint64_t>(defrostPreferences.getUInt("end_lo", 0));
  defrostPreferences.end();
}

void saveDefrostPrefs() {
  defrostPreferences.begin("defrost", false);
  defrostPreferences.putInt("day_ymd", g_defrostDayYmd);
  defrostPreferences.putUInt("cnt_today", g_defrostTodayCount);
  defrostPreferences.putUInt("cnt_yest", g_defrostYesterdayCount);
  defrostPreferences.putFloat("avg_min", g_defrostAvgDurationMin);
  defrostPreferences.putUInt("avg_n", g_defrostAvgSampleCount);
  defrostPreferences.putUInt("end_lo",
                              static_cast<uint32_t>(
                                  g_lastDefrostEndedMs & 0xFFFFFFFFULL));
  defrostPreferences.putUInt(
      "end_hi",
      static_cast<uint32_t>(g_lastDefrostEndedMs >> 32));
  if (!isnan(g_lastDefrostCoilEndC)) {
    defrostPreferences.putFloat("last_coil", g_lastDefrostCoilEndC);
  } else {
    defrostPreferences.remove("last_coil");
  }
  if (!isnan(g_lastDefrostDurationMin)) {
    defrostPreferences.putFloat("last_dur_m", g_lastDefrostDurationMin);
  } else {
    defrostPreferences.remove("last_dur_m");
  }
  defrostPreferences.end();
}

void rollDefrostDayCountersIfNeeded() {
  const int ymd = currentLocalYmd();
  if (ymd == 0) {
    return;
  }
  if (g_defrostDayYmd == 0) {
    g_defrostDayYmd = ymd;
    saveDefrostPrefs();
    return;
  }
  if (ymd == g_defrostDayYmd) {
    return;
  }
  g_defrostYesterdayCount = g_defrostTodayCount;
  g_defrostTodayCount = 0;
  g_defrostDayYmd = ymd;
  saveDefrostPrefs();
}

void recordDefrostCompleted(unsigned long startedMs,
                            unsigned long endedMs,
                            float coilEndC) {
  const uint32_t durationS =
      static_cast<uint32_t>((endedMs - startedMs) / 1000UL);
  if (durationS < DEFROST_MIN_DURATION_S) {
    return;
  }
  rollDefrostDayCountersIfNeeded();
  g_defrostTodayCount += 1;
  const float durMin = static_cast<float>(durationS) / 60.0f;
  if (g_defrostAvgSampleCount == 0) {
    g_defrostAvgDurationMin = durMin;
    g_defrostAvgSampleCount = 1;
  } else {
    const float n = static_cast<float>(g_defrostAvgSampleCount);
    g_defrostAvgDurationMin = (g_defrostAvgDurationMin * n + durMin) /
                              (n + 1.0f);
    g_defrostAvgSampleCount += 1;
  }
  g_lastDefrostCoilEndC = coilEndC;
  g_lastDefrostDurationMin = durMin;
  g_lastDefrostEndedMs = currentTimestampMs();
  saveDefrostPrefs();
  Serial.printf(
      "Defrost heuristic ended: dur=%lus coil_end=%.2f C (today=%lu)\n",
      static_cast<unsigned long>(durationS),
      coilEndC,
      static_cast<unsigned long>(g_defrostTodayCount));
}

void trackHeatDemandEdgeForDefrost(const bool heatDemand,
                                   const unsigned long millisNow) {
  if (heatDemand && !g_prevHeatDemandForDefrost) {
    g_heatDemandOnMs = millisNow;
  } else if (!heatDemand) {
    g_heatDemandOnMs = 0;
  }
  g_prevHeatDemandForDefrost = heatDemand;
}

bool defrostStartupSuppressActive(const unsigned long millisNow) {
  if (g_heatDemandOnMs == 0) {
    return false;
  }
  return millisNow - g_heatDemandOnMs < DEFROST_SUPPRESS_AFTER_HEAT_ON_MS;
}

void updateDefrostState(float coilC,
                        float supplyC,
                        bool heatDemand,
                        unsigned long millisNow) {
  trackHeatDemandEdgeForDefrost(heatDemand, millisNow);
  if (isnan(coilC) || isnan(supplyC)) {
    return;
  }
  pushDefrostHistSamples(coilC, supplyC);
  rollDefrostDayCountersIfNeeded();

  if (g_defrostActive) {
    const unsigned long elapsed = millisNow - g_defrostStartMs;
    bool endSignal = false;
    if (!heatDemand) {
      ++g_defrostOffSamples;
      if (g_defrostOffSamples >= DEFROST_HEAT_DEMAND_OFF_END_SAMPLES) {
        endSignal = true;
      }
    } else {
      g_defrostOffSamples = 0;
      if (elapsed >= static_cast<unsigned long>(DEFROST_MIN_DURATION_S) *
                         1000UL &&
          defrostHistReady(g_defrostHistSupply)) {
        const float dSupply =
            g_defrostHistSupply[2] - g_defrostHistSupply[0];
        const float dCoil = g_defrostHistCoil[2] - g_defrostHistCoil[0];
        if (dSupply >= DEFROST_END_SUPPLY_RECOVER_C ||
            dCoil <= -DEFROST_END_COIL_FALL_C) {
          endSignal = true;
        }
      }
    }
    if (elapsed >= DEFROST_MAX_DURATION_MS) {
      endSignal = true;
    }
    if (endSignal && elapsed >= static_cast<unsigned long>(DEFROST_MIN_DURATION_S) * 1000UL) {
      recordDefrostCompleted(g_defrostStartMs, millisNow, coilC);
      g_defrostActive = false;
      g_defrostCooldownUntilMs = millisNow + DEFROST_COOLDOWN_MS;
      g_defrostOffSamples = 0;
    }
    return;
  }

  if (millisNow < g_defrostCooldownUntilMs) {
    return;
  }
  if (!heatDemand) {
    return;
  }
  if (defrostStartupSuppressActive(millisNow)) {
    return;
  }
  if (!defrostHistReady(g_defrostHistCoil) ||
      !defrostHistReady(g_defrostHistSupply)) {
    return;
  }
  float outdoorC = NAN;
  (void)getSensorValue("outdoor_c", &outdoorC);
  if (!isnan(outdoorC) &&
      g_defrostHistCoil[0] >
          outdoorC - DEFROST_COIL_COLDER_THAN_OUTDOOR_C) {
    return;
  }
  const float dCoil = g_defrostHistCoil[2] - g_defrostHistCoil[0];
  const float dSupply = g_defrostHistSupply[2] - g_defrostHistSupply[0];
  if (dCoil >= DEFROST_COIL_RISE_START_C &&
      dSupply <= -DEFROST_SUPPLY_FALL_START_C) {
    g_defrostActive = true;
    g_defrostStartMs = millisNow;
    g_defrostOffSamples = 0;
    Serial.println(
        "Defrost/oil heuristic: active (coil warms + supply drops).");
  }
}

/** Kenno vs ulkoilma — kompressorin arvio (ei hälytystä). */
static bool g_compressorLikelyRunning = false;

/** Kompressori/sulatus: heuristiikka (ei hälytyksiä). DI3 = ainoa hälytyslähde. */
static void updateCompressorLikelyFromCoilVsOutdoor(float coilC, float outdoorC,
                                                    bool defrostActive) {
  static int onStreak = 0;
  static int offStreak = 0;
  if (defrostActive) {
    return;
  }
  if (isnan(coilC) || isnan(outdoorC)) {
    return;
  }
  const float gap = outdoorC - coilC;
  if (gap >= COMPRESSOR_COIL_COLDER_THAN_OUTDOOR_K) {
    onStreak++;
    offStreak = 0;
    if (onStreak >= 3) {
      g_compressorLikelyRunning = true;
    }
  } else if (gap <= 0.5f) {
    offStreak++;
    onStreak = 0;
    if (offStreak >= 6) {
      g_compressorLikelyRunning = false;
    }
  } else {
    if (onStreak > 0) {
      onStreak--;
    }
    if (offStreak > 0) {
      offStreak--;
    }
  }
}

/** Viimeksi lähetetty tila (muutoksen tunnistus). */
struct TelemetrySentState {
  bool valid = false;
  unsigned long atMs = 0;
  uint32_t flags = 0;
  const char *opState = nullptr;
  float temps[8];
  bool tempValid[8];
};
static TelemetrySentState g_sent;

static float tempThreshold(const char *key) {
  return strcmp(key, "hot_gas_c") == 0 ? TELEMETRY_HOT_GAS_DELTA_C : TELEMETRY_TEMP_DELTA_C;
}

/**
 * 1.1.17: lähetetään kun tila muuttuu (heti), lämpötila muuttuu rajan yli (enintään
 * TELEMETRY_MIN_INTERVAL_MS välein) tai sydänlyönti (TELEMETRY_HEARTBEAT_MS). Ennen: joka 2 s.
 */
bool telemetryShouldSend(const char *opState, bool anyAlarm, bool sensorDisconnected, bool hotGasHigh,
                         bool retLow, bool deltaHigh, bool deltaLow) {
  const unsigned long now = millis();
  uint32_t flags = 0;
  int bit = 0;
  auto put = [&](bool v) {
    if (v) flags |= (1UL << bit);
    ++bit;
  };
  put(heatEnabled);
  put(permitRequestedFromCloud);
  put(alarmShutdownActive);
  put(di3AlarmShutdownEnabled);
  put(g_di2Compressor.debounced);
  put(g_di3DebouncedAlarm);
  put(g_di4UnitReady.debounced);
  put(statusDiBusEnergized());
  put(g_defrostActive);
  put(anyAlarm);
  put(sensorDisconnected);
  put(hotGasHigh);
  put(retLow);
  put(deltaHigh);
  put(deltaLow);
  put(outdoorSafetyLockActive);
  put(relayChannelPhysicallyEnergized(HEAT_ENABLE_RELAY_CHANNEL, HEAT_ENABLE_ACTIVE_HIGH));
  put(relayChannelPhysicallyEnergized(alarmOutputChannel, ALARM_RELAY_ACTIVE_HIGH));
  put(alarmOutputEnabled);
  put(alarmOutputNc);
  put(relayWriteOk);
  put(clockSynced);
  put(g_compressorLikelyRunning);

  bool stateChanged = !g_sent.valid || flags != g_sent.flags || opState != g_sent.opState;
  bool tempChanged = false;
  const size_t n = sizeof(sensorPoints) / sizeof(sensorPoints[0]);
  for (size_t i = 0; i < n && i < 8; ++i) {
    const SensorPoint &p = sensorPoints[i];
    if (!g_sent.valid || p.valid != g_sent.tempValid[i]) {
      stateChanged = stateChanged || g_sent.valid;  // anturi katosi/palasi = tilamuutos
      tempChanged = true;
    } else if (p.valid && fabsf(p.celsius - g_sent.temps[i]) >= tempThreshold(p.key)) {
      tempChanged = true;
    }
  }

  const unsigned long since = now - g_sent.atMs;
  const bool send = g_forceTelemetry || stateChanged || since >= TELEMETRY_HEARTBEAT_MS ||
                    (tempChanged && since >= TELEMETRY_MIN_INTERVAL_MS);
  if (!send) {
    return false;
  }
  g_forceTelemetry = false;
  g_sent.valid = true;
  g_sent.atMs = now;
  g_sent.flags = flags;
  g_sent.opState = opState;
  for (size_t i = 0; i < n && i < 8; ++i) {
    g_sent.tempValid[i] = sensorPoints[i].valid;
    g_sent.temps[i] = sensorPoints[i].celsius;
  }
  return true;
}

bool publishTelemetry() {
  bool sensorDisconnected = false;
  int validSensorCount = 0;
  for (const auto &point : sensorPoints) {
    if (!point.valid) {
      sensorDisconnected = true;
    } else {
      ++validSensorCount;
    }
  }

  bool hotGasHigh = false;
  float hotGas = NAN;
  bool refrigerantReturnLow = false;
  bool refrigerantDeltaHigh = false;
  bool refrigerantDeltaLow = false;
  float refrigerantSupply = NAN;
  float outdoorC = NAN;
  float outdoorCoilC = NAN;

  const bool externalAlarm = readAlarmInput();
  const int externalAlarmRaw = readAlarmInputRaw();

  (void)getSensorValue("hot_gas_c", &hotGas);
  (void)getSensorValue("refrigerant_supply_c", &refrigerantSupply);
  (void)getSensorValue("outdoor_c", &outdoorC);
  (void)getSensorValue("outdoor_coil_c", &outdoorCoilC);

  const bool heatDemandForDefrost =
      heatEnabled && (!alarmShutdownActive || !di3AlarmShutdownEnabled);
  updateDefrostState(outdoorCoilC, refrigerantSupply, heatDemandForDefrost, millis());
  updateCompressorLikelyFromCoilVsOutdoor(outdoorCoilC, outdoorC, g_defrostActive);

  const bool deviationAlarm = false;
  const bool notifyAlarm = externalAlarm;
  const bool anyAlarm = externalAlarm;
  const uint64_t timestampMs = currentTimestampMs();

  uint32_t alarmShutdownRemainingS = 0;
  bool alarmShutdownWaitingDiClear = false;
  if (alarmShutdownActive) {
    const unsigned long elapsed = millis() - alarmShutdownStartMs;
    if (elapsed < DI3_ALARM_SHUTDOWN_DURATION_MS) {
      alarmShutdownRemainingS =
          static_cast<uint32_t>((DI3_ALARM_SHUTDOWN_DURATION_MS - elapsed) / 1000UL);
    } else {
      alarmShutdownWaitingDiClear = readAlarmInput();
    }
  }

  const char *operatingState = "off";
  const char *operatingText = "Pois paalta";
  if (!heatEnabled) {
    operatingState = "off";
    operatingText = "Pois paalta";
  } else if (g_defrostActive) {
    operatingState = "defrost";
    operatingText = "Öljypalautus / sulatus (arvio)";
  } else if (heatDemandForDefrost) {
    if (g_di2Compressor.debounced) {
      operatingState = "permit_on";
      operatingText = "Lampottaa";
    } else {
      operatingState = "idle";
      operatingText = "Valmiustilassa — odottaa lampotystarvetta";
    }
  } else {
    operatingState = "idle";
    operatingText = "Lepotilassa";
  }

  if (!telemetryShouldSend(operatingState, anyAlarm, sensorDisconnected, hotGasHigh,
                           refrigerantReturnLow, refrigerantDeltaHigh, refrigerantDeltaLow)) {
    // Ei muutosta eikä sydänlyöntiä: ei lähetetä, mutta jono puretaan jos verkko palasi.
    supabaseFlushBacklog();
    return false;
  }

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["mode"] = "heating_only";
  doc["system_type"] = "vrf";
  doc["outdoor_units"] = 1;
  doc["indoor_units"] = 6;
  doc["millis"] = static_cast<int>(millis());
  doc["timestamp_ms"] = static_cast<double>(timestampMs);
  doc["time_synced"] = clockSynced;
  doc["control"]["enabled"] =
      heatEnabled && (!alarmShutdownActive || !di3AlarmShutdownEnabled);
  doc["control"]["permit_requested_enabled"] = permitRequestedFromCloud;
  doc["control"]["relay_channel"] = HEAT_ENABLE_RELAY_CHANNEL;
  doc["control"]["alarm_relay_channel"] = alarmOutputChannel;
  {
    JsonObject ao = doc["control"]["alarm_output"].to<JsonObject>();
    ao["enabled"] = alarmOutputEnabled;
    ao["mode"] = alarmOutputNc ? "NC" : "NO";
    ao["channel"] = alarmOutputChannel;
    ao["energized"] = relayChannelPhysicallyEnergized(alarmOutputChannel, ALARM_RELAY_ACTIVE_HIGH);
    ao["alarm_active"] = g_di3DebouncedAlarm;
    ao["write_ok"] = relayWriteOk;
  }
  doc["control"]["relay_write_ok"] = relayWriteOk;
  doc["diagnostics"]["onewire_device_count"] = static_cast<int>(ds18b20.getDeviceCount());
  doc["diagnostics"]["firmware_version"] = FIRMWARE_VERSION_STRING;
#if USE_OTA
  doc["diagnostics"]["ota_last_attempt_nonce"] = static_cast<double>(otaLastAttemptNonce());
  if (otaLastErrorText().length() > 0) {
    doc["diagnostics"]["ota_last_error"] = otaLastErrorText();
  }
#endif
  doc["diagnostics"]["valid_sensor_count"] = validSensorCount;
  doc["diagnostics"]["onewire_gpio"] = ONE_WIRE_BUS_PIN;
  doc["diagnostics"]["onewire_scan_text"] =
      g_onewireDiagSnapshot[0] != '\0'
          ? static_cast<const char *>(g_onewireDiagSnapshot)
          : "waiting_for_sensor_poll";
  doc["diagnostics"]["di4_gpio"] = DI4_UNIT_READY_PIN;
  doc["diagnostics"]["di2_gpio"] = DI2_COMPRESSOR_PIN;
  doc["diagnostics"]["di_alarm_gpio"] = ALARM_INPUT_PIN;
  doc["diagnostics"]["di2_gpio_raw"] = readStatusDiGpioRaw(DI2_COMPRESSOR_PIN);
  doc["diagnostics"]["di3_gpio_raw"] = readStatusDiGpioRaw(ALARM_INPUT_PIN);
  doc["diagnostics"]["di4_gpio_raw"] = readStatusDiGpioRaw(DI4_UNIT_READY_PIN);
  doc["diagnostics"]["di_bus_energized"] = statusDiBusEnergized();
  doc["diagnostics"]["heat_relay_energized"] = relayChannelPhysicallyEnergized(
      HEAT_ENABLE_RELAY_CHANNEL, HEAT_ENABLE_ACTIVE_HIGH);
  doc["diagnostics"]["alarm_relay_energized"] = relayChannelPhysicallyEnergized(
      alarmOutputChannel, ALARM_RELAY_ACTIVE_HIGH);
  doc["diagnostics"]["di_alarm_raw"] = externalAlarmRaw;
  doc["diagnostics"]["di_alarm_filtered"] = g_di3FilteredSample ? 1 : 0;
  doc["diagnostics"]["di_alarm_debounced"] = g_di3DebouncedAlarm ? 1 : 0;
  doc["diagnostics"]["di_alarm_trigger_raw_level"] = alarmInputTriggerRawLevel;
  doc["digital_inputs"]["di4_unit_ready"] = g_di4UnitReady.debounced;
  doc["digital_inputs"]["di2_compressor_running"] = g_di2Compressor.debounced;
  doc["digital_inputs"]["di3_alarm"] = g_di3DebouncedAlarm;
  doc["digital_inputs"]["di_bus_energized"] = statusDiBusEnergized();
  doc["digital_inputs"]["di4_raw"] = readStatusDiExternalRaw(DI4_UNIT_READY_PIN);
  doc["digital_inputs"]["di2_raw"] = readStatusDiExternalRaw(DI2_COMPRESSOR_PIN);
  doc["digital_inputs"]["di3_raw"] = externalAlarmRaw;
  doc["settings"]["auto_stop_enabled"] = autoStopEnabled;
  doc["settings"]["alarm_output_enabled"] = alarmOutputEnabled;
  doc["settings"]["alarm_output_mode"] = alarmOutputNc ? "NC" : "NO";
  doc["settings"]["alarm_output_channel"] = alarmOutputChannel;
  doc["diagnostics"]["telemetry_heartbeat_s"] = static_cast<int>(TELEMETRY_HEARTBEAT_MS / 1000UL);
  doc["settings"]["auto_stop_below_outdoor_c"] = autoStopBelowOutdoorC;
  doc["settings"]["auto_stop_outdoor_hysteresis_c"] = outdoorAutoStopHysteresisC;
  doc["settings"]["auto_stop_outdoor_smooth_tau_min"] =
      static_cast<int>(outdoorAutoStopSmoothTauMin);
  doc["settings"]["compressor_alarm_enable_after_s"] =
      static_cast<int>(compressorAlarmEnableAfterS);
  doc["settings"]["alarm_input_trigger_raw_level"] = di3TriggerRawLevel;
  doc["settings"]["di2_trigger_raw_level"] = di2TriggerRawLevel;
  doc["settings"]["di3_trigger_raw_level"] = di3TriggerRawLevel;
  doc["settings"]["di4_trigger_raw_level"] = di4TriggerRawLevel;
  doc["settings"]["di3_alarm_shutdown_enabled"] = di3AlarmShutdownEnabled;
  doc["settings"]["alarm_limits"]["hot_gas_high_c"] = hotGasHighAlarmC;
  doc["settings"]["alarm_limits"]["refrigerant_return_low_c"] = refrigerantReturnLowAlarmC;
  doc["settings"]["alarm_limits"]["refrigerant_delta_high_c"] = refrigerantDeltaHighAlarmC;
  doc["settings"]["alarm_limits"]["refrigerant_delta_low_c"] = refrigerantDeltaLowAlarmC;
  doc["status"]["temp_alarm_gate_active"] = false;
  doc["status"]["heat_alarm_hold_ms"] = 0;
  doc["status"]["outdoor_safety_lock_active"] = outdoorSafetyLockActive;
  if (!isnan(outdoorAutoStopSignalC)) {
    doc["status"]["outdoor_auto_stop_signal_c"] =
        static_cast<double>(outdoorAutoStopSignalC);
  } else {
    doc["status"]["outdoor_auto_stop_signal_c"] = "nan";
  }
  doc["status"]["alarm_shutdown_active"] = alarmShutdownActive;
  doc["status"]["alarm_shutdown_remaining_s"] = static_cast<int>(alarmShutdownRemainingS);
  doc["status"]["alarm_shutdown_waiting_di_clear"] = alarmShutdownWaitingDiClear;
  doc["status"]["di3_alarm_shutdown_duration_s"] =
      static_cast<int>(DI3_ALARM_SHUTDOWN_DURATION_MS / 1000UL);
  doc["status"]["operating_state"] = operatingState;
  doc["status"]["operating_text"] = operatingText;
  if (g_heatDemandOnMs != 0) {
    doc["status"]["seconds_since_heat_demand_on"] =
        static_cast<int>((millis() - g_heatDemandOnMs) / 1000UL);
  }
  doc["status"]["defrost_startup_suppress_active"] =
      defrostStartupSuppressActive(millis());
  doc["status"]["run_command_mismatch"] = false;
  doc["status"]["compressor_likely_running"] = g_compressorLikelyRunning;
  doc["status"]["compressor_likely_from_coil_vs_outdoor"] = true;
  if (!isnan(outdoorC) && !isnan(outdoorCoilC)) {
    doc["status"]["outdoor_coil_minus_outdoor_c"] =
        static_cast<double>(outdoorCoilC - outdoorC);
  }
  doc["network"]["connected"] = isNetworkConnected();
  doc["status"]["data_online"] = isNetworkConnected();
  doc["network"]["ip"] = currentIpString();
#if USE_ETHERNET
  doc["network"]["eth_ip"] = ETH.localIP().toString();
  doc["network"]["eth_link_up"] = ETH.linkUp();
#endif
  doc["network"]["wifi_sta_connected"] = WiFi.status() == WL_CONNECTED;
  if (WiFi.status() == WL_CONNECTED) {
    doc["network"]["wifi_ip"] = WiFi.localIP().toString();
    doc["network"]["ssid"] = WiFi.SSID();
    doc["network"]["rssi"] = WiFi.RSSI();
    doc["network"]["status_code"] = static_cast<int>(WiFi.status());
  } else {
    doc["network"]["wifi_ip"] = "0.0.0.0";
    doc["network"]["ssid"] = "";
    doc["network"]["rssi"] = -127;
    doc["network"]["status_code"] = static_cast<int>(WiFi.status());
  }
#if USE_ETHERNET
  doc["network"]["type"] =
      ethernetHasIp() ? "ethernet" : (WiFi.status() == WL_CONNECTED ? "wifi" : "none");
  doc["network"]["link_up"] = ETH.linkUp();
#else
  doc["network"]["type"] = "wifi";
#endif
#if ETHERNET_ONLY_WAN
  doc["network"]["wan_policy"] = "ethernet_cable_only";
#else
  doc["network"]["wan_policy"] = "ethernet_wifi_sta_fallback_allowed";
#endif
  {
    const char *internetPath = "none";
#if USE_ETHERNET
    if (ethernetHasIp()) {
      internetPath = "ethernet_rj45";
    }
#endif
#if !(USE_ETHERNET && ETHERNET_ONLY_WAN)
    if (WiFi.status() == WL_CONNECTED
#if USE_ETHERNET
        && !ethernetHasIp()
#endif
    ) {
      internetPath = "wifi_sta";
    }
#endif
    doc["network"]["internet_path"] = internetPath;
  }
  {
    const bool apActive = WiFi.getMode() & WIFI_AP;
    doc["network"]["wifi_softap_active"] = apActive;
    if (apActive) {
      String apSid = WiFi.softAPSSID();
      if (apSid.length() == 0) {
        apSid = WIFI_AP_SSID_PREFIX;
      }
      doc["network"]["wifi_ap_ssid"] = apSid.c_str();
      doc["network"]["wifi_ap_ip"] = WiFi.softAPIP().toString();
      doc["network"]["wifi_ap_wpa_active"] = String(WIFI_AP_PASSWORD).length() >= 8;
    } else {
      doc["network"]["wifi_ap_ssid"] = "";
      doc["network"]["wifi_ap_ip"] = "";
      doc["network"]["wifi_ap_wpa_active"] = false;
    }
  }
  doc["alarms"]["external_alarm_input"] = externalAlarm;
  doc["alarms"]["sensor_disconnected"] = sensorDisconnected;
  doc["alarms"]["hot_gas_high"] = hotGasHigh;
  doc["alarms"]["refrigerant_return_low"] = refrigerantReturnLow;
  doc["alarms"]["refrigerant_delta_high"] = refrigerantDeltaHigh;
  doc["alarms"]["refrigerant_delta_low"] = refrigerantDeltaLow;
  doc["alarms"]["run_command_mismatch"] = false;
  doc["alarms"]["deviation_any"] = deviationAlarm;
  doc["alarms"]["notify_alarm"] = notifyAlarm;
  doc["alarms"]["any_alarm"] = anyAlarm;

  doc["defrost"]["active"] = g_defrostActive;
  doc["defrost"]["elapsed_s"] =
      static_cast<int>(g_defrostActive ? ((millis() - g_defrostStartMs) / 1000UL) : 0);
  doc["defrost"]["today_count"] = static_cast<int>(g_defrostTodayCount);
  doc["defrost"]["yesterday_count"] = static_cast<int>(g_defrostYesterdayCount);
  doc["defrost"]["avg_duration_min"] =
      static_cast<double>(g_defrostAvgSampleCount > 0 ? g_defrostAvgDurationMin : 0.0);
  doc["defrost"]["avg_duration_samples"] = static_cast<int>(g_defrostAvgSampleCount);
  if (!isnan(g_lastDefrostCoilEndC)) {
    doc["defrost"]["last_coil_end_c"] = static_cast<double>(g_lastDefrostCoilEndC);
  } else {
    doc["defrost"]["last_coil_end_c"] = "nan";
  }
  if (!isnan(g_lastDefrostDurationMin)) {
    doc["defrost"]["last_duration_min"] = static_cast<double>(g_lastDefrostDurationMin);
  } else {
    doc["defrost"]["last_duration_min"] = "nan";
  }
  doc["defrost"]["last_ended_ms"] = static_cast<double>(g_lastDefrostEndedMs);

  for (const auto &point : sensorPoints) {
    if (point.valid) {
      doc["temperatures"][point.key] = point.celsius;
    } else {
      doc["temperatures"][point.key] = "nan";
    }
  }

  String telemetryPayload;
  serializeJson(doc, telemetryPayload);
  if (telemetryPayload.isEmpty()) {
    Serial.println("Telemetry JSON serialize failed.");
    return false;
  }

  mqttTelemetryPublish(telemetryPayload);
  supabaseTelemetryPublishOrQueue(telemetryPayload);
  supabaseFlushBacklog();
  Serial.println("Telemetry published.");
  return true;
}


#if USE_ETHERNET
void pumpEthernetLateDhcpIfNeeded(unsigned long now) {
  if (g_wanEthernetActive) {
    return;
  }
  static unsigned long lastCheckMs = 0;
  if (now - lastCheckMs < 2000UL) {
    return;
  }
  lastCheckMs = now;
  if (!ETH.linkUp() || !ethernetHasIp()) {
    return;
  }
  g_wanEthernetActive = true;
  Serial.print("[NET] Ethernet DHCP myohassa, IP: ");
  Serial.println(ETH.localIP());
  applyEthernetWanDns();
}
#endif

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("VRF temperature monitor starting...");

  setupNetwork();

  relayControllerReady = setupRelayController();
  Serial.printf("Relay controller (TCA9554) init: %s\n", relayControllerReady ? "OK" : "FAILED");
  g_di4UnitReady.pin = DI4_UNIT_READY_PIN;
  g_di2Compressor.pin = DI2_COMPRESSOR_PIN;
  initStatusDiPin(DI4_UNIT_READY_PIN);
  initStatusDiPin(DI2_COMPRESSOR_PIN);
  initStatusDiPin(ALARM_INPUT_PIN);
  loadCloudMirrorFromNvs();
  loadAlarmOutputFromNvs();
  loadDefrostPrefs();
  applyHeatOutput();

  ds18b20.begin();

  mqttTelemetrySetup();
  supabaseSyncSetup();
  setupClock();
#if USE_ETHERNET && (SOFTAP_PARALLEL_ETHERNET || ETHERNET_ONLY_WAN)
  startParallelCredentialSoftApIfWanEthernet();
#endif
  pullSettingsFromSupabase();
}

void loop() {
  mqttTelemetryLoop();

  credentialPortalPumpInLoopIfNeeded();

  const unsigned long now = millis();
#if USE_ETHERNET
  pumpEthernetLateDhcpIfNeeded(now);
#endif
  updateDi3AlarmShutdown();

  // Ohjaus + asetukset + OTA yhdellä config-haulla (supabaseFetchConfigJson välimuisti 2 s).
  // Ennen: ohjaus 0,5 s, asetukset 5 s, OTA 10 s välein.
  const unsigned long configInterval =
      supabaseConfigChangedWithin(CONFIG_POLL_FAST_WINDOW_MS) ? CONFIG_POLL_FAST_INTERVAL_MS
                                                             : CONFIG_POLL_INTERVAL_MS;
  if (lastControlPollMs == 0 || now - lastControlPollMs >= configInterval) {
    lastControlPollMs = now;
    pullControlFromSupabase();
    pullSettingsFromSupabase();
#if USE_OTA
    pullOtaFromSupabase();
#endif
  }

  if (now - lastReadMs >= READ_INTERVAL_MS) {
    lastReadMs = now;
    readSensors();
    enforceOutdoorSafetyLock();
    publishTelemetry();
    lastPublishMs = now;
  }
}
