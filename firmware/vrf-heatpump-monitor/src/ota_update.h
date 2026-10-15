#pragma once

#include <Arduino.h>

/**
 * HTTP(S) firmware flash (OTA). On success the HTTPUpdate stack reboots — this
 * function does not return. On failure, returns false and sets detailOut.
 * NVS namespace "vrf_ota": last_nonce (completed).
 */
bool otaTryHttpFlash(const String &url, int64_t nonce, String &detailOut);

bool otaShouldSkipNonce(int64_t nonce);

void otaPrefsMarkFailure(int64_t nonce);

String otaLastErrorText();
int64_t otaLastAttemptNonce();
