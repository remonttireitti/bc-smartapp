#pragma once

#include <Arduino.h>

constexpr uint32_t SAMPLE_INTERVAL_MS = 2000;
constexpr uint32_t TREND_DAYS = 4;
constexpr uint32_t TREND_CAPACITY =
    TREND_DAYS * 24UL * 3600UL * 1000UL / SAMPLE_INTERVAL_MS;

constexpr int16_t TEMP_INVALID = INT16_MIN;

struct TrendStore {
  int16_t *samples = nullptr;
  uint32_t count = 0;
  uint32_t head = 0;
  uint32_t bootSec = 0;

  bool begin();
  void addSample(float tempC, uint32_t nowMs);
  uint32_t spanSeconds() const;
  bool valueAtOffset(uint32_t offsetFromOldest, float &outTemp, uint32_t &outAgeSec) const;
  uint32_t sampleCount() const;
};

struct SdLogger {
  bool ready = false;
  uint32_t maxRecords = 0;
  uint32_t writeIndex = 0;
  uint64_t totalWritten = 0;

  bool begin();
  void append(float tempC, uint32_t nowMs);
};

bool historyBegin();
void historyAddSample(float tempC);
TrendStore &historyTrend();
SdLogger &historySd();
