namespace Forge.PrinterBridge.Shared.Constants;

/// <summary>
/// Install paths, IPC names, and service identity from the Forge Printer Bridge spec.
/// </summary>
public static class BridgeConstants
{
    public const string ProductName = "Forge Printer Bridge";
    public const string ServiceDisplayName = "Forge Printer Bridge Service";
    public const string ServiceName = "ForgePrinterBridgeService";

    public const string ServiceExeName = "ForgePrinterBridge.Service.exe";
    public const string TrayExeName = "ForgePrinterBridge.Tray.exe";
    public const string UpdaterExeName = "ForgePrinterBridge.Updater.exe";
    public const string BluetoothCompanionExeName = "ForgePrinterBridge.Bluetooth.exe";

    public const string InstallRoot =
        @"C:\Program Files\Forge Public Safety\Printer Bridge";

    public const string DataRoot =
        @"C:\ProgramData\Forge Public Safety\Printer Bridge";

    public static string ConfigDirectory => Path.Combine(DataRoot, "Config");
    public static string QueueDirectory => Path.Combine(DataRoot, "Queue");
    public static string CacheDirectory => Path.Combine(DataRoot, "Cache");
    public static string LogsDirectory => Path.Combine(DataRoot, "Logs");
    public static string DiagnosticsDirectory => Path.Combine(DataRoot, "Diagnostics");
    public static string UpdatesDirectory => Path.Combine(DataRoot, "Updates");
    public static string BluetoothDirectory => Path.Combine(DataRoot, "Bluetooth");

    public static string LocalDatabasePath => Path.Combine(QueueDirectory, "bridge.db");
    public static string AppSettingsPath => Path.Combine(ConfigDirectory, "appsettings.json");
    public static string CredentialsStorePath => Path.Combine(ConfigDirectory, "credentials.dpapi");

    /// <summary>Named pipe for Phase 2 Bluetooth companion IPC.</summary>
    public const string BluetoothNamedPipe = @"\\.\pipe\ForgePrinterBridgeBluetooth";

    /// <summary>Named pipe for tray ↔ service status IPC.</summary>
    public const string StatusNamedPipe = @"\\.\pipe\ForgePrinterBridgeStatus";

    /// <summary>Custom URL protocol so Forge web can wake the tray.</summary>
    public const string ProtocolScheme = "forge-printer-bridge";

    /// <summary>Local mutex for single-instance tray.</summary>
    public const string TrayMutexName = @"Local\ForgePrinterBridgeTray";

    /// <summary>Event signaled by a second tray launch to activate the first instance.</summary>
    public const string TrayActivateEventName = @"Local\ForgePrinterBridgeTrayActivate";

    public static string TrayCommandPath => Path.Combine(ConfigDirectory, "tray-command.txt");

    public const int DefaultDpi = 300;
    public const int HeartbeatIntervalSeconds = 30;
    public const int DefaultCompletedJobRetentionDays = 30;

    public const string DefaultCloudApiBaseUrl = "https://api.forgepublicsafety.com";
    public const string DefaultWebSocketPath = "/printer-bridge/v1/connect";
}
