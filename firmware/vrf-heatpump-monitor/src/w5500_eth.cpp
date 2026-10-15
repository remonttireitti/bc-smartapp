#include "Arduino.h"
#include "config.h"

#if USE_ETHERNET

#include <WiFi.h>
#include <ETH.h>
#include "sdkconfig.h"

#ifdef CONFIG_ETH_ENABLED
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_eth.h"
#include "esp_eth_mac.h"
#include "esp_eth_phy.h"
#include "esp_event.h"
#include <esp_mac.h>
#include <esp_netif.h>
#include <esp_netif_defaults.h>
#include <tcpip_adapter.h>

extern void tcpipInit();
extern void add_esp_interface_netif(esp_interface_t interface,
                                    esp_netif_t *esp_netif);

static spi_device_handle_t gSpiDev = nullptr;
static esp_eth_handle_t gEthHandle = nullptr;

#if CONFIG_ETH_SPI_ETHERNET_W5500

static void hardResetW5500IfPinned() {
  const int rst = CFG_ETH_W5500_RST_GPIO;
  if (rst < 0) {
    return;
  }
  pinMode(rst, OUTPUT);
  digitalWrite(rst, LOW);
  delay(20);
  digitalWrite(rst, HIGH);
  delay(150);
}

static bool initSpiBusAndDevice(spi_host_device_t spiHost) {
  if (gSpiDev != nullptr) {
    spi_bus_remove_device(gSpiDev);
    gSpiDev = nullptr;
  }

  pinMode(CFG_ETH_W5500_CS_GPIO, OUTPUT);
  digitalWrite(CFG_ETH_W5500_CS_GPIO, HIGH);

  spi_bus_config_t buscfg{};
  buscfg.mosi_io_num = CFG_ETH_W5500_MOSI_GPIO;
  buscfg.miso_io_num = CFG_ETH_W5500_MISO_GPIO;
  buscfg.sclk_io_num = CFG_ETH_W5500_SCLK_GPIO;
  buscfg.quadwp_io_num = -1;
  buscfg.quadhd_io_num = -1;
  buscfg.max_transfer_sz = 4096;

  esp_err_t ret = spi_bus_initialize(spiHost, &buscfg, SPI_DMA_CH_AUTO);
  if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
    Serial.printf("[ETH] spi_bus_initialize(host=%d) failed: %x\n",
                  (int)spiHost, (unsigned)ret);
    return false;
  }

  spi_device_interface_config_t spi_devcfg{};
  /** W5500 VDM frame: 16-bit address + 8-bit control — pakollinen esp_eth:lle. */
  spi_devcfg.command_bits = 16;
  spi_devcfg.address_bits = 8;
  spi_devcfg.mode = 0;
  spi_devcfg.clock_speed_hz = CFG_ETH_W5500_SPI_MHZ * 1000 * 1000;
  spi_devcfg.input_delay_ns = 0;
  spi_devcfg.spics_io_num = CFG_ETH_W5500_CS_GPIO;
  spi_devcfg.queue_size = 20;

  ret = spi_bus_add_device(spiHost, &spi_devcfg, &gSpiDev);
  if (ret != ESP_OK || gSpiDev == nullptr) {
    Serial.printf("[ETH] spi_bus_add_device failed: %x\n", (unsigned)ret);
    return false;
  }
  return true;
}

static void applyBoardEthernetMac(esp_eth_handle_t handle) {
  if (handle == nullptr) {
    return;
  }
  uint8_t mac[6];
  if (esp_read_mac(mac, ESP_MAC_WIFI_STA) != ESP_OK) {
    return;
  }
  mac[0] ^= 0x02;
  const esp_err_t e = esp_eth_ioctl(handle, ETH_CMD_S_MAC_ADDR, mac);
  if (e == ESP_OK) {
    Serial.printf(
        "[ETH] MAC (ESP-johdettu): %02X:%02X:%02X:%02X:%02X:%02X\n", mac[0],
        mac[1], mac[2], mac[3], mac[4], mac[5]);
  } else {
    Serial.printf("[ETH] MAC-asetus epaonnistui: %x\n", (unsigned)e);
  }
}

