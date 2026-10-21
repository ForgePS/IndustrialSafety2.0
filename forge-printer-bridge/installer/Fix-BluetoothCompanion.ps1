<#
.SYNOPSIS
  Removes the orphaned Electron EXE that causes missing ffmpeg.dll, then
  launches the full companion from Program Files\...\Bluetooth\.
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$InstallRoot = "C:\Program Files\Forge Public Safety\Printer Bridge"
$orphan = Join-Path $InstallRoot "ForgePrinterBridge.Bluetooth.exe"
$good = Join-Path $InstallRoot "Bluetooth\ForgePrinterBridge.Bluetooth.exe"

Get-Process -Name "ForgePrinterBridge.Bluetooth" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

if (Test-Path $orphan) {
  # Only delete if it is NOT the same path as the good one (root vs Bluetooth\).
  if ([System.IO.Path]::GetFullPath($orphan) -ne [System.IO.Path]::GetFullPath($good)) {
    Write-Host "Removing orphan: $orphan"
    Remove-Item -Path $orphan -Force
  }
}

if (-not (Test-Path $good)) {
  throw "Missing full companion at $good - re-run Install-Dev.ps1 after npm run dist in bluetooth-companion."
}
if (-not (Test-Path (Join-Path $InstallRoot "Bluetooth\ffmpeg.dll"))) {
  throw "Missing ffmpeg.dll next to companion. Reinstall Bluetooth\ unpack folder."
}

Write-Host "Starting: $good"
Start-Process -FilePath $good -WorkingDirectory (Split-Path $good -Parent)
Write-Host "OK - companion should open without the ffmpeg.dll error."
