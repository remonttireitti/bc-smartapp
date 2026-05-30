#include "wifi_config.h"

#include <Preferences.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <WiFi.h>
#include <string.h>
#include "cloud_sync.h"

namespace {

constexpr int PASSWORD_MAX = 63;
constexpr int SSID_MAX = 32;

enum class View { Main, Scan, Saved, Password, CloudKey, ConfirmDelete };

struct SavedNetwork {
  char ssid[SSID_MAX + 1];
  char pass[PASSWORD_MAX + 1];
};

Preferences prefs;
SavedNetwork saved[WIFI_MAX_SAVED];
int savedCount = 0;

View view = View::Main;
int listScroll = 0;
int selectedScan = -1;
int selectedSaved = -1;
int deleteTarget = -1;

enum class KeyboardMode { Letters, Numbers };

char passwordBuf[PASSWORD_MAX + 1] = "";
char pendingSsid[SSID_MAX + 1] = "";
KeyboardMode keyboardMode = KeyboardMode::Letters;
bool keyboardUpper = true;

String scanSsids[WIFI_SCAN_MAX];
int scanRssi[WIFI_SCAN_MAX];
wifi_auth_mode_t scanAuth[WIFI_SCAN_MAX];
int scanCount = 0;
bool scanInProgress = false;
unsigned long scanStartedMs = 0;

bool connecting = false;
char statusMsg[48] = "";

WebServer portalServer(80);
DNSServer portalDns;
bool apPortalActive = false;
String apPortalSsid;
unsigned long lastPortalScanMs = 0;
String portalScanSsids[WIFI_SCAN_MAX];
int portalScanRssi[WIFI_SCAN_MAX];
wifi_auth_mode_t portalScanAuth[WIFI_SCAN_MAX];
int portalScanCount = 0;

void startApPortal();
void stopApPortal();

Arduino_Canvas *canvas = nullptr;
int lastScreenW = 480;

uint16_t COLOR_BG = 0x0841;
uint16_t COLOR_PANEL = 0x1082;
uint16_t COLOR_TEXT = 0xFFFF;
uint16_t COLOR_ACCENT = 0x07FF;
uint16_t COLOR_WARN = 0xF800;
uint16_t COLOR_GRID = 0x4208;
uint16_t COLOR_OK = 0x07E0;
uint16_t COLOR_BTN = 0x2945;

void setStatus(const char *msg) {
  strncpy(statusMsg, msg, sizeof(statusMsg) - 1);
  statusMsg[sizeof(statusMsg) - 1] = '\0';
}

void loadSaved() {
  savedCount = 0;
  prefs.begin("wifi_cfg", true);
  int count = prefs.getInt("count", 0);
  if (count > WIFI_MAX_SAVED) count = WIFI_MAX_SAVED;
  for (int i = 0; i < count; i++) {
    char keyS[8];
    char keyP[8];
    snprintf(keyS, sizeof(keyS), "s%d", i);
    snprintf(keyP, sizeof(keyP), "p%d", i);
    String ssid = prefs.getString(keyS, "");
    String pass = prefs.getString(keyP, "");
    if (ssid.length() == 0) continue;
    strncpy(saved[savedCount].ssid, ssid.c_str(), SSID_MAX);
    saved[savedCount].ssid[SSID_MAX] = '\0';
    strncpy(saved[savedCount].pass, pass.c_str(), PASSWORD_MAX);
    saved[savedCount].pass[PASSWORD_MAX] = '\0';
    savedCount++;
  }
  prefs.end();
}

void persistSaved() {
  prefs.begin("wifi_cfg", false);
  prefs.putInt("count", savedCount);
  for (int i = 0; i < savedCount; i++) {
    char keyS[8];
    char keyP[8];
    snprintf(keyS, sizeof(keyS), "s%d", i);
    snprintf(keyP, sizeof(keyP), "p%d", i);
    prefs.putString(keyS, saved[i].ssid);
    prefs.putString(keyP, saved[i].pass);
  }
  for (int i = savedCount; i < WIFI_MAX_SAVED; i++) {
    char keyS[8];
    char keyP[8];
    snprintf(keyS, sizeof(keyS), "s%d", i);
    snprintf(keyP, sizeof(keyP), "p%d", i);
    prefs.remove(keyS);
    prefs.remove(keyP);
  }
  prefs.end();
}

int findSavedIndex(const char *ssid) {
  for (int i = 0; i < savedCount; i++) {
    if (strcmp(saved[i].ssid, ssid) == 0) return i;
  }
  return -1;
}

void upsertSaved(const char *ssid, const char *pass) {
  int idx = findSavedIndex(ssid);
  if (idx >= 0) {
    strncpy(saved[idx].pass, pass, PASSWORD_MAX);
    saved[idx].pass[PASSWORD_MAX] = '\0';
  } else {
    if (savedCount >= WIFI_MAX_SAVED) {
      for (int i = 1; i < WIFI_MAX_SAVED; i++) {
        saved[i - 1] = saved[i];
      }
      savedCount = WIFI_MAX_SAVED - 1;
    }
    idx = savedCount++;
    strncpy(saved[idx].ssid, ssid, SSID_MAX);
    saved[idx].ssid[SSID_MAX] = '\0';
    strncpy(saved[idx].pass, pass, PASSWORD_MAX);
    saved[idx].pass[PASSWORD_MAX] = '\0';
  }
  persistSaved();
}

bool removeSavedAt(int index) {
  if (index < 0 || index >= savedCount) return false;
  if (WiFi.status() == WL_CONNECTED && strcmp(saved[index].ssid, WiFi.SSID().c_str()) == 0) {
    WiFi.disconnect(true, true);
  }
  for (int i = index + 1; i < savedCount; i++) {
    saved[i - 1] = saved[i];
  }
  savedCount--;
  persistSaved();
  return true;
}

bool tryConnect(const char *ssid, const char *pass, uint32_t timeoutMs) {
  connecting = true;
  setStatus("Yhdistetaan...");
  if (apPortalActive) {
    WiFi.mode(WIFI_AP_STA);
  } else {
    WiFi.mode(WIFI_STA);
  }
  WiFi.disconnect(false, true);
  delay(100);
  WiFi.begin(ssid, pass);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(200);
  }
  connecting = false;
  if (WiFi.status() == WL_CONNECTED) {
    upsertSaved(ssid, pass);
    setStatus("Yhdistetty");
    if (apPortalActive) {
      stopApPortal();
    }
    return true;
  }
  setStatus("Yhteys epaonnistui");
  return false;
}

