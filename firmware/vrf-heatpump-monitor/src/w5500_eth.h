#pragma once

#include "config.h"

#if USE_ETHERNET
#include <esp_eth.h>

bool w5500EthernetBegin();
void w5500EthernetStopDriver();
esp_eth_handle_t w5500EthernetHandle();
uint8_t ethernetLinkSpeedMbps();
bool ethernetFullDuplex();
#else
inline bool w5500EthernetBegin() { return false; }
inline void w5500EthernetStopDriver() {}
inline esp_eth_handle_t w5500EthernetHandle() { return nullptr; }
inline uint8_t ethernetLinkSpeedMbps() { return 0; }
inline bool ethernetFullDuplex() { return false; }
#endif
