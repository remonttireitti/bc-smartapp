#include "cloud_config.h"

#include "config.h"
#include "ota_update.h"
#include "supabase_sync.h"

#include <ArduinoJson.h>
#include <Preferences.h>

extern bool permitRequestedFromCloud;
extern bool heatEnabled;
extern bool autoStopEnabled;
extern bool outdoorSafetyLockActive;
extern float autoStopBelowOutdoorC;
extern float outdoorAutoStopHysteresisC;
extern uint32_t outdoorAutoStopSmoothTauMin;
extern float hotGasHighAlarmC;
extern float refrigerantReturnLowAlarmC;
extern float refrigerantDeltaHighAlarmC;
extern float refrigerantDeltaLowAlarmC;
extern uint32_t compressorAlarmEnableAfterS;
extern int di2TriggerRawLevel;
extern int di3TriggerRawLevel;
extern int di4TriggerRawLevel;
extern int alarmInputTriggerRawLevel;
extern float gOutdoorAutoStopEma;
extern bool alarmShutdownActive;
extern bool di3AlarmShutdownEnabled;

extern void applyHeatOutput();
extern bool applyAlarmOutputSettings(bool hasEnabled, bool enabled, bool hasMode, bool nc,
                                     bool hasChannel, int channel);
extern bool g_forceTelemetry;
extern bool readAlarmInput();
extern void saveCloudMirrorToNvsIfChanged();
extern bool isNetworkConnected();

#if USE_OTA
static bool g_otaDownloadActive = false;
#endif

namespace {

constexpr char kCloudNs[] = "vrf_cloud";
constexpr char kAlarmResetNonceKey[] = "alarm_rst";

int64_t parseSettingsNonce(JsonVariantConst value) {
  if (value.isNull()) {
    return 0;
  }
  if (value.is<int64_t>()) {
    return value.as<int64_t>();
  }
  if (value.is<int>() || value.is<long>()) {
    return value.as<int64_t>();
  }
  if (value.is<double>()) {
    return static_cast<int64_t>(value.as<double>());
  }
  return 0;
}

bool shouldSkipAlarmResetNonce(const int64_t nonce) {
  if (nonce <= 0) {
    return true;
  }
  Preferences prefs;
  if (!prefs.begin(kCloudNs, true)) {
    return false;
  }
  const int64_t last = prefs.getLong(kAlarmResetNonceKey, 0);
  prefs.end();
  return nonce == last;
}

void markAlarmResetNonce(const int64_t nonce) {
  Preferences prefs;
  if (!prefs.begin(kCloudNs, false)) {
    return;
  }
  prefs.putLong(kAlarmResetNonceKey, nonce);
  prefs.end();
}

}  // namespace

bool tryClearAlarmShutdownFromCloud(const int64_t nonce, const bool force) {
  if (shouldSkipAlarmResetNonce(nonce)) {
    return false;
  }
  if (!alarmShutdownActive) {
    markAlarmResetNonce(nonce);
    return true;
  }
  if (readAlarmInput() && !force) {
    Serial.println("Alarm reset refused: DI3 still active.");
    return false;
  }
  if (readAlarmInput() && force) {
    Serial.println("Alarm shutdown force-cleared while DI3 still reads active.");
  }
  alarmShutdownActive = false;
  applyHeatOutput();
  markAlarmResetNonce(nonce);
  Serial.println("Alarm shutdown cleared via cloud reset.");
  return true;
}

bool applyCloudHeatRequest(bool requestedEnabled) {
  permitRequestedFromCloud = requestedEnabled;

  if (autoStopEnabled && outdoorSafetyLockActive && requestedEnabled) {
    if (heatEnabled) {
      heatEnabled = false;
      applyHeatOutput();
    }
    Serial.println(
        "Outdoor safety lock: ignoring Supabase heat ON until outdoor release.");
    return true;
  }

  if (requestedEnabled != heatEnabled) {
    heatEnabled = requestedEnabled;
    applyHeatOutput();
    saveCloudMirrorToNvsIfChanged();
    Serial.printf("Heat control updated from Supabase: %s\n",
                  heatEnabled ? "ON" : "OFF");
  }
  return true;
}

