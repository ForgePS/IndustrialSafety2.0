@echo off
title Forge Printer Bridge Setup
cd /d "%~dp0"

set "SETUP=%~dp0..\artifacts\setup\ForgePrinterBridgeSetup.exe"
if exist "%SETUP%" (
  echo Starting ForgePrinterBridgeSetup.exe ...
  echo Approve the Windows security (UAC) prompt if it appears.
  start "" "%SETUP%"
  exit /b 0
)

echo Setup.exe not found yet. Building a one-time package, or running the
echo developer install. Prefer Build-Setup.ps1 for a shareable installer.
echo.
if exist "%~dp0Build-Setup.ps1" (
  echo Attempting to build Setup.exe (needs Inno Setup + .NET SDK)...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Setup.ps1"
  if exist "%SETUP%" (
    start "" "%SETUP%"
    exit /b 0
  )
)

echo Falling back to developer install script...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Install-Elevated.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed to start. Right-click and "Run as administrator", or ask IT for ForgePrinterBridgeSetup.exe.
  pause
)
