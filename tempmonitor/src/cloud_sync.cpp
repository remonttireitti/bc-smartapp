#include "cloud_sync.h"

#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

#ifndef TEMP_CLOUD_INGEST_URL
#define TEMP_CLOUD_INGEST_URL ""
#endif

namespace {

constexpr uint32_t CLOUD_INTERVAL_MS = 60 * 1000;
constexpr size_t CLOUD_BATCH_MAX = 30;

struct CloudSample {
  uint32_t tsSec;
  float tempC;
};

Preferences cloudPrefs;
CloudSample batch[CLOUD_BATCH_MAX];
size_t batchCount = 0;
unsigned long lastCloudMs = 0;
char deviceKey[65] = "";
String ingestUrl;

void loadCloudConfig() {
  cloudPrefs.begin("cloud", true);
  String key = cloudPrefs.getString("device_key", "");
  String url = cloudPrefs.getString("ingest_url", TEMP_CLOUD_INGEST_URL);
  cloudPrefs.end();
  strncpy(deviceKey, key.c_str(), sizeof(deviceKey) - 1);
  deviceKey[sizeof(deviceKey) - 1] = '\0';
  ingestUrl = url;
}

bool cloudConfigured() {
  return deviceKey[0] != '\0' && ingestUrl.length() > 8;
}

void queueSample(float tempC) {
  if (batchCount >= CLOUD_BATCH_MAX) return;
  time_t now = time(nullptr);
  batch[batchCount].tsSec =
      now > 1700000000L ? (uint32_t)now : (uint32_t)(millis() / 1000);
  batch[batchCount].tempC = tempC;
  batchCount++;
}

bool ensureTimeSynced() {
  static bool configured = false;
  if (!configured) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    configured = true;
  }
  return time(nullptr) > 1700000000L;
}

bool flushBatch(float currentTemp) {
  if (!cloudConfigured() || WiFi.status() != WL_CONNECTED) return false;
  ensureTimeSynced();

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, ingestUrl)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", deviceKey);

  StaticJsonDocument<2048> doc;
  JsonArray readings = doc["readings"].to<JsonArray>();
  for (size_t i = 0; i < batchCount; i++) {
    JsonObject row = readings.add<JsonObject>();
    row["t"] = batch[i].tsSec;
    row["c"] = batch[i].tempC;
  }
  if (!isnan(currentTemp)) {
    doc["current_temp"] = currentTemp;
  }
  doc["firmware"] = "tempmonitor-1";
  doc["hardware_id"] = WiFi.macAddress();

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  http.end();
  if (code >= 200 && code < 300) {
    batchCount = 0;
    return true;
  }
  Serial.printf("Cloud sync failed: HTTP %d\n", code);
  return false;
}

}  // namespace

void cloudSyncBegin() {
  loadCloudConfig();
  if (cloudConfigured()) {
    Serial.println("Cloud sync configured");
  }
}

void cloudSyncSetDeviceKey(const char *key) {
  Preferences prefs;
  prefs.begin("cloud", false);
  prefs.putString("device_key", key);
  prefs.end();
  loadCloudConfig();
}

const char *cloudSyncDeviceKey() {
  return deviceKey;
}

void cloudSyncLoop(float currentTemp, bool sensorOk) {
  if (!sensorOk || isnan(currentTemp)) return;
  queueSample(currentTemp);
  unsigned long now = millis();
  if (now - lastCloudMs < CLOUD_INTERVAL_MS) return;
  lastCloudMs = now;
  flushBatch(currentTemp);
}
