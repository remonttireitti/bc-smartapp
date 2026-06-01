#include "history.h"

#include <SD_MMC.h>
#include <FS.h>
#include <cstring>

namespace {

constexpr char LOG_MAGIC[] = "TMPL";
constexpr uint16_t LOG_VERSION = 1;
constexpr size_t LOG_RECORD_SIZE = 6;
constexpr char LOG_PATH[] = "/sdcard/temp/log.bin";

constexpr int SD_MMC_CLK = 12;
constexpr int SD_MMC_CMD = 11;
constexpr int SD_MMC_D0 = 13;

#pragma pack(push, 1)
struct LogHeader {
  char magic[4];
  uint16_t version;
  uint16_t recordSize;
  uint32_t maxRecords;
  uint32_t writeIndex;
  uint64_t totalWritten;
};

struct LogRecord {
  uint32_t tsSec;
  int16_t tempCenti;
};
#pragma pack(pop)

TrendStore gTrend;
SdLogger gSd;

int16_t encodeTemp(float tempC) {
  return (int16_t)lroundf(tempC * 100.0f);
}

float decodeTemp(int16_t encoded) {
  return encoded / 100.0f;
}

bool initSdCard() {
  SD_MMC.setPins(SD_MMC_CLK, SD_MMC_CMD, SD_MMC_D0);
  if (!SD_MMC.begin("/sdcard", true)) {
    Serial.println("SD card not mounted");
    return false;
  }
  Serial.printf("SD card: %llu MB\n", SD_MMC.cardSize() / (1024ULL * 1024ULL));
  return true;
}

}  // namespace

bool TrendStore::begin() {
  bootSec = millis() / 1000;
  samples = (int16_t *)ps_malloc(TREND_CAPACITY * sizeof(int16_t));
  if (!samples) {
    Serial.println("Trend PSRAM alloc failed");
    return false;
  }
  Serial.printf("Trend buffer: %lu samples (~%lu days)\n",
                (unsigned long)TREND_CAPACITY, (unsigned long)TREND_DAYS);
  return true;
}

void TrendStore::addSample(float tempC, uint32_t nowMs) {
  if (!samples) return;
  samples[head] = encodeTemp(tempC);
  head = (head + 1) % TREND_CAPACITY;
  if (count < TREND_CAPACITY) {
    count++;
  }
}

uint32_t TrendStore::spanSeconds() const {
  if (count < 2) return 0;
  return (count - 1) * (SAMPLE_INTERVAL_MS / 1000);
}

uint32_t TrendStore::sampleCount() const {
  return count;
}

bool TrendStore::valueAtOffset(uint32_t offsetFromOldest, float &outTemp, uint32_t &outAgeSec) const {
  if (!samples || offsetFromOldest >= count) return false;
  uint32_t idx;
  if (count < TREND_CAPACITY) {
    idx = offsetFromOldest;
  } else {
    idx = (head + offsetFromOldest) % TREND_CAPACITY;
  }
  int16_t v = samples[idx];
  if (v == TEMP_INVALID) return false;
  outTemp = decodeTemp(v);
  outAgeSec = (count - 1 - offsetFromOldest) * (SAMPLE_INTERVAL_MS / 1000);
  return true;
}

bool SdLogger::begin() {
  ready = false;
  if (!initSdCard()) return false;

  if (!SD_MMC.exists("/sdcard/temp")) {
    SD_MMC.mkdir("/sdcard/temp");
  }

  LogHeader hdr{};
  bool newFile = false;
  File f = SD_MMC.open(LOG_PATH, FILE_READ);
  if (!f || f.size() < (int)sizeof(LogHeader)) {
    newFile = true;
  } else {
    f.read((uint8_t *)&hdr, sizeof(hdr));
    f.close();
    if (memcmp(hdr.magic, LOG_MAGIC, 4) != 0 || hdr.recordSize != LOG_RECORD_SIZE) {
      newFile = true;
    }
  }

  uint64_t cardBytes = SD_MMC.cardSize();
  uint64_t usable = (uint64_t)(cardBytes * 9 / 10);
  maxRecords = (uint32_t)((usable - sizeof(LogHeader)) / LOG_RECORD_SIZE);
  if (maxRecords < 1000) {
    Serial.println("SD card too small for log");
    return false;
  }

  if (newFile) {
    memset(&hdr, 0, sizeof(hdr));
    memcpy(hdr.magic, LOG_MAGIC, 4);
    hdr.version = LOG_VERSION;
    hdr.recordSize = LOG_RECORD_SIZE;
    hdr.maxRecords = maxRecords;
    hdr.writeIndex = 0;
    hdr.totalWritten = 0;

    f = SD_MMC.open(LOG_PATH, FILE_WRITE);
    if (!f) {
      Serial.println("SD log create failed");
      return false;
    }
    f.write((uint8_t *)&hdr, sizeof(hdr));
    f.close();
    writeIndex = 0;
    totalWritten = 0;
  } else {
    maxRecords = hdr.maxRecords;
    writeIndex = hdr.writeIndex % maxRecords;
    totalWritten = hdr.totalWritten;
  }

  ready = true;
  Serial.printf("SD log: %lu records capacity, index %lu\n",
                (unsigned long)maxRecords, (unsigned long)writeIndex);
  return true;
}

void SdLogger::append(float tempC, uint32_t nowMs) {
  if (!ready || maxRecords == 0) return;

  LogRecord rec{};
  rec.tsSec = nowMs / 1000;
  rec.tempCenti = encodeTemp(tempC);

  File f = SD_MMC.open(LOG_PATH, "r+");
  if (!f) return;

  uint32_t offset = sizeof(LogHeader) + (uint64_t)writeIndex * LOG_RECORD_SIZE;
  f.seek(offset);
  f.write((uint8_t *)&rec, sizeof(rec));

  writeIndex = (writeIndex + 1) % maxRecords;
  totalWritten++;

  LogHeader hdr{};
  f.seek(0);
  f.read((uint8_t *)&hdr, sizeof(hdr));
  hdr.writeIndex = writeIndex;
  hdr.totalWritten = totalWritten;
  hdr.maxRecords = maxRecords;
  f.seek(0);
  f.write((uint8_t *)&hdr, sizeof(hdr));
  f.close();
}

bool historyBegin() {
  bool ok = gTrend.begin();
  gSd.begin();
  return ok;
}

void historyAddSample(float tempC) {
  uint32_t nowMs = millis();
  gTrend.addSample(tempC, nowMs);
  gSd.append(tempC, nowMs);
}

TrendStore &historyTrend() { return gTrend; }
SdLogger &historySd() { return gSd; }