void startScan() {
  if (scanInProgress) return;
  WiFi.scanDelete();
  WiFi.mode(apPortalActive ? WIFI_AP_STA : WIFI_STA);
  scanInProgress = true;
  scanStartedMs = millis();
  scanCount = 0;
  listScroll = 0;
  setStatus("Haetaan verkkoja...");
  WiFi.scanNetworks(true, true);
}

void finishScanIfReady() {
  if (!scanInProgress) return;
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) {
    if (millis() - scanStartedMs > 15000) {
      WiFi.scanDelete();
      scanInProgress = false;
      setStatus("Haku aikakatkaistu");
    }
    return;
  }
  scanInProgress = false;
  scanCount = 0;
  if (n < 0) {
    setStatus("Haku epaonnistui");
    return;
  }
  for (int i = 0; i < n && scanCount < WIFI_SCAN_MAX; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    bool dup = false;
    for (int j = 0; j < scanCount; j++) {
      if (scanSsids[j] == ssid) {
        dup = true;
        if (WiFi.RSSI(i) > scanRssi[j]) {
          scanRssi[j] = WiFi.RSSI(i);
        }
        break;
      }
    }
    if (dup) continue;
    scanSsids[scanCount] = ssid;
    scanRssi[scanCount] = WiFi.RSSI(i);
    scanAuth[scanCount] = WiFi.encryptionType(i);
    scanCount++;
  }
  for (int i = 0; i < scanCount - 1; i++) {
    for (int j = i + 1; j < scanCount; j++) {
      if (scanRssi[j] > scanRssi[i]) {
        String ts = scanSsids[i];
        scanSsids[i] = scanSsids[j];
        scanSsids[j] = ts;
        int tr = scanRssi[i];
        scanRssi[i] = scanRssi[j];
        scanRssi[j] = tr;
        wifi_auth_mode_t ta = scanAuth[i];
        scanAuth[i] = scanAuth[j];
        scanAuth[j] = ta;
      }
    }
  }
  snprintf(statusMsg, sizeof(statusMsg), "Loytyi %d verkkoa", scanCount);
}

void buildApPortalSsid() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[20];
  snprintf(buf, sizeof(buf), "TempMon-%02X%02X", mac[4], mac[5]);
  apPortalSsid = buf;
}

void refreshPortalScan() {
  portalScanCount = 0;
  int n = WiFi.scanNetworks(false, true);
  if (n <= 0) return;
  for (int i = 0; i < n && portalScanCount < WIFI_SCAN_MAX; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    bool dup = false;
    for (int j = 0; j < portalScanCount; j++) {
      if (portalScanSsids[j] == ssid) {
        dup = true;
        if (WiFi.RSSI(i) > portalScanRssi[j]) {
          portalScanRssi[j] = WiFi.RSSI(i);
        }
        break;
      }
    }
    if (dup) continue;
    portalScanSsids[portalScanCount] = ssid;
    portalScanRssi[portalScanCount] = WiFi.RSSI(i);
    portalScanAuth[portalScanCount] = WiFi.encryptionType(i);
    portalScanCount++;
  }
  for (int i = 0; i < portalScanCount - 1; i++) {
    for (int j = i + 1; j < portalScanCount; j++) {
      if (portalScanRssi[j] > portalScanRssi[i]) {
        String ts = portalScanSsids[i];
        portalScanSsids[i] = portalScanSsids[j];
        portalScanSsids[j] = ts;
        int tr = portalScanRssi[i];
        portalScanRssi[i] = portalScanRssi[j];
        portalScanRssi[j] = tr;
        wifi_auth_mode_t ta = portalScanAuth[i];
        portalScanAuth[i] = portalScanAuth[j];
        portalScanAuth[j] = ta;
      }
    }
  }
  lastPortalScanMs = millis();
}