bool pullControlFromSupabase() {
  String json;
  if (!supabaseFetchConfigJson(json)) {
    return false;
  }

  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.printf("[Supabase] control JSON parse failed: %s\n", err.c_str());
    return false;
  }

  JsonVariant enabled = doc["control"]["enabled"];
  if (!enabled.isNull()) {
    applyCloudHeatRequest(enabled.as<bool>());
    return true;
  }
  return false;
}

bool pullSettingsFromSupabase() {
  String json;
  if (!supabaseFetchConfigJson(json)) {
    return false;
  }

  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.printf("[Supabase] settings JSON parse failed: %s\n", err.c_str());
    return false;
  }

  JsonObject settings = doc["settings"];
  if (settings.isNull()) {
    return false;
  }

  bool ok = false;

  if (!settings["auto_stop_enabled"].isNull()) {
    autoStopEnabled = settings["auto_stop_enabled"].as<bool>();
    ok = true;
  }
  if (!settings["auto_stop_below_outdoor_c"].isNull()) {
    autoStopBelowOutdoorC = settings["auto_stop_below_outdoor_c"].as<float>();
    ok = true;
  }
  if (!settings["auto_stop_outdoor_hysteresis_c"].isNull()) {
    outdoorAutoStopHysteresisC =
        settings["auto_stop_outdoor_hysteresis_c"].as<float>();
    if (outdoorAutoStopHysteresisC < 0.f) {
      outdoorAutoStopHysteresisC = 0.f;
    }
    ok = true;
  }
  if (!settings["auto_stop_outdoor_smooth_tau_min"].isNull()) {
    int tau = settings["auto_stop_outdoor_smooth_tau_min"].as<int>();
    if (tau < 0) {
      tau = 0;
    }
    if (tau > static_cast<int>(AUTO_STOP_OUTDOOR_SMOOTH_TAU_MIN_MAX)) {
      tau = static_cast<int>(AUTO_STOP_OUTDOOR_SMOOTH_TAU_MIN_MAX);
    }
    const uint32_t tauNew = static_cast<uint32_t>(tau);
    if (tauNew != outdoorAutoStopSmoothTauMin) {
      gOutdoorAutoStopEma = NAN;
    }
    outdoorAutoStopSmoothTauMin = tauNew;
    ok = true;
  }

  JsonObject alarmLimits = settings["alarm_limits"];
  if (!alarmLimits.isNull()) {
    if (!alarmLimits["hot_gas_high_c"].isNull()) {
      hotGasHighAlarmC = alarmLimits["hot_gas_high_c"].as<float>();
      ok = true;
    }
    if (!alarmLimits["refrigerant_return_low_c"].isNull()) {
      refrigerantReturnLowAlarmC =
          alarmLimits["refrigerant_return_low_c"].as<float>();
      ok = true;
    }
    if (!alarmLimits["refrigerant_delta_high_c"].isNull()) {
      refrigerantDeltaHighAlarmC =
          alarmLimits["refrigerant_delta_high_c"].as<float>();
      ok = true;
    }
    if (!alarmLimits["refrigerant_delta_low_c"].isNull()) {
      refrigerantDeltaLowAlarmC =
          alarmLimits["refrigerant_delta_low_c"].as<float>();
      ok = true;
    }
  }

  if (!settings["compressor_alarm_enable_after_s"].isNull()) {
    const int delaySec = settings["compressor_alarm_enable_after_s"].as<int>();
    compressorAlarmEnableAfterS =
        delaySec < 0 ? 0 : static_cast<uint32_t>(delaySec);
    ok = true;
  }
  if (!settings["alarm_input_trigger_raw_level"].isNull()) {
    di3TriggerRawLevel =
        settings["alarm_input_trigger_raw_level"].as<int>() == 0 ? 0 : 1;
    alarmInputTriggerRawLevel = di3TriggerRawLevel;
    ok = true;
  }
  if (!settings["di2_trigger_raw_level"].isNull()) {
    di2TriggerRawLevel = settings["di2_trigger_raw_level"].as<int>() == 0 ? 0 : 1;
    ok = true;
  }
  if (!settings["di3_trigger_raw_level"].isNull()) {
    di3TriggerRawLevel = settings["di3_trigger_raw_level"].as<int>() == 0 ? 0 : 1;
    alarmInputTriggerRawLevel = di3TriggerRawLevel;
    ok = true;
  }
  if (!settings["di4_trigger_raw_level"].isNull()) {
    di4TriggerRawLevel = settings["di4_trigger_raw_level"].as<int>() == 0 ? 0 : 1;
    ok = true;
  }
  if (!settings["di3_alarm_shutdown_enabled"].isNull()) {
    di3AlarmShutdownEnabled = settings["di3_alarm_shutdown_enabled"].as<bool>();
    if (!di3AlarmShutdownEnabled && alarmShutdownActive) {
      alarmShutdownActive = false;
      applyHeatOutput();
    }
    ok = true;
  }

  {
    JsonVariant aoEnabled = settings["alarm_output_enabled"];
    JsonVariant aoMode = settings["alarm_output_mode"];
    JsonVariant aoChannel = settings["alarm_output_channel"];
    bool hasMode = false;
    bool nc = false;
    if (aoMode.is<const char *>()) {
      String m = aoMode.as<const char *>();
      m.trim();
      m.toUpperCase();
      if (m == "NO" || m == "NC") {
        hasMode = true;
        nc = m == "NC";
      }
    }
    const bool hasEnabled = aoEnabled.is<bool>();
    const bool hasChannel = aoChannel.is<int>() || aoChannel.is<double>();
    if (hasEnabled || hasMode || hasChannel) {
      applyAlarmOutputSettings(hasEnabled, hasEnabled && aoEnabled.as<bool>(), hasMode, nc, hasChannel,
                               hasChannel ? aoChannel.as<int>() : 0);
      ok = true;
    }
  }

  JsonObject resetReq = settings["alarm_shutdown_reset"];
  if (!resetReq.isNull() && !resetReq["nonce"].isNull()) {
    const bool force = !resetReq["force"].isNull() && resetReq["force"].as<bool>();
    if (tryClearAlarmShutdownFromCloud(parseSettingsNonce(resetReq["nonce"]), force)) {
      ok = true;
    }
  }

  if (ok) {
    saveCloudMirrorToNvsIfChanged();
  }
  return ok;
}

