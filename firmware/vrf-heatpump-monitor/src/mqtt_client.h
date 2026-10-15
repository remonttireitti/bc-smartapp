#pragma once

#include <Arduino.h>

void mqttTelemetrySetup();
void mqttTelemetryLoop();
void mqttTelemetryPublish(const String &jsonUtf8);