String portalHtmlPage(bool success, bool failed) {
  String html =
      "<!doctype html><html lang='fi'><head><meta charset='utf-8'>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>TempMonitor WiFi</title>"
      "<style>"
      "body{font-family:system-ui,sans-serif;margin:0;padding:1rem;background:#f1f5f9;color:#0f172a}"
      ".card{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:1rem;margin-bottom:1rem}"
      "h1{font-size:1.25rem;margin:0 0 .5rem}label{display:block;margin:.75rem 0 .25rem;font-weight:600}"
      "input,select{width:100%;padding:.75rem;border:1px solid #94a3b8;border-radius:8px;font-size:16px;box-sizing:border-box}"
      "button{width:100%;padding:.85rem;border:0;border-radius:8px;background:#14b8a6;color:#fff;font-size:1rem;font-weight:700;margin-top:1rem}"
      ".ok{background:#dcfce7;color:#166534;padding:.75rem;border-radius:8px;margin-bottom:1rem}"
      ".err{background:#fee2e2;color:#991b1b;padding:.75rem;border-radius:8px;margin-bottom:1rem}"
      ".muted{color:#64748b;font-size:.9rem;line-height:1.45}"
      "a{color:#2563eb}"
      "</style></head><body>";

  html += "<div class='card'><h1>TempMonitor WiFi-asennus</h1>";
  html += "<p class='muted'>Yhdistä laite asiakkaan verkkoon puhelimella tai tabletilla.</p>";
  html += "<p class='muted'><strong>AP:</strong> ";
  html += apPortalSsid;
  html += "<br><strong>Osoite:</strong> <a href='http://";
  html += WiFi.softAPIP().toString();
  html += "/'>";
  html += WiFi.softAPIP().toString();
  html += "</a></p></div>";

  if (success) {
    html += "<div class='ok'>WiFi tallennettu. Laite yhdistää verkkoon — voit sulkea tämän sivun.</div>";
  }
  if (failed) {
    html += "<div class='err'>Yhteys epäonnistui. Tarkista salasana ja yritä uudelleen.</div>";
  }

  html += "<form method='POST' action='/save' class='card'>";
  html += "<label for='ssid'>Verkko</label><select id='ssid' name='ssid' required>";
  html += "<option value=''>— Valitse verkko —</option>";
  for (int i = 0; i < portalScanCount; i++) {
    html += "<option value='";
    html += portalScanSsids[i];
    html += "'>";
    html += portalScanSsids[i];
    html += portalScanAuth[i] == WIFI_AUTH_OPEN ? " (avoin)" : " *";
    html += " (";
    html += String(portalScanRssi[i]);
    html += " dBm)</option>";
  }
  html += "</select>";
  html += "<label for='pass'>Salasana</label>";
  html += "<input id='pass' name='pass' type='password' autocomplete='off' placeholder='WiFi-salasana'>";
  html += "<label for='key'>Pilviavain (12 numeroa)</label>";
  html += "<input id='key' name='key' inputmode='numeric' pattern='[0-9]*' maxlength='12' placeholder='Web-sovelluksen laiteavain'>";
  html += "<button type='submit'>Tallenna ja yhdistä</button>";
  html += "</form>";
  html += "<p class='muted'><a href='/'>Päivitä verkkolista</a></p>";
  html += "</body></html>";
  return html;
}

void handlePortalRoot() {
  if (millis() - lastPortalScanMs > 15000) {
    refreshPortalScan();
  }
  portalServer.send(200, "text/html", portalHtmlPage(false, false));
}

void handlePortalSave() {
  String ssid = portalServer.arg("ssid");
  String pass = portalServer.arg("pass");
  String key = portalServer.arg("key");
  key.trim();
  if (key.length() > 0) {
    cloudSyncSetDeviceKey(key.c_str());
  }
  if (ssid.length() == 0) {
    portalServer.send(400, "text/plain", "Valitse verkko");
    return;
  }
  bool ok = tryConnect(ssid.c_str(), pass.c_str(), 20000);
  if (ok) {
    portalServer.send(200, "text/html", portalHtmlPage(true, false));
    return;
  }
  if (millis() - lastPortalScanMs > 15000) {
    refreshPortalScan();
  }
  portalServer.send(200, "text/html", portalHtmlPage(false, true));
}

void startApPortal() {
  if (apPortalActive) return;
  buildApPortalSsid();
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apPortalSsid.c_str(), nullptr, 1, 0, 4);
  delay(150);
  portalDns.start(53, "*", WiFi.softAPIP());
  portalServer.on("/", HTTP_GET, handlePortalRoot);
  portalServer.on("/save", HTTP_POST, handlePortalSave);
  portalServer.onNotFound([]() {
    portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/");
    portalServer.send(302, "text/plain", "");
  });
  portalServer.begin();
  refreshPortalScan();
  apPortalActive = true;
  snprintf(statusMsg, sizeof(statusMsg), "AP %s", apPortalSsid.c_str());
}

