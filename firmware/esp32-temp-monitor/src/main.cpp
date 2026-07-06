#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Kopioi secrets_template.h → include/secrets.h"
#endif

#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#ifndef READ_INTERVAL_MS
#define READ_INTERVAL_MS 120000UL
#endif
#ifndef FIRST_SEND_DELAY_MS
#define FIRST_SEND_DELAY_MS 5000UL
#endif

#define ONE_WIRE_BUS 4
#define FW_VERSION "esp32-1"

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature dallas(&oneWire);

static String ingestUrl() {
  String base = String(SUPABASE_URL);
  if (base.endsWith("/")) {
    base.remove(base.length() - 1);
  }
  return base + "/functions/v1/temp-monitor-ingest";
}

static void syncTime() {
  setenv("TZ", "Europe/Helsinki", 1);
  tzset();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  for (int i = 0; i < 40; i++) {
    if (time(nullptr) > 1700000000) return;
    delay(500);
  }
}

static bool wifiConnect() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
  }
  return WiFi.status() == WL_CONNECTED;
}

static bool postReading(float t1, float t2, time_t epoch) {
  HTTPClient http;
  http.setTimeout(15000);
  http.begin(ingestUrl());
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  char body[192];
  snprintf(body, sizeof(body),
           "{\"t1\":%.2f,\"t2\":%.2f,\"ts\":%lld,\"fw\":\"%s\",\"hardware_id\":\"xiao_c3\"}",
           t1, t2, (long long)epoch, FW_VERSION);

  const int code = http.POST(body);
  const String resp = http.getString();
  http.end();

  if (code < 200 || code >= 300) {
    Serial.printf("Ingest HTTP %d: %s\n", code, resp.c_str());
    return false;
  }
  Serial.printf("Lähetetty: t1=%.2f t2=%.2f\n", t1, t2);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(800);
  pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
  dallas.begin();
  Serial.printf("DS18B20: %d\n", dallas.getDeviceCount());
  if (!wifiConnect()) {
    Serial.println("WiFi epäonnistui");
    return;
  }
  syncTime();
}

void loop() {
  static unsigned long last = 0;
  static bool first = true;
  const unsigned long interval = first ? FIRST_SEND_DELAY_MS : READ_INTERVAL_MS;
  if (millis() - last < interval) {
    delay(200);
    return;
  }
  last = millis();

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(3000);
    return;
  }

  dallas.requestTemperatures();
  const int n = dallas.getDeviceCount();
  float t1 = dallas.getTempCByIndex(0);
  float t2 = (n >= 2) ? dallas.getTempCByIndex(1) : DEVICE_DISCONNECTED_C;
  if (t1 == DEVICE_DISCONNECTED_C) return;
  if (t2 == DEVICE_DISCONNECTED_C) t2 = t1;

  first = false;
  time_t epoch = time(nullptr);
  if (epoch < 1700000000) epoch = millis() / 1000;
  postReading(t1, t2, epoch);
}
