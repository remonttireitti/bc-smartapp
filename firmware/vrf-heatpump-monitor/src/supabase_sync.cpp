#include "supabase_sync.h"

#include "config.h"

#include <ETH.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include <deque>

namespace {

bool supabaseNetworkUp() {
#if USE_ETHERNET
  if (ETH.linkUp() && ETH.localIP() != IPAddress(0, 0, 0, 0)) {
    return true;
  }
#endif
  return WiFi.status() == WL_CONNECTED;
}

String g_cachedConfigJson;
unsigned long g_cachedConfigMs = 0;
unsigned long g_configChangedAtMs = 0;
bool g_configChangedEver = false;

std::deque<String> g_telemetryBacklog;
bool g_lastIngestOk = false;
String g_lastIngestMessage;

bool supabasePostTelemetry(const String &jsonUtf8) {
  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();

  if (!http.begin(client, SUPABASE_INGEST_URL)) {
    g_lastIngestOk = false;
    g_lastIngestMessage = "HTTP begin failed";
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", SUPABASE_DEVICE_KEY);
  http.setTimeout(20000);
  http.setReuse(false);

  const int code = http.POST(jsonUtf8);
  if (code == 200) {
    g_lastIngestOk = true;
    g_lastIngestMessage = "ingest OK";
    http.end();
    return true;
  }

  const String body = http.getString();
  g_lastIngestOk = false;
  g_lastIngestMessage = String("HTTP ") + code + ": " + body;
  Serial.printf("[Supabase] ingest failed HTTP %d: %s\n", code, body.c_str());
  http.end();
  return false;
}

void enqueueTelemetryBacklog(const String &jsonUtf8) {
  while (g_telemetryBacklog.size() >= HISTORY_BACKLOG_MAX_SAMPLES) {
    g_telemetryBacklog.pop_front();
    Serial.println("[Supabase] telemetry backlog full; dropped oldest.");
  }
  g_telemetryBacklog.push_back(jsonUtf8);
}

}  // namespace

bool supabaseConfigured() {
  return SUPABASE_DEVICE_KEY[0] != '\0' && SUPABASE_INGEST_URL[0] != '\0';
}

bool supabaseConfigConfigured() {
  return SUPABASE_DEVICE_KEY[0] != '\0' && SUPABASE_CONFIG_URL[0] != '\0';
}

bool supabaseLastIngestOk() {
  return g_lastIngestOk;
}

String supabaseLastIngestMessage() {
  return g_lastIngestMessage;
}

void supabaseSyncSetup() {
  if (!supabaseConfigured()) {
    Serial.println("[Supabase] ingest disabled (missing URL or device key).");
    return;
  }
  Serial.printf("[Supabase] ingest URL: %s\n", SUPABASE_INGEST_URL);
  if (supabaseConfigConfigured()) {
    Serial.printf("[Supabase] config URL: %s\n", SUPABASE_CONFIG_URL);
  }
}

void supabaseTelemetryPublishOrQueue(const String &jsonUtf8) {
  if (!supabaseConfigured() || jsonUtf8.isEmpty()) {
    return;
  }
  if (!supabaseNetworkUp()) {
    enqueueTelemetryBacklog(jsonUtf8);
    Serial.println("[Supabase] offline; telemetry queued.");
    return;
  }
  if (!supabasePostTelemetry(jsonUtf8)) {
    enqueueTelemetryBacklog(jsonUtf8);
  } else {
    Serial.println("[Supabase] ingest OK.");
  }
}

void supabaseFlushBacklog() {
  if (!supabaseConfigured() || !supabaseNetworkUp()) {
    return;
  }
  size_t flushed = 0;
  while (!g_telemetryBacklog.empty() &&
         flushed < HISTORY_BACKLOG_FLUSH_BATCH) {
    const String payload = g_telemetryBacklog.front();
    if (!supabasePostTelemetry(payload)) {
      break;
    }
    g_telemetryBacklog.pop_front();
    ++flushed;
    Serial.printf("[Supabase] backlog flushed (%u left)\n",
                  static_cast<unsigned>(g_telemetryBacklog.size()));
    yield();
  }
}

bool supabaseFetchConfigJson(String &outJson) {
  outJson = "";
  if (!supabaseConfigConfigured() || !supabaseNetworkUp()) {
    return false;
  }

  const unsigned long now = millis();
  if (g_cachedConfigJson.length() > 0 && now - g_cachedConfigMs < 2000UL) {
    outJson = g_cachedConfigJson;
    return true;
  }

  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();

  if (!http.begin(client, SUPABASE_CONFIG_URL)) {
    return false;
  }

  http.addHeader("X-Device-Key", SUPABASE_DEVICE_KEY);
  http.setTimeout(15000);
  http.setReuse(false);

  const int code = http.GET();
  if (code != 200) {
    Serial.printf("[Supabase] config failed HTTP %d\n", code);
    http.end();
    return false;
  }

  outJson = http.getString();
  http.end();
  if (g_cachedConfigJson.length() > 0 && outJson != g_cachedConfigJson) {
    g_configChangedAtMs = now;
    g_configChangedEver = true;
  }
  g_cachedConfigJson = outJson;
  g_cachedConfigMs = now;
  return outJson.length() > 0;
}

bool supabaseConfigChangedWithin(unsigned long windowMs) {
  return g_configChangedEver && millis() - g_configChangedAtMs < windowMs;
}
