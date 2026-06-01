#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <JC3248W535.h>
#include <math.h>
#include "history.h"

#define SWIPE_MIN_PX 55
#define TAP_MAX_PX 18

#define COLOR_BG 0x0841
#define COLOR_PANEL 0x1082
#define COLOR_TEXT 0xFFFF
#define COLOR_ACCENT 0x07FF
#define COLOR_WARN 0xF800
#define COLOR_GRAPH 0xFD20
#define COLOR_GRID 0x4208
#define COLOR_DOT 0x632C
#define COLOR_DOT_ACTIVE 0xFFFF

enum Screen { SCREEN_HOME = 0, SCREEN_WIFI = 1, SCREEN_COUNT };

const int DS18B20_CANDIDATE_PINS[] = {17, 18, 13, 14};
const size_t DS18B20_CANDIDATE_COUNT = sizeof(DS18B20_CANDIDATE_PINS) / sizeof(DS18B20_CANDIDATE_PINS[0]);

int dataPin = -1;
OneWire *oneWire = nullptr;
DallasTemperature *sensors = nullptr;
JC3248W535_Display display;
JC3248W535_Touch touch;
Arduino_Canvas *gfx = nullptr;

Preferences prefs;
WiFiManager wifiManager;

int currentScreen = SCREEN_HOME;
float currentTemp = NAN;
bool sensorOk = false;
bool wifiPortalActive = false;
unsigned long lastTempRead = 0;
unsigned long lastDraw = 0;
unsigned long lastSensorScan = 0;

const char *AP_NAME = "TempMonitor-Setup";

void initSensorBus(int pin) {
  if (sensors) {
    delete sensors;
    sensors = nullptr;
  }
  if (oneWire) {
    delete oneWire;
    oneWire = nullptr;
  }

  dataPin = pin;
  oneWire = new OneWire(pin);
  sensors = new DallasTemperature(oneWire);
  sensors->begin();
  sensors->setWaitForConversion(false);
  sensors->setResolution(12);
}

bool probeDs18b20Pin(int pin) {
  OneWire ow(pin);
  pinMode(pin, INPUT_PULLUP);
  delay(2);
  if (!ow.reset()) {
    return false;
  }
  ow.reset_search();
  uint8_t addr[8];
  return ow.search(addr);
}

int findDs18b20Pin() {
  for (size_t i = 0; i < DS18B20_CANDIDATE_COUNT; i++) {
    int pin = DS18B20_CANDIDATE_PINS[i];
    if (probeDs18b20Pin(pin)) {
      Serial.printf("DS18B20 found on GPIO %d\n", pin);
      return pin;
    }
    Serial.printf("DS18B20 not on GPIO %d\n", pin);
  }
  return -1;
}

bool ensureSensorBus() {
  if (dataPin >= 0 && sensors && probeDs18b20Pin(dataPin)) {
    return true;
  }

  int found = findDs18b20Pin();
  if (found < 0) {
    dataPin = -1;
    sensorOk = false;
    return false;
  }

  if (found != dataPin) {
    initSensorBus(found);
    prefs.begin("tempmon", false);
    prefs.putInt("ow_pin", found);
    prefs.end();
  }
  return true;
}

struct SwipeTracker {
  bool active = false;
  int16_t startX = 0;
  int16_t startY = 0;
  int16_t lastX = 0;
  int16_t lastY = 0;
  unsigned long lastTouchMs = 0;
} swipe;

void startWifiPortal();
void drawCurrentScreen();
void drawPageIndicator();

void formatAgeLabel(char *buf, size_t len, uint32_t ageSec) {
  if (ageSec >= 86400) {
    uint32_t d = ageSec / 86400;
    uint32_t h = (ageSec % 86400) / 3600;
    if (h == 0) {
      snprintf(buf, len, "-%lud", (unsigned long)d);
    } else {
      snprintf(buf, len, "-%lud%luh", (unsigned long)d, (unsigned long)h);
    }
  } else if (ageSec >= 3600) {
    snprintf(buf, len, "-%luh", (unsigned long)(ageSec / 3600));
  } else {
    snprintf(buf, len, "-%lum", (unsigned long)((ageSec + 30) / 60));
  }
}

void formatElapsedLabel(char *buf, size_t len, uint32_t sec) {
  if (sec >= 86400) {
    snprintf(buf, len, "%lud", (unsigned long)(sec / 86400));
  } else if (sec >= 3600) {
    snprintf(buf, len, "%luh", (unsigned long)(sec / 3600));
  } else {
    snprintf(buf, len, "%lum", (unsigned long)((sec + 30) / 60));
  }
}