void stopApPortal() {
  if (!apPortalActive) return;
  portalServer.stop();
  portalDns.stop();
  WiFi.softAPdisconnect(true);
  if (WiFi.status() == WL_CONNECTED) {
    WiFi.mode(WIFI_STA);
  } else {
    WiFi.mode(WIFI_STA);
  }
  apPortalActive = false;
  setStatus("AP suljettu");
}

bool hitRect(int x, int y, int rx, int ry, int rw, int rh) {
  return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
}

void drawButton(int x, int y, int w, int h, const char *label, uint16_t fill) {
  canvas->fillRoundRect(x, y, w, h, 6, fill);
  canvas->drawRoundRect(x, y, w, h, 6, COLOR_GRID);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(1);
  int16_t x1, y1;
  uint16_t tw, th;
  canvas->getTextBounds(label, 0, 0, &x1, &y1, &tw, &th);
  canvas->setCursor(x + (w - tw) / 2, y + (h - th) / 2);
  canvas->print(label);
}

void drawKeyButton(int x, int y, int w, int h, const char *label, uint16_t fill, uint8_t textSize = 2) {
  canvas->fillRoundRect(x, y, w, h, 8, fill);
  canvas->drawRoundRect(x, y, w, h, 8, COLOR_GRID);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(textSize);
  int16_t x1, y1;
  uint16_t tw, th;
  canvas->getTextBounds(label, 0, 0, &x1, &y1, &tw, &th);
  canvas->setCursor(x + (w - tw) / 2, y + (h - th) / 2);
  canvas->print(label);
}

void drawListRow(int x, int y, int w, int h, const char *ssid, int rssi, bool secured, bool showDelete) {
  canvas->fillRoundRect(x, y, w, h, 4, COLOR_BTN);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(1);
  canvas->setCursor(x + 8, y + 8);
  char line[40];
  snprintf(line, sizeof(line), "%s%s", ssid, secured ? " *" : "");
  canvas->print(line);
  canvas->setCursor(x + w - 56, y + 8);
  canvas->printf("%ddBm", rssi);
  if (showDelete) {
    drawButton(x + w - 44, y + 4, 36, h - 8, "X", COLOR_WARN);
  }
}

void drawMain(int w, int h) {
  bool connected = WiFi.status() == WL_CONNECTED;
  canvas->fillRoundRect(10, 44, w - 20, 52, 6, COLOR_PANEL);
  canvas->setTextSize(1);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setCursor(18, 54);
  canvas->print("Tila:");
  canvas->setTextColor(connected ? COLOR_OK : COLOR_WARN);
  canvas->setCursor(58, 54);
  canvas->print(connected ? "Yhdistetty" : "Ei yhteytta");
  canvas->setTextColor(COLOR_TEXT);
  canvas->setCursor(18, 72);
  canvas->print("SSID:");
  canvas->setCursor(58, 72);
  canvas->print(connected ? WiFi.SSID().c_str() : "-");
  canvas->setCursor(240, 72);
  canvas->print("IP:");
  canvas->setCursor(262, 72);
  if (apPortalActive) {
    canvas->print(WiFi.softAPIP().toString().c_str());
  } else {
    canvas->print(connected ? WiFi.localIP().toString().c_str() : "-");
  }

  if (apPortalActive) {
    canvas->setTextColor(COLOR_ACCENT);
    canvas->setCursor(18, 90);
    canvas->print("Asennus AP:");
    canvas->setTextColor(COLOR_TEXT);
    canvas->setCursor(110, 90);
    canvas->print(apPortalSsid.c_str());
  }

  drawButton(10, 104, (w - 30) / 2, 32, "Hae verkot", COLOR_ACCENT);
  drawButton(20 + (w - 30) / 2, 104, (w - 30) / 2, 32, "Tallennetut", COLOR_BTN);
  drawButton(10, 142, (w - 30) / 2, 28, apPortalActive ? "Sulje AP" : "Asennus AP",
             apPortalActive ? COLOR_WARN : COLOR_ACCENT);
  drawButton(20 + (w - 30) / 2, 142, (w - 30) / 2, 28, "Pilviavain", COLOR_BTN);

  canvas->setTextColor(COLOR_GRID);
  canvas->setCursor(10, 178);
  canvas->print(statusMsg);

  if (connecting) {
    canvas->setTextColor(COLOR_ACCENT);
    canvas->setCursor(10, 168);
    canvas->print("Odota...");
  }
}

void drawScanList(int w, int h) {
  drawButton(10, 44, 70, 28, "< Takaisin", COLOR_BTN);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(1);
  canvas->setCursor(90, 52);
  canvas->print("Verkkohaku");
  drawButton(w - 80, 44, 70, 28, "Paivita", COLOR_ACCENT);

  int rowH = 34;
  int listY = 80;
  int visible = min(WIFI_LIST_VISIBLE, max(0, scanCount - listScroll));
  for (int i = 0; i < visible; i++) {
    int idx = listScroll + i;
    bool secured = scanAuth[idx] != WIFI_AUTH_OPEN;
    drawListRow(10, listY + i * (rowH + 4), w - 20, rowH, scanSsids[idx].c_str(), scanRssi[idx], secured, false);
  }
  if (scanCount == 0 && !scanInProgress) {
    canvas->setTextColor(COLOR_GRID);
    canvas->setCursor(20, listY + 20);
    canvas->print("Ei verkkoja. Paina Paivita.");
  }
  if (listScroll > 0) {
    drawButton(w - 36, listY, 26, 26, "^", COLOR_BTN);
  }
  if (listScroll + WIFI_LIST_VISIBLE < scanCount) {
    drawButton(w - 36, listY + (WIFI_LIST_VISIBLE - 1) * (rowH + 4), 26, 26, "v", COLOR_BTN);
  }
}

