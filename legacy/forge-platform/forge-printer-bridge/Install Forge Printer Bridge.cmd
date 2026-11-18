@echo off
REM Double-click entry: prefer packaged Setup.exe
cd /d "%~dp0"
if exist "artifacts\setup\ForgePrinterBridgeSetup.exe" (
  start "" "artifacts\setup\ForgePrinterBridgeSetup.exe"
  exit /b 0
)
call "installer\Install Forge Printer Bridge.cmd"
