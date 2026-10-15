#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#include "config.h"

namespace {

OneWire oneWire(ONE_WIRE_BUS_PIN);
DallasTemperature sensors(&oneWire);

void printAddress(const DeviceAddress addr) {
  for (uint8_t i = 0; i < 8; i++) {
    if (addr[i] < 16) {
      Serial.print("0");
    }
    Serial.print(addr[i], HEX);
    if (i < 7) {
      Serial.print(" ");
    }
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1200);
  Serial.println();
  Serial.println("=== DS18B20 SCANNER ===");
  Serial.printf("1-Wire GPIO: %d\n", ONE_WIRE_BUS_PIN);
  sensors.begin();
}

void loop() {
  sensors.begin();
  const int count = sensors.getDeviceCount();
  Serial.printf("Detected devices: %d\n", count);

  DeviceAddress addr;
  for (int i = 0; i < count; i++) {
    if (sensors.getAddress(addr, static_cast<uint8_t>(i))) {
      Serial.printf("Sensor %d ROM: ", i);
      printAddress(addr);
      Serial.println();
    } else {
      Serial.printf("Sensor %d ROM read failed\n", i);
    }
  }

  if (count > 0) {
    sensors.requestTemperatures();
    for (int i = 0; i < count; i++) {
      const float t = sensors.getTempCByIndex(static_cast<uint8_t>(i));
      Serial.printf("Sensor %d temp: %.2f C\n", i, t);
    }
  }

  Serial.println("-----------------------");
  delay(3000);
}