void drawSavedList(int w, int h) {
  drawButton(10, 44, 70, 28, "< Takaisin", COLOR_BTN);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(1);
  canvas->setCursor(90, 52);
  canvas->print("Tallennetut verkot");

  int rowH = 34;
  int listY = 80;
  int visible = min(WIFI_LIST_VISIBLE, max(0, savedCount - listScroll));
  for (int i = 0; i < visible; i++) {
    int idx = listScroll + i;
    drawListRow(10, listY + i * (rowH + 4), w - 20, rowH, saved[idx].ssid, 0, true, true);
  }
  if (savedCount == 0) {
    canvas->setTextColor(COLOR_GRID);
    canvas->setCursor(20, listY + 20);
    canvas->print("Ei tallennettuja verkkoja.");
  }
  if (listScroll > 0) {
    drawButton(w - 36, listY, 26, 26, "^", COLOR_BTN);
  }
  if (listScroll + WIFI_LIST_VISIBLE < savedCount) {
    drawButton(w - 36, listY + (WIFI_LIST_VISIBLE - 1) * (rowH + 4), 26, 26, "v", COLOR_BTN);
  }
}

void drawLettersKeyboard(int w);
void drawNumbersKeyboard(int w);

void drawPasswordView(int w, int h) {
  (void)h;
  drawButton(10, 44, 70, 28, "< Takaisin", COLOR_BTN);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(1);
  canvas->setCursor(90, 52);
  canvas->print(view == View::CloudKey ? "Pilviavain" : pendingSsid);

  canvas->fillRoundRect(10, 72, w - 20, 28, 6, COLOR_PANEL);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(view == View::CloudKey ? 1 : 2);
  canvas->setCursor(18, 80);
  if (view == View::CloudKey) {
    canvas->print(passwordBuf);
  } else {
    for (size_t i = 0; i < strlen(passwordBuf); i++) canvas->print("*");
  }

  if (keyboardMode == KeyboardMode::Numbers) {
    drawNumbersKeyboard(w);
  } else {
    drawLettersKeyboard(w);
  }
}

void drawConfirmDelete(int w, int h) {
  canvas->fillRoundRect(40, 100, w - 80, 100, 8, COLOR_PANEL);
  canvas->setTextColor(COLOR_TEXT);
  canvas->setTextSize(1);
  canvas->setCursor(52, 118);
  canvas->print("Poista tallennettu verkko?");
  canvas->setCursor(52, 136);
  if (deleteTarget >= 0 && deleteTarget < savedCount) {
    canvas->print(saved[deleteTarget].ssid);
  }
  drawButton(60, 160, 100, 32, "Kylla", COLOR_WARN);
  drawButton(w - 160, 160, 100, 32, "Ei", COLOR_BTN);
}

void appendPasswordChar(char c) {
  size_t len = strlen(passwordBuf);
  if (len >= PASSWORD_MAX) return;
  passwordBuf[len] = c;
  passwordBuf[len + 1] = '\0';
}

void drawLettersKeyboard(int w) {
  const int kw = 43;
  const int kh = 42;
  const int gap = 4;
  const int y0 = 106;
  const char *row1 = keyboardUpper ? "QWERTYUIOP" : "qwertyuiop";
  const char *row2 = keyboardUpper ? "ASDFGHJKL" : "asdfghjkl";
  const char *row3 = keyboardUpper ? "ZXCVBNM" : "zxcvbnm";

  int row1W = 10 * kw + 9 * gap;
  int row1X = (w - row1W) / 2;
  for (int i = 0; row1[i]; i++) {
    char lbl[2] = {row1[i], 0};
    drawKeyButton(row1X + i * (kw + gap), y0, kw, kh, lbl, COLOR_BTN);
  }

  int row2W = 9 * kw + 8 * gap;
  int row2X = (w - row2W) / 2;
  for (int i = 0; row2[i]; i++) {
    char lbl[2] = {row2[i], 0};
    drawKeyButton(row2X + i * (kw + gap), y0 + kh + gap, kw, kh, lbl, COLOR_BTN);
  }

  int row3Y = y0 + 2 * (kh + gap);
  drawKeyButton(8, row3Y, 54, kh, "123", COLOR_ACCENT, 1);
  drawKeyButton(66, row3Y, 54, kh, keyboardUpper ? "aa" : "AA", COLOR_ACCENT, 1);
  int lettersX = 126;
  for (int i = 0; row3[i]; i++) {
    char lbl[2] = {row3[i], 0};
    drawKeyButton(lettersX + i * (kw + gap), row3Y, kw, kh, lbl, COLOR_BTN);
  }

  int row4Y = row3Y + kh + gap;
  drawKeyButton(10, row4Y, 90, 36, "Del", COLOR_WARN, 1);
  drawKeyButton(110, row4Y, (w - 130) / 2, 36, "Peru", COLOR_BTN, 1);
  drawKeyButton(120 + (w - 130) / 2, row4Y, (w - 130) / 2, 36, "OK", COLOR_OK, 1);
}