void drawTrendGraph(int x, int y, int w, int h) {
  gfx->fillRoundRect(x, y, w, h, 8, COLOR_PANEL);
  gfx->drawRoundRect(x, y, w, h, 8, COLOR_GRID);

  TrendStore &trend = historyTrend();
  uint32_t n = trend.sampleCount();
  if (n < 2) {
    gfx->setTextColor(COLOR_GRID);
    gfx->setTextSize(1);
    gfx->setCursor(x + 8, y + h / 2 - 4);
    gfx->print("Kerataan dataa...");
    return;
  }

  const int padL = 34;
  const int padR = 4;
  const int padT = 4;
  const int padB = 16;
  const int gx = x + padL;
  const int gy = y + padT;
  const int gw = w - padL - padR;
  const int gh = h - padT - padB;

  float tMin = NAN;
  float tMax = NAN;
  for (uint32_t i = 0; i < n; i++) {
    float val;
    uint32_t age;
    if (!trend.valueAtOffset(i, val, age)) continue;
    if (isnan(tMin) || val < tMin) tMin = val;
    if (isnan(tMax) || val > tMax) tMax = val;
  }
  if (isnan(tMin) || isnan(tMax)) return;
  if (fabsf(tMax - tMin) < 0.5f) {
    tMin -= 0.5f;
    tMax += 0.5f;
  }

  gfx->setTextSize(1);
  gfx->setTextColor(COLOR_GRID);
  for (int i = 0; i <= 4; i++) {
    float tv = tMax - (tMax - tMin) * i / 4.0f;
    int ly = gy + (gh * i) / 4;
    gfx->drawFastHLine(gx, ly, gw, COLOR_GRID);
    char yLbl[8];
    snprintf(yLbl, sizeof(yLbl), "%.0f", tv);
    gfx->setCursor(x + 2, ly - 4);
    gfx->print(yLbl);
  }

  uint32_t span = trend.spanSeconds();
  const uint32_t maxSpanSec = TREND_DAYS * 24UL * 3600UL;
  char xLbl[16];
  gfx->setCursor(gx, y + h - 14);
  if (span >= maxSpanSec - (SAMPLE_INTERVAL_MS / 1000)) {
    formatAgeLabel(xLbl, sizeof(xLbl), span);
    gfx->print(xLbl);
  } else {
    gfx->print("0");
  }
  gfx->setCursor(gx + gw - 18, y + h - 14);
  gfx->print("nyt");
  if (span >= 7200) {
    uint32_t midSec = span / 2;
    formatElapsedLabel(xLbl, sizeof(xLbl), midSec);
    int midPx = gx + (int)((uint64_t)midSec * (gw - 1) / maxSpanSec);
    gfx->setCursor(midPx - 10, y + h - 14);
    gfx->print(xLbl);
  }

  int prevX = -1;
  int prevY = -1;
  auto plotOffset = [&](uint32_t i) {
    float val;
    uint32_t age;
    if (!trend.valueAtOffset(i, val, age)) return;
    uint32_t secFromStart = i * (SAMPLE_INTERVAL_MS / 1000);
    int px = gx + (int)((uint64_t)secFromStart * (gw - 1) / maxSpanSec);
    if (px > gx + gw - 1) px = gx + gw - 1;
    int py = gy + gh - 1 - (int)((val - tMin) / (tMax - tMin) * (gh - 1));
    if (prevX >= 0) {
      gfx->drawLine(prevX, prevY, px, py, COLOR_GRAPH);
    }
    prevX = px;
    prevY = py;
  };

  if (n <= (uint32_t)gw) {
    for (uint32_t i = 0; i < n; i++) {
      plotOffset(i);
    }
  } else {
    for (int col = 0; col < gw; col++) {
      uint32_t targetSec = (uint64_t)col * maxSpanSec / max(1, gw - 1);
      uint32_t offset = targetSec / (SAMPLE_INTERVAL_MS / 1000);
      if (offset >= n) offset = n - 1;
      plotOffset(offset);
    }
  }
}

void drawWifiDot() {
  const int16_t w = gfx->width();
  bool connected = WiFi.status() == WL_CONNECTED;
  bool sdOk = historySd().ready;
  gfx->fillCircle(w - 16, 14, 5, connected ? 0x07E0 : COLOR_WARN);
  gfx->fillCircle(w - 32, 14, 4, sdOk ? 0x07E0 : COLOR_DOT);
}

void drawPageIndicator() {
  const int16_t w = gfx->width();
  const int16_t h = gfx->height();
  const int spacing = 14;
  const int startX = (w - spacing) / 2;

  for (int i = 0; i < SCREEN_COUNT; i++) {
    uint16_t color = (i == currentScreen) ? COLOR_DOT_ACTIVE : COLOR_DOT;
    gfx->fillCircle(startX + i * spacing, h - 10, (i == currentScreen) ? 4 : 3, color);
  }
}

