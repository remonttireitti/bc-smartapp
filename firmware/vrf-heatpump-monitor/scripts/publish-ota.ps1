# Rakenna firmware ja kopioi Firebase Hostingiin (OTA URL).
# Käyttö: .\scripts\publish-ota.ps1
#         .\scripts\publish-ota.ps1 -Deploy   # + firebase deploy --only hosting

param(
    [switch]$Deploy
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "==> PlatformIO build (waveshare_esp32s3_eth)..."
pio run -e waveshare_esp32s3_eth
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$SrcBin = Join-Path $Root ".pio\build\waveshare_esp32s3_eth\firmware.bin"
$DestDir = Join-Path $Root "public\firmware"
$DestBin = Join-Path $DestDir "firmware.bin"
$ManifestPath = Join-Path $DestDir "manifest.json"

if (-not (Test-Path $SrcBin)) {
    Write-Error "Build OK but firmware.bin missing: $SrcBin"
}

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
Copy-Item -Force $SrcBin $DestBin

# Lue versio config.h:sta
$ConfigPath = Join-Path $Root "src\config.h"
$Version = "unknown"
if (Test-Path $ConfigPath) {
    $m = Select-String -Path $ConfigPath -Pattern 'FIRMWARE_VERSION_STRING\s+"([^"]+)"'
    if ($m) { $Version = $m.Matches[0].Groups[1].Value }
}

$BuiltAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$Size = (Get-Item $DestBin).Length
$OtaUrl = "https://hyrylavrf.web.app/firmware/firmware.bin"

$manifest = @{
    version  = $Version
    built_at = $BuiltAt
    size     = $Size
    url      = $OtaUrl
} | ConvertTo-Json -Depth 3

Set-Content -Path $ManifestPath -Value $manifest -Encoding UTF8

Write-Host ""
Write-Host "OTA valmis:"
Write-Host "  Versio:  $Version"
Write-Host "  Koko:    $Size tavua"
Write-Host "  Bin:     $DestBin"
Write-Host "  URL:     $OtaUrl"
Write-Host ""
Write-Host "Etäpäivitys: Asetukset -> Firmware OTA -> 'Lähetä OTA laitteelle'"
Write-Host "  (tai RTDB: /vrf/<DEVICE_ID>/ota_request nonce + url)"

if ($Deploy) {
    Write-Host ""
    Write-Host "==> firebase deploy --only hosting..."
    firebase deploy --only hosting
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Deploy valmis: https://hyrylavrf.web.app"
}