void drawNumbersKeyboard(int w) {
  const int gap = 8;
  const int cols = 3;
  const int kw = (w - 20 - gap * (cols - 1)) / cols;
  const int kh = 50;
  const int y0 = 106;
  const char *digits = "123456789";

  for (int i = 0; i < 9; i++) {
    int row = i / 3;
    int col = i % 3;
    char lbl[2] = {digits[i], 0};
    int x = 10 + col * (kw + gap);
    int y = y0 + row * (kh + gap);
    drawKeyButton(x, y, kw, kh, lbl, COLOR_BTN);
  }

  int row4Y = y0 + 3 * (kh + gap);
  drawKeyButton(10, row4Y, kw, kh, "ABC", COLOR_ACCENT, 1);
  drawKeyButton(10 + kw + gap, row4Y, kw, kh, "0", COLOR_BTN);
  drawKeyButton(10 + 2 * (kw + gap), row4Y, kw, kh, "Del", COLOR_WARN, 1);

  const char *symbols = "._-@+#";
  int symW = (w - 20 - 5 * gap) / 6;
  int symY = row4Y + kh + gap;
  for (int i = 0; symbols[i]; i++) {
    char lbl[2] = {symbols[i], 0};
    drawKeyButton(10 + i * (symW + gap), symY, symW, 36, lbl, COLOR_BTN, 2);
  }

  int row6Y = symY + 36 + gap;
  drawKeyButton(10, row6Y, (w - 30) / 2, 36, "Peru", COLOR_BTN, 1);
  drawKeyButton(20 + (w - 30) / 2, row6Y, (w - 30) / 2, 36, "OK", COLOR_OK, 1);
}

bool hitLettersKeyboard(int x, int y, int w) {
  const int kw = 43;
  const int kh = 42;
  const int gap = 4;
  const int y0 = 106;
  const char *row1 = keyboardUpper ? "QWERTYUIOP" : "qwertyuiop";
  const char *row2 = keyboardUpper ? "ASDFGHJKL" : "asdfghjkl";
  const char *row3 = keyboardUpper ? "ZXCVBNM" : "zxcvbnm";

  int row1W = 10 * kw + 9 * gap;
  int row1X = (w - row1W) / 2;
  for (int i = 0; row1[i]; i++) {
    if (hitRect(x, y, row1X + i * (kw + gap), y0, kw, kh)) {
      appendPasswordChar(row1[i]);
      return true;
    }
  }
  int row2W = 9 * kw + 8 * gap;
  int row2X = (w - row2W) / 2;
  for (int i = 0; row2[i]; i++) {
    if (hitRect(x, y, row2X + i * (kw + gap), y0 + kh + gap, kw, kh)) {
      appendPasswordChar(row2[i]);
      return true;
    }
  }
  int row3Y = y0 + 2 * (kh + gap);
  if (hitRect(x, y, 8, row3Y, 54, kh)) {
    keyboardMode = KeyboardMode::Numbers;
    return true;
  }
  if (hitRect(x, y, 66, row3Y, 54, kh)) {
    keyboardUpper = !keyboardUpper;
    return true;
  }
  int lettersX = 126;
  for (int i = 0; row3[i]; i++) {
    if (hitRect(x, y, lettersX + i * (kw + gap), row3Y, kw, kh)) {
      appendPasswordChar(row3[i]);
      return true;
    }
  }
  int row4Y = row3Y + kh + gap;
  if (hitRect(x, y, 10, row4Y, 90, 36)) {
    size_t len = strlen(passwordBuf);
    if (len > 0) passwordBuf[len - 1] = '\0';
    return true;
  }
  if (hitRect(x, y, 110, row4Y, (w - 130) / 2, 36)) {
    passwordBuf[0] = '\0';
    view = view == View::CloudKey ? View::Main : View::Scan;
    return true;
  }
  if (hitRect(x, y, 120 + (w - 130) / 2, row4Y, (w - 130) / 2, 36)) {
    if (view == View::CloudKey) {
      cloudSyncSetDeviceKey(passwordBuf);
      passwordBuf[0] = '\0';
      view = View::Main;
      setStatus("Pilviavain tallennettu");
    } else {
      tryConnect(pendingSsid, passwordBuf, 15000);
      passwordBuf[0] = '\0';
      view = View::Main;
    }
    return true;
  }
  return false;
}