void drawHomeScreen() {
  const int16_t w = gfx->width();
  const int16_t h = gfx->height();

  gfx->fillScreen(COLOR_BG);
  drawWifiDot();

  if (!sensorOk || isnan(currentTemp)) {
    gfx->setTextColor(COLOR_WARN);
    gfx->setTextSize(2);
    gfx->setCursor(w / 2 - 90, 40);
    gfx->print("Anturi ei loydy");
  } else {
    char buf[16];
    snprintf(buf, sizeof(buf), "%.1f", currentTemp);
    gfx->setTextColor(COLOR_ACCENT);
    gfx->setTextSize(7);
    int16_t x1, y1;
    uint16_t tw, th;
    gfx->getTextBounds(buf, 0, 0, &x1, &y1, &tw, &th);
    gfx->setCursor((w - tw - 24) / 2, 28);
    gfx->print(buf);
    gfx->setTextSize(3);
    gfx->print(" C");
  }

  const int graphY = 100;
  const int graphH = h - graphY - 22;
  drawTrendGraph(8, graphY, w - 16, graphH);
  drawPageIndicator();
  display.flush();
}

void drawWifiScreen() {
  const int16_t w = gfx->width();
  const int16_t h = gfx->height();

  gfx->fillScreen(COLOR_BG);
  gfx->fillRect(0, 0, w, 36, COLOR_PANEL);
  gfx->setTextColor(COLOR_TEXT);
  gfx->setTextSize(2);
  gfx->setCursor(12, 8);
  gfx->print("WiFi");
  drawWifiDot();

  bool connected = WiFi.status() == WL_CONNECTED;
  gfx->fillRoundRect(10, 44, w - 20, h - 80, 8, COLOR_PANEL);
  gfx->setTextColor(COLOR_TEXT);
  gfx->setTextSize(1);

  gfx->setCursor(20, 60);
  gfx->print("Tila:");
  gfx->setCursor(70, 60);
  gfx->setTextColor(connected ? 0x07E0 : COLOR_WARN);
  gfx->print(connected ? "Yhdistetty" : "Ei yhteytta");

  gfx->setTextColor(COLOR_TEXT);
  gfx->setCursor(20, 85);
  gfx->print("SSID:");
  gfx->setCursor(70, 85);
  gfx->print(connected ? WiFi.SSID().c_str() : "-");

  gfx->setCursor(20, 110);
  gfx->print("IP:");
  gfx->setCursor(70, 110);
  gfx->print(connected ? WiFi.localIP().toString().c_str() : "-");

  gfx->setTextColor(COLOR_ACCENT);
  gfx->setCursor(20, 145);
  gfx->print("Napauta alareunaa -> WiFi-asetukset");
  gfx->setTextColor(COLOR_TEXT);
  gfx->setCursor(20, 165);
  gfx->printf("Verkko: %s", AP_NAME);
  gfx->setCursor(20, 185);
  gfx->print("Selain: http://192.168.4.1");

  drawPageIndicator();
  display.flush();
}

void drawPortalScreen() {
  const int16_t w = gfx->width();
  gfx->fillScreen(COLOR_BG);
  gfx->setTextColor(COLOR_ACCENT);
  gfx->setTextSize(2);
  gfx->setCursor(w / 2 - 80, 50);
  gfx->print("WiFi-asetukset");

  gfx->setTextColor(COLOR_TEXT);
  gfx->setTextSize(1);
  gfx->setCursor(20, 100);
  gfx->print("1. Yhdista puhelimella verkkoon:");
  gfx->setTextColor(COLOR_GRAPH);
  gfx->setCursor(20, 118);
  gfx->printf("   %s", AP_NAME);
  gfx->setTextColor(COLOR_TEXT);
  gfx->setCursor(20, 145);
  gfx->print("2. Avaa selaimessa: http://192.168.4.1");
  gfx->setCursor(20, 170);
  gfx->print("3. Valitse WiFi ja salasana");
  display.flush();
}

void drawSplash(const char *message) {
  const int16_t w = gfx->width();
  const int16_t h = gfx->height();
  gfx->fillScreen(COLOR_BG);
  display.backlightOn();
  gfx->setTextColor(COLOR_TEXT);
  gfx->setTextSize(2);
  gfx->setCursor(w / 2 - 60, h / 2 - 10);
  gfx->print(message);
  display.flush();
}

void drawCurrentScreen() {
  if (currentScreen == SCREEN_WIFI) {
    drawWifiScreen();
  } else {
    drawHomeScreen();
  }
}

