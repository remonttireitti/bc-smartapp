#pragma once

#include <Arduino.h>

void supabaseSyncSetup();
bool supabaseConfigured();
bool supabaseConfigConfigured();
bool supabaseLastIngestOk();
String supabaseLastIngestMessage();
void supabaseTelemetryPublishOrQueue(const String &jsonUtf8);
void supabaseFlushBacklog();
bool supabaseFetchConfigJson(String &outJson);

/** true jos config-vastaus (ohjaus/asetukset) muuttui viimeisen windowMs aikana. */
bool supabaseConfigChangedWithin(unsigned long windowMs);