bool hitNumbersKeyboard(int x, int y, int w) {
  const int gap = 8;
  const int cols = 3;
  const int kw = (w - 20 - gap * (cols - 1)) / cols;
  const int kh = 50;
  const int y0 = 106;
  const char *digits = "123456789";

  for (int i = 0; i < 9; i++) {
    int row = i / 3;
    int col = i % 3;
    int bx = 10 + col * (kw + gap);
    int by = y0 + row * (kh + gap);
    if (hitRect(x, y, bx, by, kw, kh)) {
      appendPasswordChar(digits[i]);
      return true;
    }
  }

  int row4Y = y0 + 3 * (kh + gap);
  if (hitRect(x, y, 10, row4Y, kw, kh)) {
    keyboardMode = KeyboardMode::Letters;
    return true;
  }
  if (hitRect(x, y, 10 + kw + gap, row4Y, kw, kh)) {
    appendPasswordChar('0');
    return true;
  }
  if (hitRect(x, y, 10 + 2 * (kw + gap), row4Y, kw, kh)) {
    size_t len = strlen(passwordBuf);
    if (len > 0) passwordBuf[len - 1] = '\0';
    return true;
  }

  const char *symbols = "._-@+#";
  int symW = (w - 20 - 5 * gap) / 6;
  int symY = row4Y + kh + gap;
  for (int i = 0; symbols[i]; i++) {
    if (hitRect(x, y, 10 + i * (symW + gap), symY, symW, 36)) {
      appendPasswordChar(symbols[i]);
      return true;
    }
  }

  int row6Y = symY + 36 + gap;
  if (hitRect(x, y, 10, row6Y, (w - 30) / 2, 36)) {
    passwordBuf[0] = '\0';
    view = view == View::CloudKey ? View::Main : View::Scan;
    return true;
  }
  if (hitRect(x, y, 20 + (w - 30) / 2, row6Y, (w - 30) / 2, 36)) {
    if (view == View::CloudKey) {
      cloudSyncSetDeviceKey(passwordBuf);
      passwordBuf[0] = '\0';
      view = View::Main;
      setStatus("Pilviavain tallennettu");
    } else {
      tryConnect(pendingSsid, passwordBuf, 15000);
      passwordBuf[0] = '\0';
      view = View::Main;
    }
    return true;
  }
  return false;
}

bool handlePasswordTap(int x, int y, int w) {
  if (hitRect(x, y, 10, 44, 70, 28)) {
    if (view == View::CloudKey) {
      passwordBuf[0] = '\0';
      view = View::Main;
    } else {
      view = View::Scan;
    }
    return true;
  }
  if (keyboardMode == KeyboardMode::Numbers) {
    return hitNumbersKeyboard(x, y, w);
  }
  return hitLettersKeyboard(x, y, w);
}

bool handleScanTap(int x, int y, int w, int h) {
  if (hitRect(x, y, 10, 44, 70, 28)) {
    view = View::Main;
    return true;
  }
  if (hitRect(x, y, w - 80, 44, 70, 28)) {
    startScan();
    return true;
  }
  int rowH = 34;
  int listY = 80;
  if (hitRect(x, y, w - 36, listY, 26, 26) && listScroll > 0) {
    listScroll--;
    return true;
  }
  if (hitRect(x, y, w - 36, listY + (WIFI_LIST_VISIBLE - 1) * (rowH + 4), 26, 26) &&
      listScroll + WIFI_LIST_VISIBLE < scanCount) {
    listScroll++;
    return true;
  }
  int visible = min(WIFI_LIST_VISIBLE, max(0, scanCount - listScroll));
  for (int i = 0; i < visible; i++) {
    int idx = listScroll + i;
    if (hitRect(x, y, 10, listY + i * (rowH + 4), w - 56, rowH)) {
      selectedScan = idx;
      strncpy(pendingSsid, scanSsids[idx].c_str(), SSID_MAX);
      pendingSsid[SSID_MAX] = '\0';
      passwordBuf[0] = '\0';
      keyboardMode = KeyboardMode::Letters;
      keyboardUpper = true;
      int savedIdx = findSavedIndex(pendingSsid);
      if (savedIdx >= 0) {
        tryConnect(saved[savedIdx].ssid, saved[savedIdx].pass, 15000);
        view = View::Main;
      } else if (scanAuth[idx] == WIFI_AUTH_OPEN) {
        tryConnect(pendingSsid, "", 12000);
        view = View::Main;
      } else {
        view = View::Password;
      }
      return true;
    }
  }
  return false;
}

bool handleSavedTap(int x, int y, int w, int h) {
  if (hitRect(x, y, 10, 44, 70, 28)) {
    view = View::Main;
    return true;
  }
  int rowH = 34;
  int listY = 80;
  if (hitRect(x, y, w - 36, listY, 26, 26) && listScroll > 0) {
    listScroll--;
    return true;
  }
  if (hitRect(x, y, w - 36, listY + (WIFI_LIST_VISIBLE - 1) * (rowH + 4), 26, 26) &&
      listScroll + WIFI_LIST_VISIBLE < savedCount) {
    listScroll++;
    return true;
  }
  int visible = min(WIFI_LIST_VISIBLE, max(0, savedCount - listScroll));
  for (int i = 0; i < visible; i++) {
    int idx = listScroll + i;
    int rowY = listY + i * (rowH + 4);
    if (hitRect(x, y, w - 54, rowY + 4, 36, rowH - 8)) {
      deleteTarget = idx;
      view = View::ConfirmDelete;
      return true;
    }
    if (hitRect(x, y, 10, rowY, w - 56, rowH)) {
      tryConnect(saved[idx].ssid, saved[idx].pass, 15000);
      view = View::Main;
      return true;
    }
  }
  return false;
}