bool w5500EthernetBegin() {
  if (gEthHandle != nullptr) {
    return esp_eth_start(gEthHandle) == ESP_OK;
  }

  WiFi.mode(WIFI_OFF);
  delay(150);
  hardResetW5500IfPinned();

  const spi_host_device_t preferredHost =
      static_cast<spi_host_device_t>(CFG_ETH_W5500_SPI_HOST);
  const spi_host_device_t fallbackHost =
      (preferredHost == SPI2_HOST) ? SPI3_HOST : SPI2_HOST;

  if (!initSpiBusAndDevice(preferredHost)) {
    Serial.println("[ETH] SPI alustus epaonnistui (ensisijainen host)");
    return false;
  }

  tcpipInit();
  if (tcpip_adapter_set_default_eth_handlers() != ESP_OK) {
    Serial.println("[ETH] tcpip_adapter_set_default_eth_handlers failed");
    return false;
  }

  esp_err_t ret = gpio_install_isr_service(0);
  if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
    Serial.printf("[ETH] gpio_install_isr_service failed: %x\n", (unsigned)ret);
    return false;
  }

  esp_netif_config_t netifCfg = ESP_NETIF_DEFAULT_ETH();
  esp_netif_t *esp_netif = esp_netif_new(&netifCfg);
  if (esp_netif == nullptr) {
    Serial.println("[ETH] esp_netif_new failed");
    return false;
  }

  eth_mac_config_t eth_mac_config = ETH_MAC_DEFAULT_CONFIG();
  eth_mac_config.rx_task_stack_size = 4096;
  eth_mac_config.sw_reset_timeout_ms = 2000;

  eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();
  phy_config.phy_addr = CFG_ETH_W5500_PHY_ADDR;
  phy_config.reset_gpio_num = CFG_ETH_W5500_RST_GPIO;

  eth_w5500_config_t w5500_config = ETH_W5500_DEFAULT_CONFIG(gSpiDev);
  w5500_config.int_gpio_num = CFG_ETH_W5500_INT_GPIO;

  esp_eth_mac_t *mac =
      esp_eth_mac_new_w5500(&w5500_config, &eth_mac_config);
  esp_eth_phy_t *phy = esp_eth_phy_new_w5500(&phy_config);
  if (mac == nullptr || phy == nullptr) {
    Serial.println("[ETH] esp_eth_mac_new_w5500 / esp_eth_phy_new_w5500 failed");
    return false;
  }

  esp_eth_config_t eth_config = ETH_DEFAULT_CONFIG(mac, phy);
  ret = esp_eth_driver_install(&eth_config, &gEthHandle);
  if (ret != ESP_OK || gEthHandle == nullptr) {
    Serial.printf("[ETH] esp_eth_driver_install failed: %x\n", (unsigned)ret);
    return false;
  }
  applyBoardEthernetMac(gEthHandle);

  ret = esp_netif_attach(esp_netif, esp_eth_new_netif_glue(gEthHandle));
  if (ret != ESP_OK) {
    Serial.printf("[ETH] esp_netif_attach failed: %x\n", (unsigned)ret);
    return false;
  }

  add_esp_interface_netif(ESP_IF_ETH, esp_netif);

  ret = esp_eth_start(gEthHandle);
  if (ret != ESP_OK && fallbackHost != preferredHost) {
    Serial.printf(
        "[ETH] esp_eth_start failed host=%d (%x), yritetaan SPI host %d\n",
        (int)preferredHost, (unsigned)ret, (int)fallbackHost);
    esp_eth_stop(gEthHandle);
    esp_eth_driver_uninstall(gEthHandle);
    gEthHandle = nullptr;
    mac->del(mac);
    phy->del(phy);

    if (!initSpiBusAndDevice(fallbackHost)) {
      return false;
    }

    w5500_config = ETH_W5500_DEFAULT_CONFIG(gSpiDev);
    w5500_config.int_gpio_num = CFG_ETH_W5500_INT_GPIO;
    mac = esp_eth_mac_new_w5500(&w5500_config, &eth_mac_config);
    phy = esp_eth_phy_new_w5500(&phy_config);
    if (mac == nullptr || phy == nullptr) {
      return false;
    }
    eth_config = ETH_DEFAULT_CONFIG(mac, phy);
    if (esp_eth_driver_install(&eth_config, &gEthHandle) != ESP_OK ||
        gEthHandle == nullptr) {
      return false;
    }
    applyBoardEthernetMac(gEthHandle);
    if (esp_netif_attach(esp_netif, esp_eth_new_netif_glue(gEthHandle)) !=
        ESP_OK) {
      return false;
    }
    ret = esp_eth_start(gEthHandle);
  }

  if (ret != ESP_OK) {
    Serial.printf("[ETH] esp_eth_start failed: %x\n", (unsigned)ret);
    return false;
  }

  delay(100);
  Serial.printf("[ETH] W5500 kaynnissa, linkUp=%d\n", ETH.linkUp() ? 1 : 0);
  return true;
}

void w5500EthernetStopDriver() {
  if (gEthHandle == nullptr) {
    return;
  }
  esp_err_t e = esp_eth_stop(gEthHandle);
  Serial.printf("[ETH] esp_eth_stop: %x\n", (unsigned)e);
}

esp_eth_handle_t w5500EthernetHandle() { return gEthHandle; }

uint8_t ethernetLinkSpeedMbps() {
  if (!gEthHandle) {
    return 0;
  }
  eth_speed_t s = ETH_SPEED_10M;
  if (esp_eth_ioctl(gEthHandle, ETH_CMD_G_SPEED, &s) != ESP_OK) {
    return 0;
  }
  return (s == ETH_SPEED_10M) ? 10u : 100u;
}

bool ethernetFullDuplex() {
  if (!gEthHandle) {
    return false;
  }
  eth_duplex_t d = ETH_DUPLEX_HALF;
  if (esp_eth_ioctl(gEthHandle, ETH_CMD_G_DUPLEX_MODE, &d) != ESP_OK) {
    return false;
  }
  return d == ETH_DUPLEX_FULL;
}

#else /* !CONFIG_ETH_SPI_ETHERNET_W5500 */

bool w5500EthernetBegin() {
  Serial.println("[ETH] Firmware without W5500 (CONFIG_ETH_SPI_ETHERNET_W5500).");
  return false;
}
void w5500EthernetStopDriver() {}
esp_eth_handle_t w5500EthernetHandle() { return nullptr; }
uint8_t ethernetLinkSpeedMbps() { return 0; }
bool ethernetFullDuplex() { return false; }

#endif /* CONFIG_ETH_SPI_ETHERNET_W5500 */

#else /* !CONFIG_ETH_ENABLED */

bool w5500EthernetBegin() { return false; }
void w5500EthernetStopDriver() {}
esp_eth_handle_t w5500EthernetHandle() { return nullptr; }
uint8_t ethernetLinkSpeedMbps() { return 0; }
bool ethernetFullDuplex() { return false; }

#endif /* CONFIG_ETH_ENABLED */

#else /* !USE_ETHERNET */

bool w5500EthernetBegin() { return false; }
void w5500EthernetStopDriver() {}
esp_eth_handle_t w5500EthernetHandle() { return nullptr; }
uint8_t ethernetLinkSpeedMbps() { return 0; }
bool ethernetFullDuplex() { return false; }

#endif /* USE_ETHERNET */
