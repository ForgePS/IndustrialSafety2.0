namespace Forge.PrinterBridge.Shared.Enums;

public enum PrinterTransportType
{
    Unknown = 0,
    WindowsSpooler = 1,
    /// <summary>Brady Web SDK via Bluetooth companion — cloud value BRADY_WEB_BLUETOOTH.</summary>
    BradyWebBluetooth = 2,
    RawNetwork = 3,
    Zpl = 4
}

public static class PrinterTransportTypeExtensions
{
    public static string ToCloudString(this PrinterTransportType transport) => transport switch
    {
        PrinterTransportType.WindowsSpooler => "WINDOWS_SPOOLER",
        PrinterTransportType.BradyWebBluetooth => "BRADY_WEB_BLUETOOTH",
        PrinterTransportType.RawNetwork => "RAW_NETWORK",
        PrinterTransportType.Zpl => "ZPL",
        _ => "UNKNOWN"
    };

    public static PrinterTransportType FromCloudString(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return PrinterTransportType.Unknown;
        }

        return value.Trim().ToUpperInvariant() switch
        {
            "WINDOWS_SPOOLER" => PrinterTransportType.WindowsSpooler,
            "BRADY_WEB_BLUETOOTH" or "BLUETOOTH_COMPANION" or "BLUETOOTH" => PrinterTransportType.BradyWebBluetooth,
            "RAW_NETWORK" => PrinterTransportType.RawNetwork,
            "ZPL" => PrinterTransportType.Zpl,
            _ => PrinterTransportType.Unknown
        };
    }
}
