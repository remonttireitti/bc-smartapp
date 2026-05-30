#pragma once

void cloudSyncBegin();
void cloudSyncLoop(float currentTemp, bool sensorOk);
void cloudSyncSetDeviceKey(const char *key);
const char *cloudSyncDeviceKey();
