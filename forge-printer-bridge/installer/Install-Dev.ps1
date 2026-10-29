#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install Forge Printer Bridge (service + tray + Bluetooth companion).

.DESCRIPTION
  Average users: double-click "Install Forge Printer Bridge.cmd" and approve UAC.

  Developers can also run:
    powershell -ExecutionPolicy Bypass -File .\installer\Install-Dev.ps1

  Do not paste this script into an interactive prompt.

.PARAMETER Rebuild
  Force dotnet publish even when artifacts already exist.
#>
param(
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

function Show-DoneDialog([string]$Title, [string]$Body, [string]$Icon = "Information") {
  try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $iconEnum = [System.Windows.Forms.MessageBoxIcon]::$Icon
    [void][System.Windows.Forms.MessageBox]::Show(
      $Body,
      $Title,
      [System.Windows.Forms.MessageBoxButtons]::OK,
      $iconEnum)
  } catch {
    Write-Host $Body
    pause
  }
}

try {

# Resolve repo root even if $PSScriptRoot is empty (interactive paste) or cwd differs.
$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  # installer/ -> forge-printer-bridge/ -> repo root
  $candidates += (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
}
$candidates += (Join-Path (Get-Location).Path ".")
$candidates += (Join-Path (Get-Location).Path "..")
$candidates += "C:\Users\jerem\Projects\forge-platform-industrial-recon"

$RepoRoot = $null
foreach ($c in $candidates) {
  try {
    $resolved = [System.IO.Path]::GetFullPath($c)
  } catch {
    continue
  }
  if (Test-Path (Join-Path $resolved "forge-printer-bridge\ForgePrinterBridge.sln")) {
    $RepoRoot = $resolved
    break
  }
  # Already inside forge-printer-bridge
  if (Test-Path (Join-Path $resolved "ForgePrinterBridge.sln")) {
    $RepoRoot = Split-Path $resolved -Parent
    break
  }
}
if (-not $RepoRoot) {
  throw "Could not find forge-printer-bridge\ForgePrinterBridge.sln. Double-click 'Install Forge Printer Bridge.cmd' instead of pasting commands."
}

$BridgeRoot = Join-Path $RepoRoot "forge-printer-bridge"
$InstallRoot = "C:\Program Files\Forge Public Safety\Printer Bridge"
$DataRoot = "C:\ProgramData\Forge Public Safety\Printer Bridge"
$ServiceName = "ForgePrinterBridgeService"
$ApiBaseUrl = if ($env:FORGE_BRIDGE_API_BASE) { $env:FORGE_BRIDGE_API_BASE } else { "https://api.forgepublicsafety.com" }

Write-Host "RepoRoot:    $RepoRoot"
Write-Host "BridgeRoot:  $BridgeRoot"
Write-Host "InstallRoot: $InstallRoot"
Write-Host ""

$serviceArtifact = Join-Path $BridgeRoot "artifacts\service\ForgePrinterBridge.Service.exe"
$trayArtifact = Join-Path $BridgeRoot "artifacts\tray\ForgePrinterBridge.Tray.exe"
$needPublish = $Rebuild -or -not (Test-Path $serviceArtifact) -or -not (Test-Path $trayArtifact)

if ($needPublish) {
  Write-Host "=== Publish service + tray ==="
  if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "Build tools (dotnet) not found and no prebuilt artifacts. Ask IT for the installer package, or install .NET 8 SDK and re-run with -Rebuild."
  }
  Push-Location $BridgeRoot
  try {
    dotnet publish "src\Forge.PrinterBridge.Service\Forge.PrinterBridge.Service.csproj" -c Release -r win-x64 --self-contained false -o ".\artifacts\service"
    if ($LASTEXITCODE -ne 0) { throw "service publish failed" }
    dotnet publish "src\Forge.PrinterBridge.Tray\Forge.PrinterBridge.Tray.csproj" -c Release -r win-x64 --self-contained false -o ".\artifacts\tray"
    if ($LASTEXITCODE -ne 0) { throw "tray publish failed" }
  }
  finally {
    Pop-Location
  }
} else {
  Write-Host "=== Using existing published artifacts (pass -Rebuild to force rebuild) ==="
}

Write-Host "=== Stop existing service / tray / companion ==="
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}
Get-Process -Name "ForgePrinterBridge.Tray","ForgePrinterBridge.Bluetooth" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "=== Create directories ==="
@(
  $InstallRoot,
  (Join-Path $DataRoot "Config"),
  (Join-Path $DataRoot "Queue"),
  (Join-Path $DataRoot "Cache"),
  (Join-Path $DataRoot "Logs"),
  (Join-Path $DataRoot "Diagnostics"),
  (Join-Path $DataRoot "Updates"),
  (Join-Path $DataRoot "Bluetooth")
) | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

Write-Host "=== Copy binaries ==="
Copy-Item -Path (Join-Path $BridgeRoot "artifacts\service\*") -Destination $InstallRoot -Recurse -Force
Copy-Item -Path (Join-Path $BridgeRoot "artifacts\tray\*") -Destination $InstallRoot -Recurse -Force