void goToScreen(int screen) {
  if (screen < 0) screen = 0;
  if (screen >= SCREEN_COUNT) screen = SCREEN_COUNT - 1;
  if (screen == currentScreen) return;
  currentScreen = screen;
  drawCurrentScreen();
}

void goNextScreen() {
  goToScreen(currentScreen + 1);
}

void goPrevScreen() {
  goToScreen(currentScreen - 1);
}

bool tapInWifiSetupArea(int x, int y) {
  return currentScreen == SCREEN_WIFI && y >= 130;
}

void handleSwipeRelease() {
  int dx = swipe.lastX - swipe.startX;
  int dy = swipe.lastY - swipe.startY;

  if (abs(dx) >= SWIPE_MIN_PX && abs(dx) > abs(dy)) {
    if (dx < 0) {
      goNextScreen();
    } else {
      goPrevScreen();
    }
    return;
  }

  if (abs(dx) <= TAP_MAX_PX && abs(dy) <= TAP_MAX_PX &&
      currentScreen == SCREEN_WIFI && tapInWifiSetupArea(swipe.startX, swipe.startY)) {
    startWifiPortal();
  }
}

void handleTouch() {
  TouchPoint point;
  bool touched = touch.read(point);

  if (touched) {
    if (!swipe.active) {
      swipe.active = true;
      swipe.startX = swipe.lastX = point.x;
      swipe.startY = swipe.lastY = point.y;
    } else {
      swipe.lastX = point.x;
      swipe.lastY = point.y;
    }
    swipe.lastTouchMs = millis();
    return;
  }

  if (swipe.active && millis() - swipe.lastTouchMs > 40) {
    handleSwipeRelease();
    swipe.active = false;
  }
}

void readTemperature() {
  if (!sensors || !ensureSensorBus()) {
    sensorOk = false;
    currentTemp = NAN;
    return;
  }

  sensors->requestTemperatures();
  float t = sensors->getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t <= -100.0f || t >= 125.0f) {
    sensorOk = false;
    currentTemp = NAN;
    return;
  }
  sensorOk = true;
  currentTemp = t;
  historyAddSample(t);
}

void startWifiPortal() {
  wifiPortalActive = true;
  drawPortalScreen();

  wifiManager.setConfigPortalTimeout(180);
  wifiManager.setConnectTimeout(20);
  wifiManager.setCaptivePortalEnable(true);
  wifiManager.setAPStaticIPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));

  bool ok = wifiManager.startConfigPortal(AP_NAME);
  wifiPortalActive = false;

  if (ok) {
    prefs.begin("tempmon", false);
    prefs.putString("ssid", WiFi.SSID());
    prefs.end();
  }

  currentScreen = SCREEN_WIFI;
  drawWifiScreen();
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  if (WiFi.SSID().length() > 0) {
    WiFi.begin();
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
      delay(250);
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("WiFi OK: %s / %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    }
  } else {
    Serial.println("WiFi not configured — swipe to WiFi page");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("JC3248 Temperature Monitor");
  Serial.printf("PSRAM: %u bytes\n", ESP.getPsramSize());

  if (!display.begin()) {
    Serial.println("Display init failed — check PSRAM settings!");
    while (true) delay(1000);
  }

  display.backlightOn();
  display.setRotation(ROTATION_90);
  touch.begin();
  display.setTouchRotation(&touch);
  gfx = display.getCanvas();

  drawSplash("Kaynnistyy...");

  prefs.begin("tempmon", true);
  int savedPin = prefs.getInt("ow_pin", -1);
  prefs.end();

  if (savedPin >= 0 && probeDs18b20Pin(savedPin)) {
    initSensorBus(savedPin);
  } else {
    int found = findDs18b20Pin();
    if (found >= 0) {
      initSensorBus(found);
      prefs.begin("tempmon", false);
      prefs.putInt("ow_pin", found);
      prefs.end();
    } else {
      initSensorBus(17);
      Serial.println("DS18B20 not found during startup scan");
    }
  }

  connectWifi();
  historyBegin();

  readTemperature();
  drawCurrentScreen();
}

void loop() {
  if (wifiPortalActive) {
    delay(50);
    return;
  }

  handleTouch();

  unsigned long now = millis();
  if (now - lastTempRead >= SAMPLE_INTERVAL_MS) {
    lastTempRead = now;
    readTemperature();
  }

  if (!sensorOk && now - lastSensorScan >= 5000) {
    lastSensorScan = now;
    ensureSensorBus();
  }

  if (now - lastDraw >= SAMPLE_INTERVAL_MS) {
    lastDraw = now;
    drawCurrentScreen();
    Serial.printf("Temp: %.2f C, GPIO: %d, screen: %d\n", currentTemp, dataPin, currentScreen);
  }

  delay(10);
}
