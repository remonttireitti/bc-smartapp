#pragma once

#include <Arduino.h>
#include <JC3248W535.h>

constexpr int WIFI_MAX_SAVED = 8;
constexpr int WIFI_SCAN_MAX = 24;
constexpr int WIFI_LIST_VISIBLE = 5;

void wifiConfigBegin();
void wifiConfigLoop();
void wifiConfigDraw(Arduino_Canvas *gfx, int screenW, int screenH);
bool wifiConfigHandleTap(int x, int y);
bool wifiConfigOnSubScreen();
void wifiConfigGoBack();
bool wifiConfigIsConnected();
bool wifiConfigSetupApActive();
void wifiConfigStartSetupAp();
void wifiConfigStopSetupAp();
int wifiConfigSavedCount();
