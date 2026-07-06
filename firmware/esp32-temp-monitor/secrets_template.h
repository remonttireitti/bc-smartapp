// Kopioi secrets_template.h → secrets.h (älä commitoi secrets.h).

#ifndef SECRETS_H
#define SECRETS_H

#define WIFI_SSID "oma_wifi"
#define WIFI_PASSWORD "oma_salasana"

/** BC-Smartapp Supabase URL (esim. https://xxxx.supabase.co) */
#define SUPABASE_URL "https://KORVAA_PROJEKTISI.supabase.co"

/** 12-numeroinen laiteavain — demo: 886644220011 (migraatio 20260606000086) */
#define DEVICE_KEY "886644220011"

/** Valinnainen: oman yrityksen laitteen avain temp_devices-taulusta */
// #define DEVICE_KEY "123456789012"

/** Näyteväli ms (oletus 2 min) */
// #define READ_INTERVAL_MS 120000UL

#endif
