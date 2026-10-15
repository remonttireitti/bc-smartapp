#include "ota_update.h"

#include <HTTPUpdate.h>
#include <Preferences.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>

namespace {

constexpr char kOtaNs[] = "vrf_ota";
constexpr char kLastNonceKey[] = "last_nonce";

static int64_t g_pendingOtaNonce = 0;
static int64_t g_lastAttemptNonce = 0;
static String g_lastError;

int64_t readStoredNonce(const char *key) {
  Preferences prefs;
  if (!prefs.begin(kOtaNs, true)) {
    return 0;
  }
  const int64_t value = prefs.getLong(key, 0);
  prefs.end();
  return value;
}

void writeStoredNonce(const char *key, int64_t nonce) {
  Preferences prefs;
  if (!prefs.begin(kOtaNs, false)) {
    return;
  }
  prefs.putLong(key, nonce);
  prefs.end();
}

}  // namespace

String otaLastErrorText() {
  return g_lastError;
}

int64_t otaLastAttemptNonce() {
  return g_lastAttemptNonce;
}

bool otaShouldSkipNonce(int64_t nonce) {
  if (nonce <= 0) {
    return true;
  }
  return nonce == readStoredNonce(kLastNonceKey);
}

void otaPrefsMarkFailure(int64_t nonce) {
  (void)nonce;
}

bool otaTryHttpFlash(const String &url, int64_t nonce, String &detailOut) {
  detailOut = "";
  g_lastAttemptNonce = nonce;

  HTTPUpdate httpUpdate;
  httpUpdate.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  httpUpdate.rebootOnUpdate(true);

  g_pendingOtaNonce = nonce;
  httpUpdate.onEnd([]() {
    writeStoredNonce(kLastNonceKey, g_pendingOtaNonce);
    g_lastError = "";
  });

  t_httpUpdate_return ret;
  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(120000);
    ret = httpUpdate.update(client, url);
  } else if (url.startsWith("http://")) {
    WiFiClient client;
    client.setTimeout(120000);
    ret = httpUpdate.update(client, url);
  } else {
    detailOut = "unsupported URL scheme (use http:// or https://)";
    g_lastError = detailOut;
    return false;
  }

  if (ret == HTTP_UPDATE_OK) {
    return true;
  }

  detailOut = "HTTP_UPDATE ret=";
  detailOut += static_cast<int>(ret);
  detailOut += " ";
  detailOut += httpUpdate.getLastErrorString();
  g_lastError = detailOut;
  return false;
}
