#include "mqtt_client.h"
#include "config.h"
#include <ETH.h>
#include <PubSubClient.h>
#include <WiFi.h>

#if USE_MQTT

static WiFiClient s_mqttTcp;
static PubSubClient s_mqtt(s_mqttTcp);
static String s_topicTelemetry;

static bool mqttNetworkUp() {
#if USE_ETHERNET
  if (ETH.linkUp() && ETH.localIP() != IPAddress(0, 0, 0, 0)) {
    return true;
  }
#endif
  return WiFi.status() == WL_CONNECTED;
}

static bool mqttReconnect() {
  if (!mqttNetworkUp()) {
    return false;
  }
  const String clientId = String("esp32-") + DEVICE_ID;
  bool ok;
  if (MQTT_USER[0] == '\0') {
    ok = s_mqtt.connect(clientId.c_str());
  } else {
    ok = s_mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
  }
  if (!ok) {
    return false;
  }
  return true;
}

void mqttTelemetrySetup() {
  s_topicTelemetry = String("vrf/") + DEVICE_ID + "/telemetry";
  s_mqtt.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  s_mqtt.setBufferSize(16384);
}

void mqttTelemetryLoop() {
  if (!mqttNetworkUp()) {
    return;
  }
  if (!s_mqtt.connected()) {
    (void)mqttReconnect();
  }
  s_mqtt.loop();
}

void mqttTelemetryPublish(const String &jsonUtf8) {
  if (!mqttNetworkUp()) {
    return;
  }
  if (!s_mqtt.connected()) {
    if (!mqttReconnect()) {
      return;
    }
  }
  const bool pub = s_mqtt.publish(
      s_topicTelemetry.c_str(),
      jsonUtf8.c_str(),
      (MQTT_RETAIN_TELEMETRY != 0));
  if (!pub) {
    Serial.println("[MQTT] publish failed (buffer or connection).");
  }
}

#else  // !USE_MQTT

void mqttTelemetrySetup() {}
void mqttTelemetryLoop() {}
void mqttTelemetryPublish(const String &) {}

#endif
