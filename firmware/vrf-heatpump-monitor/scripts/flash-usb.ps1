# USB-flash paikan päällä (ensimmäinen asennus tai hätäpalautus).
# Käyttö: .\scripts\flash-usb.ps1
#         .\scripts\flash-usb.ps1 -Port COM5
#         .\scripts\flash-usb.ps1 -Monitor   # flash + sarjamonitori

param(
    [string]$Port = "COM3",
    [switch]$Monitor
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "==> Build + upload porttiin $Port ..."
pio run -e waveshare_esp32s3_eth -t upload --upload-port $Port
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Flash OK. Laite käynnistyy uudelleen."
Write-Host "Seuraavaksi: RJ45/WiFi verkko -> tarkista https://hyrylavrf.web.app"
Write-Host "OTA jatkossa: .\scripts\publish-ota.ps1 -Deploy  + web UI OTA-painike"

if ($Monitor) {
    Write-Host ""
    Write-Host "==> Serial monitor (Ctrl+C lopettaa)..."
    pio device monitor -p $Port -b 115200
}