#if USE_OTA
void pullOtaFromSupabase() {
  if (g_otaDownloadActive) {
    return;
  }
  if (!isNetworkConnected()) {
    return;
  }

  String json;
  if (!supabaseFetchConfigJson(json)) {
    return;
  }

  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, json);
  if (err) {
    return;
  }

  JsonObject otaReq = doc["settings"]["ota_request"];
  if (otaReq.isNull()) {
    return;
  }

  if (otaReq["nonce"].isNull()) {
    return;
  }
  const int64_t nonce = parseSettingsNonce(otaReq["nonce"]);
  if (otaShouldSkipNonce(nonce)) {
    return;
  }

  if (otaReq["url"].isNull()) {
    return;
  }
  String url = otaReq["url"].as<const char *>();
  url.trim();
  if (url.length() == 0) {
    return;
  }

  g_otaDownloadActive = true;
  Serial.printf("[OTA] start nonce=%lld len=%u\n", static_cast<long long>(nonce),
                static_cast<unsigned>(url.length()));

  String errDetail;
  if (otaTryHttpFlash(url, nonce, errDetail)) {
    g_otaDownloadActive = false;
    return;
  }

  Serial.printf("[OTA] failed: %s\n", errDetail.c_str());
  g_otaDownloadActive = false;
}
#else
void pullOtaFromSupabase() {}
#endif