bool handleConfirmTap(int x, int y, int w) {
  if (hitRect(x, y, 60, 160, 100, 32)) {
    removeSavedAt(deleteTarget);
    deleteTarget = -1;
    if (listScroll > 0 && listScroll >= savedCount) listScroll--;
    view = View::Saved;
    setStatus("Verkko poistettu");
    return true;
  }
  if (hitRect(x, y, w - 160, 160, 100, 32)) {
    deleteTarget = -1;
    view = View::Saved;
    return true;
  }
  return false;
}

bool handleMainTap(int x, int y, int w) {
  if (hitRect(x, y, 10, 104, (w - 30) / 2, 32)) {
    view = View::Scan;
    listScroll = 0;
    if (scanCount == 0 && !scanInProgress) startScan();
    return true;
  }
  if (hitRect(x, y, 20 + (w - 30) / 2, 104, (w - 30) / 2, 32)) {
    view = View::Saved;
    listScroll = 0;
    return true;
  }
  if (hitRect(x, y, 10, 142, (w - 30) / 2, 28)) {
    if (apPortalActive) {
      stopApPortal();
    } else {
      startApPortal();
    }
    return true;
  }
  if (hitRect(x, y, 20 + (w - 30) / 2, 142, (w - 30) / 2, 28)) {
    passwordBuf[0] = '\0';
    strncpy(passwordBuf, cloudSyncDeviceKey(), PASSWORD_MAX);
    passwordBuf[PASSWORD_MAX] = '\0';
    keyboardMode = KeyboardMode::Numbers;
    keyboardUpper = true;
    view = View::CloudKey;
    return true;
  }
  return false;
}

void connectSavedOnBoot() {
  if (savedCount == 0) {
    setStatus("Ei tallennettuja verkkoja");
    startApPortal();
    return;
  }
  for (int i = 0; i < savedCount; i++) {
    if (tryConnect(saved[i].ssid, saved[i].pass, 8000)) {
      return;
    }
  }
  setStatus("Automaattinen yhteys epaonnistui");
  startApPortal();
}

}  // namespace

void wifiConfigBegin() {
  canvas = nullptr;
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  loadSaved();
  connectSavedOnBoot();
}

void wifiConfigLoop() {
  finishScanIfReady();
  if (apPortalActive) {
    portalDns.processNextRequest();
    portalServer.handleClient();
  }
}

void wifiConfigDraw(Arduino_Canvas *gfx, int screenW, int screenH) {
  canvas = gfx;
  lastScreenW = screenW;
  gfx->fillScreen(COLOR_BG);
  gfx->fillRect(0, 0, screenW, 36, COLOR_PANEL);
  gfx->setTextColor(COLOR_TEXT);
  gfx->setTextSize(2);
  gfx->setCursor(12, 8);
  gfx->print("WiFi");

  bool connected = WiFi.status() == WL_CONNECTED;
  gfx->fillCircle(screenW - 16, 14, 5, connected ? COLOR_OK : COLOR_WARN);

  switch (view) {
    case View::Main:
      drawMain(screenW, screenH);
      break;
    case View::Scan:
      drawScanList(screenW, screenH);
      break;
    case View::Saved:
      drawSavedList(screenW, screenH);
      break;
    case View::Password:
    case View::CloudKey:
      drawPasswordView(screenW, screenH);
      break;
    case View::ConfirmDelete:
      drawMain(screenW, screenH);
      drawConfirmDelete(screenW, screenH);
      break;
  }
}

bool wifiConfigHandleTap(int x, int y) {
  const int w = lastScreenW;
  const int h = 320;
  switch (view) {
    case View::Main:
      return handleMainTap(x, y, w);
    case View::Scan:
      return handleScanTap(x, y, w, h);
    case View::Saved:
      return handleSavedTap(x, y, w, h);
    case View::Password:
    case View::CloudKey:
      return handlePasswordTap(x, y, w);
    case View::ConfirmDelete:
      return handleConfirmTap(x, y, w);
  }
  return false;
}

bool wifiConfigOnSubScreen() {
  return view != View::Main;
}

void wifiConfigGoBack() {
  if (view == View::Password) {
    view = View::Scan;
    passwordBuf[0] = '\0';
  } else if (view == View::CloudKey) {
    view = View::Main;
    passwordBuf[0] = '\0';
  } else if (view == View::ConfirmDelete) {
    deleteTarget = -1;
    view = View::Saved;
  } else if (view != View::Main) {
    view = View::Main;
  }
}

bool wifiConfigIsConnected() {
  return WiFi.status() == WL_CONNECTED;
}

bool wifiConfigSetupApActive() {
  return apPortalActive;
}

void wifiConfigStartSetupAp() {
  startApPortal();
}

void wifiConfigStopSetupAp() {
  stopApPortal();
}

int wifiConfigSavedCount() {
  return savedCount;
}
