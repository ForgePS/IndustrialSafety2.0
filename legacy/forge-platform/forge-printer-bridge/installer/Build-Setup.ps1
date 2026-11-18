<#
.SYNOPSIS
  Builds ForgePrinterBridgeSetup.exe (Inno Setup) for end users.

.DESCRIPTION
  1. Publishes service + tray (unless -SkipPublish and artifacts exist)
  2. Stages binaries + full Bluetooth Electron unpack (with ffmpeg.dll)
  3. Compiles Inno Setup script to artifacts\setup\ForgePrinterBridgeSetup.exe

  End users only need the Setup.exe - double-click, approve UAC, done.

.PARAMETER SkipPublish
  Reuse existing artifacts\service and artifacts\tray.

.PARAMETER SkipInnoInstall
  Do not attempt winget install of Inno Setup if ISCC is missing.
#>
param(
  [switch]$SkipPublish,
  [switch]$SkipInnoInstall
)

$ErrorActionPreference = "Stop"

$InstallerDir = $PSScriptRoot
$BridgeRoot = Split-Path $InstallerDir -Parent
$RepoRoot = Split-Path $BridgeRoot -Parent
$StageDir = Join-Path $InstallerDir "staging"
$OutDir = Join-Path $BridgeRoot "artifacts\setup"
$Iss = Join-Path $InstallerDir "ForgePrinterBridge.iss"

function Find-ISCC {
  $candidates = @(
    "${env:LocalAppData}\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

Write-Host "=== Forge Printer Bridge Setup builder ==="
Write-Host "BridgeRoot: $BridgeRoot"

if (-not $SkipPublish) {
  Write-Host "=== Publish service + tray ==="
  Push-Location $BridgeRoot
  try {
    dotnet publish "src\Forge.PrinterBridge.Service\Forge.PrinterBridge.Service.csproj" -c Release -r win-x64 --self-contained false -o ".\artifacts\service"
    if ($LASTEXITCODE -ne 0) { throw "service publish failed" }
    dotnet publish "src\Forge.PrinterBridge.Tray\Forge.PrinterBridge.Tray.csproj" -c Release -r win-x64 --self-contained false -o ".\artifacts\tray"
    if ($LASTEXITCODE -ne 0) { throw "tray publish failed" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "=== SkipPublish: using existing artifacts ==="
}

$serviceExe = Join-Path $BridgeRoot "artifacts\service\ForgePrinterBridge.Service.exe"
$trayExe = Join-Path $BridgeRoot "artifacts\tray\ForgePrinterBridge.Tray.exe"
if (-not (Test-Path $serviceExe)) { throw "Missing $serviceExe - run without -SkipPublish" }
if (-not (Test-Path $trayExe)) { throw "Missing $trayExe - run without -SkipPublish" }

Write-Host "=== Stage payload ==="
if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Copy-Item (Join-Path $BridgeRoot "artifacts\service\*") $StageDir -Recurse -Force
Copy-Item (Join-Path $BridgeRoot "artifacts\tray\*") $StageDir -Recurse -Force

# Full Electron unpack only - never a lone companion EXE at staging root
$orphan = Join-Path $StageDir "ForgePrinterBridge.Bluetooth.exe"
if (Test-Path $orphan) {
  Remove-Item $orphan -Force
}

$btCandidates = @(
  (Join-Path $BridgeRoot "artifacts\tray\Bluetooth"),
  (Join-Path $BridgeRoot "bluetooth-companion\release\win-unpacked"),
  (Join-Path $BridgeRoot "bluetooth-companion\dist\win-unpacked")
)
$btSrc = $btCandidates | Where-Object {
  Test-Path (Join-Path $_ "ForgePrinterBridge.Bluetooth.exe")
} | Select-Object -First 1

$btDst = Join-Path $StageDir "Bluetooth"
if ($btSrc) {
  Write-Host "Bluetooth companion: $btSrc"
  if (Test-Path $btDst) { Remove-Item $btDst -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $btDst | Out-Null
  Copy-Item (Join-Path $btSrc "*") $btDst -Recurse -Force
  if (-not (Test-Path (Join-Path $btDst "ffmpeg.dll"))) {
    throw "Bluetooth staging missing ffmpeg.dll - rebuild companion (cd bluetooth-companion; npm run dist)"
  }
} else {
  Write-Host "WARNING: No Bluetooth companion unpack found. Setup will ship without Brady BLE companion."
}

$companionPath = $null
if (Test-Path (Join-Path $btDst "ForgePrinterBridge.Bluetooth.exe")) {
  $companionPath = 'C:\Program Files\Forge Public Safety\Printer Bridge\Bluetooth\ForgePrinterBridge.Bluetooth.exe'
}

$appsettings = @{
  Logging = @{
    LogLevel = @{
      Default = "Information"
      "Microsoft.Hosting.Lifetime" = "Information"
    }
  }
  Cloud = @{
    ApiBaseUrl = "https://api.forgepublicsafety.com"
    WebSocketPath = "/printer-bridge/v1/connect"
    HeartbeatIntervalSeconds = 30
    PairingPath = "/api/v1/printer-bridge/v1/pair"
    PreferHttpPolling = $true
    JobPollIntervalSeconds = 3
  }
  Bridge = @{
    IncludeVirtualPrinters = $false
    QueuePollIntervalSeconds = 2
    PrinterRefreshIntervalSeconds = 60
    BluetoothWaitingTimeoutMinutes = 15
    LaunchBluetoothCompanionIfMissing = $true
    BluetoothCompanionPath = $companionPath
  }
} | ConvertTo-Json -Depth 6

$appsettings | Set-Content -Path (Join-Path $StageDir "appsettings.json") -Encoding UTF8

Write-Host "=== Locate Inno Setup compiler (ISCC) ==="
$iscc = Find-ISCC
if (-not $iscc -and -not $SkipInnoInstall) {
  Write-Host "ISCC not found. Trying winget install of Inno Setup..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    winget install --id JRSoftware.InnoSetup -e --accept-package-agreements --accept-source-agreements
    $iscc = Find-ISCC
  }
}
if (-not $iscc) {
  throw @"
Inno Setup compiler (ISCC.exe) not found.
Install from https://jrsoftware.org/isinfo.php or:
  winget install --id JRSoftware.InnoSetup -e
Then re-run this script.
"@
}

Write-Host "Using ISCC: $iscc"
Write-Host "=== Compile Setup.exe ==="
& $iscc "/O$OutDir" "/DStageDir=$StageDir" "/DOutDir=$OutDir" $Iss
if ($LASTEXITCODE -ne 0) { throw "ISCC failed: $LASTEXITCODE" }

$setup = Join-Path $OutDir "ForgePrinterBridgeSetup.exe"
if (-not (Test-Path $setup)) { throw "Expected output missing: $setup" }

$sizeMb = [math]::Round((Get-Item $setup).Length / 1MB, 1)
Write-Host ""
Write-Host "SUCCESS: $setup ($sizeMb MB)"
Write-Host "Give users this file. They double-click, approve UAC, then pair from Forge."
Write-Host "Silent IT deploy: ForgePrinterBridgeSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART"
