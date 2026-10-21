; Forge Printer Bridge - Windows installer (Inno Setup 6+)
; Build with: installer\Build-Setup.ps1
;
; Output: artifacts\setup\ForgePrinterBridgeSetup.exe

#define MyAppName "Forge Printer Bridge"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "Forge Public Safety"
#define MyAppURL "https://forgepublicsafety.com"
#define MyAppExeName "ForgePrinterBridge.Tray.exe"
#define MyServiceName "ForgePrinterBridgeService"
#define MyServiceDisplay "Forge Printer Bridge Service"

#ifndef StageDir
  #define StageDir "staging"
#endif

#ifndef OutDir
  #define OutDir "..\artifacts\setup"
#endif

[Setup]
AppId={{A7C2E9F1-4B8D-4F21-9E3A-8C1D2E3F4A5B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\Forge Public Safety\Printer Bridge
DefaultGroupName=Forge Public Safety
DisableProgramGroupPage=yes
LicenseFile=
OutputDir={#OutDir}
OutputBaseFilename=ForgePrinterBridgeSetup
SetupIconFile=
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
CloseApplications=yes
RestartApplications=no
MinVersion=10.0
InfoAfterFile=

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
FinishedLabel=Setup finished installing Forge Printer Bridge on this computer.%n%nNext:%n1. Open Forge Print Manager -> Printer Bridges%n2. Create a pairing code%n3. Click "Open Printer Bridge on this PC"%n4. Enter the code in the tray window

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "autostart"; Description: "Start tray icon when I sign in to Windows"; GroupDescription: "Startup:"; Flags: checkedonce

[InstallDelete]
; A lone Electron EXE at {app} root (older installs) fails with "ffmpeg.dll was not found".
; The companion only runs from {app}\Bluetooth\ next to its DLLs.
Type: files; Name: "{app}\ForgePrinterBridge.Bluetooth.exe"

[Files]
; Pre-staged publish output (service + tray + Bluetooth\ unpack folder)
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{commonappdata}\Forge Public Safety\Printer Bridge\Config"; Permissions: users-modify
Name: "{commonappdata}\Forge Public Safety\Printer Bridge\Queue"; Permissions: users-modify
Name: "{commonappdata}\Forge Public Safety\Printer Bridge\Cache"; Permissions: users-modify
Name: "{commonappdata}\Forge Public Safety\Printer Bridge\Logs"; Permissions: users-modify
Name: "{commonappdata}\Forge Public Safety\Printer Bridge\Diagnostics"; Permissions: users-modify
Name: "{commonappdata}\Forge Public Safety\Printer Bridge\Updates"; Permissions: users-modify
Name: "{commonappdata}\Forge Public Safety\Printer Bridge\Bluetooth"; Permissions: users-modify

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{commonstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: autostart

[Registry]
; Custom protocol so Forge web can open the tray (machine-wide; works after elevated install)
Root: HKLM; Subkey: "Software\Classes\forge-printer-bridge"; ValueType: string; ValueName: ""; ValueData: "URL:Forge Printer Bridge"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\Classes\forge-printer-bridge"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKLM; Subkey: "Software\Classes\forge-printer-bridge\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Run]
; Stop / remove any previous service quietly, then register delayed-auto + recovery
Filename: "{sys}\sc.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden waituntilterminated; StatusMsg: "Stopping previous service..."; Check: ServiceExists
Filename: "{sys}\sc.exe"; Parameters: "delete {#MyServiceName}"; Flags: runhidden waituntilterminated; StatusMsg: "Removing previous service..."; Check: ServiceExists
Filename: "{sys}\sc.exe"; Parameters: "create {#MyServiceName} binPath= ""{app}\ForgePrinterBridge.Service.exe"" start= delayed-auto DisplayName= ""{#MyServiceDisplay}"""; Flags: runhidden waituntilterminated; StatusMsg: "Registering Windows service..."
Filename: "{sys}\sc.exe"; Parameters: "description {#MyServiceName} ""Forge Cloud Print Bridge - Windows spooler and Bluetooth companion."""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure {#MyServiceName} reset= 86400 actions= restart/5000/restart/5000/restart/5000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start {#MyServiceName}"; Flags: runhidden waituntilterminated; StatusMsg: "Starting service..."
; Launch tray as the logged-on user (not the elevated SYSTEM/admin token)
Filename: "{app}\{#MyAppExeName}"; Description: "Open Forge Printer Bridge now"; Flags: nowait postinstall runasoriginaluser shellexec

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{sys}\sc.exe"; Parameters: "delete {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "DelSvc"

[Code]
function ServiceExists(): Boolean;
var
  ResultCode: Integer;
begin
  Result :=
    Exec(ExpandConstant('{sys}\sc.exe'),
      'query {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
    and (ResultCode = 0);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigDir, AppSettingsSrc, AppSettingsDst: string;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigDir := ExpandConstant('{commonappdata}\Forge Public Safety\Printer Bridge\Config');
    ForceDirectories(ConfigDir);
    AppSettingsSrc := ExpandConstant('{app}\appsettings.json');
    AppSettingsDst := ConfigDir + '\appsettings.json';
    if FileExists(AppSettingsSrc) then
      CopyFile(AppSettingsSrc, AppSettingsDst, False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    Exec('taskkill.exe', '/F /IM ForgePrinterBridge.Tray.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill.exe', '/F /IM ForgePrinterBridge.Bluetooth.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
