#pragma once

#include <Arduino.h>

bool applyCloudHeatRequest(bool requestedEnabled);
bool pullControlFromSupabase();
bool pullSettingsFromSupabase();
void pullOtaFromSupabase();
bool tryClearAlarmShutdownFromCloud(int64_t nonce, bool force = false);
