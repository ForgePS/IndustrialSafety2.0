#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$log = "C:\Users\jerem\Projects\forge-platform-industrial-recon\forge-printer-bridge\installer\_install-dev-log.txt"
function Log($m) { $line = "$(Get-Date -Format o) $m"; Add-Content -Path $log -Value $line; Write-Host $line }

try {
  Set-Content -Path $log -Value ""
  $BridgeRoot = "C:\Users\jerem\Projects\forge-platform-industrial-recon\forge-printer-bridge"
  $InstallRoot = "C:\Program Files\Forge Public Safety\Printer Bridge"
  $DataRoot = "C:\ProgramData\Forge Public Safety\Printer Bridge"
  $ServiceName = "ForgePrinterBridgeService"
  $ApiBaseUrl = "https://api.forgepublicsafety.com"

  Log "Stop existing"
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($existing -and $existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
  }
  Get-Process -Name "ForgePrinterBridge.Tray" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

  Log "Create dirs"
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

  Log "Copy binaries"
  if (-not (Test-Path (Join-Path $BridgeRoot "artifacts\service\ForgePrinterBridge.Service.exe"))) {
    throw "artifacts\service missing - publish service first"
  }
  Copy-Item -Path (Join-Path $BridgeRoot "artifacts\service\*") -Destination $InstallRoot -Recurse -Force
  Copy-Item -Path (Join-Path $BridgeRoot "artifacts\tray\*") -Destination $InstallRoot -Recurse -Force

  $btCandidates = @(
    (Join-Path $BridgeRoot "artifacts\tray\Bluetooth"),
    (Join-Path $BridgeRoot "bluetooth-companion\release\win-unpacked"),
    (Join-Path $BridgeRoot "bluetooth-companion\dist\win-unpacked")
  )
  $btSrc = $btCandidates | Where-Object { Test-Path (Join-Path $_ "ForgePrinterBridge.Bluetooth.exe") } | Select-Object -First 1
  $btDst = Join-Path $InstallRoot "Bluetooth"
  if ($btSrc) {
    Log "Install Bluetooth companion from $btSrc"
    if (Test-Path $btDst) { Remove-Item -Path $btDst -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $btDst | Out-Null
    Copy-Item -Path (Join-Path $btSrc "*") -Destination $btDst -Recurse -Force
  } else {
    Log "WARNING: Bluetooth companion unpack folder not found"
  }

  $orphanCompanion = Join-Path $InstallRoot "ForgePrinterBridge.Bluetooth.exe"
  if (Test-Path $orphanCompanion) {
    Log "Removing orphan companion EXE at install root"
    Remove-Item -Path $orphanCompanion -Force -ErrorAction SilentlyContinue
  }

  $companionExe = Join-Path $btDst "ForgePrinterBridge.Bluetooth.exe"
  $companionPathSetting = if (Test-Path $companionExe) { $companionExe } else { $null }

  $appsettingsObj = [ordered]@{
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
  }
  $json = $appsettingsObj | ConvertTo-Json -Depth 8
  Set-Content -Path (Join-Path $InstallRoot "appsettings.json") -Value $json -Encoding UTF8
  Set-Content -Path (Join-Path $DataRoot "Config\appsettings.json") -Value $json -Encoding UTF8

  $serviceExe = Join-Path $InstallRoot "ForgePrinterBridge.Service.exe"
  $trayExe = Join-Path $InstallRoot "ForgePrinterBridge.Tray.exe"
  if (-not (Test-Path $serviceExe)) { throw "Missing $serviceExe" }

  Log "Register forge-printer-bridge protocol"
  $protoRoot = "HKCU:\Software\Classes\forge-printer-bridge"
  New-Item -Path $protoRoot -Force | Out-Null
  New-ItemProperty -Path $protoRoot -Name "(Default)" -Value "URL:Forge Printer Bridge" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $protoRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
  $protoCmd = Join-Path $protoRoot "shell\open\command"
  New-Item -Path $protoCmd -Force | Out-Null
  New-ItemProperty -Path $protoCmd -Name "(Default)" -Value "`"$trayExe`" `"%1`"" -PropertyType String -Force | Out-Null

  Log "Register service"
  if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 3
  }
  & sc.exe create $ServiceName binPath= "`"$serviceExe`"" start= delayed-auto DisplayName= "Forge Printer Bridge Service"
  if ($LASTEXITCODE -ne 0) { throw "sc create exit $LASTEXITCODE" }
  & sc.exe description $ServiceName "Forge Cloud Print Bridge for Windows spooler and Bluetooth."
  & sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000

  Log "Start service"
  Start-Service -Name $ServiceName
  Start-Sleep -Seconds 3
  $svc = Get-Service -Name $ServiceName
  Log "Service status=$($svc.Status)"

  Log "Tray startup"
  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  New-ItemProperty -Path $runKey -Name "ForgePrinterBridgeTray" -Value "`"$trayExe`"" -PropertyType String -Force | Out-Null
  Start-Process -FilePath $trayExe

  Log "SUCCESS installRoot=$InstallRoot status=$($svc.Status)"
}
catch {
  Log "FAILED $($_.Exception.Message)"
  exit 1
}