# Prefer Bluetooth companion next to tray publish if present.
# Electron requires the full unpack folder (ffmpeg.dll, locales, resources, ...) - never a lone EXE.
$btCandidates = @(
  (Join-Path $BridgeRoot "artifacts\tray\Bluetooth"),
  (Join-Path $BridgeRoot "bluetooth-companion\release\win-unpacked"),
  (Join-Path $BridgeRoot "bluetooth-companion\dist\win-unpacked")
)
$btSrc = $btCandidates | Where-Object { Test-Path (Join-Path $_ "ForgePrinterBridge.Bluetooth.exe") } | Select-Object -First 1
$btDst = Join-Path $InstallRoot "Bluetooth"
if ($btSrc) {
  Write-Host "=== Install Bluetooth companion from $btSrc ==="
  if (Test-Path $btDst) { Remove-Item -Path $btDst -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $btDst | Out-Null
  Copy-Item -Path (Join-Path $btSrc "*") -Destination $btDst -Recurse -Force
} else {
  Write-Host "WARNING: Bluetooth companion unpack folder not found. Brady BLE will need a companion build (npm run dist)."
}

# Remove orphaned Electron EXE at install root (missing native DLLs -> ffmpeg.dll System Error).
$orphanCompanion = Join-Path $InstallRoot "ForgePrinterBridge.Bluetooth.exe"
if (Test-Path $orphanCompanion) {
  Write-Host "Removing orphan companion EXE at install root (use Bluetooth\ folder instead)."
  Remove-Item -Path $orphanCompanion -Force -ErrorAction SilentlyContinue
}

$companionExe = Join-Path $btDst "ForgePrinterBridge.Bluetooth.exe"
$companionPathSetting = if (Test-Path $companionExe) { $companionExe } else { $null }

$appsettings = @{
  Logging = @{
    LogLevel = @{
      Default = "Information"
      "Microsoft.Hosting.Lifetime" = "Information"
    }
  }
  Cloud = @{
    ApiBaseUrl = $ApiBaseUrl
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
    BluetoothCompanionPath = $companionPathSetting
  }
} | ConvertTo-Json -Depth 6

$appsettings | Set-Content -Path (Join-Path $InstallRoot "appsettings.json") -Encoding UTF8
$appsettings | Set-Content -Path (Join-Path $DataRoot "Config\appsettings.json") -Encoding UTF8

$serviceExe = Join-Path $InstallRoot "ForgePrinterBridge.Service.exe"
$trayExe = Join-Path $InstallRoot "ForgePrinterBridge.Tray.exe"
if (-not (Test-Path $serviceExe)) { throw "Missing $serviceExe" }
if (-not (Test-Path $trayExe)) { throw "Missing $trayExe" }

Write-Host "=== Register forge-printer-bridge protocol ==="
$protoRoot = "HKCU:\Software\Classes\forge-printer-bridge"
New-Item -Path $protoRoot -Force | Out-Null
New-ItemProperty -Path $protoRoot -Name "(Default)" -Value "URL:Forge Printer Bridge" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $protoRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
$protoCmd = Join-Path $protoRoot "shell\open\command"
New-Item -Path $protoCmd -Force | Out-Null
New-ItemProperty -Path $protoCmd -Name "(Default)" -Value "`"$trayExe`" `"%1`"" -PropertyType String -Force | Out-Null

Write-Host "=== Register Windows service ==="
if ($existing) {
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

# sc.exe requires space after =
$binPath = "`"$serviceExe`""
sc.exe create $ServiceName binPath= $binPath start= delayed-auto DisplayName= "Forge Printer Bridge Service"
if ($LASTEXITCODE -ne 0) { throw "sc create failed: $LASTEXITCODE" }
sc.exe description $ServiceName "Forge Cloud Print Bridge - Windows spooler and Bluetooth companion."
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000

Write-Host "=== Start service ==="
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName
Write-Host "Service status: $($svc.Status)"

Write-Host "=== Tray logon startup ==="
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $runKey -Name "ForgePrinterBridgeTray" -Value "`"$trayExe`"" -PropertyType String -Force | Out-Null

# Start Menu shortcut for non-technical users
$programs = [Environment]::GetFolderPath("Programs")
$shortcutDir = Join-Path $programs "Forge Public Safety"
New-Item -ItemType Directory -Force -Path $shortcutDir | Out-Null
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $shortcutDir "Forge Printer Bridge.lnk"))
$lnk.TargetPath = $trayExe
$lnk.WorkingDirectory = $InstallRoot
$lnk.Description = "Forge Printer Bridge tray"
$lnk.Save()

Write-Host "=== Launch tray ==="
Start-Process -FilePath $trayExe

$bleNote = if ($companionPathSetting) {
  "Bluetooth companion is installed."
} else {
  "Bluetooth companion was not found in this package - USB/network printers still work."
}

$doneBody = @"
Setup finished. Service: $($svc.Status)

Next steps (about 1 minute):
1. Open Forge -> Print Manager -> Printer Bridges
2. Click Add Printer Bridge and create a pairing code
3. Click Open Printer Bridge on this PC
4. Enter the pairing code in the tray window

$bleNote

Later logons: the tray starts automatically.
You can also open it from the Start menu: Forge Public Safety
"@

Show-DoneDialog "Forge Printer Bridge" $doneBody

Write-Host ""
Write-Host "Install complete."
Write-Host "  InstallRoot: $InstallRoot"
Write-Host "  DataRoot:    $DataRoot"
Write-Host "  ApiBaseUrl:  $ApiBaseUrl"
Write-Host "  Service:     $ServiceName ($($svc.Status))"
Write-Host "Next: Forge Print Manager -> Open Printer Bridge on this PC -> enter pairing code."

} catch {
  Show-DoneDialog "Forge Printer Bridge setup failed" (
    "Setup failed:`r`n`r`n$($_.Exception.Message)`r`n`r`n" +
    "If this keeps happening, ask IT to run the installer as Administrator."
  ) "Error"
  throw
}
