namespace Forge.PrinterBridge.Bluetooth;

/// <summary>
/// Companion Bluetooth connection states (spec §20).
/// </summary>
public enum BluetoothStatus
{
    NotConfigured = 0,
    Scanning = 1,
    Pairing = 2,
    Connected = 3,
    Ready = 4,
    Printing = 5,
    Disconnected = 6,
    OutOfRange = 7,
    PrinterError = 8,
    PermissionRequired = 9,
    UserActionRequired = 10,
    Unknown = 99
}

public static class BluetoothStatusMapper
{
    public static BluetoothStatus Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return BluetoothStatus.Unknown;
        }

        return value.Trim().ToUpperInvariant() switch
        {
            "NOT_CONFIGURED" => BluetoothStatus.NotConfigured,
            "SCANNING" => BluetoothStatus.Scanning,
            "PAIRING" => BluetoothStatus.Pairing,
            "CONNECTED" => BluetoothStatus.Connected,
            "READY" => BluetoothStatus.Ready,
            "PRINTING" => BluetoothStatus.Printing,
            "DISCONNECTED" => BluetoothStatus.Disconnected,
            "OUT_OF_RANGE" => BluetoothStatus.OutOfRange,
            "PRINTER_ERROR" => BluetoothStatus.PrinterError,
            "PERMISSION_REQUIRED" => BluetoothStatus.PermissionRequired,
            "USER_ACTION_REQUIRED" => BluetoothStatus.UserActionRequired,
            _ => Enum.TryParse<BluetoothStatus>(value, ignoreCase: true, out var parsed)
                ? parsed
                : BluetoothStatus.Unknown
        };
    }

    public static string ToWire(BluetoothStatus status) => status switch
    {
        BluetoothStatus.NotConfigured => "NOT_CONFIGURED",
        BluetoothStatus.Scanning => "SCANNING",
        BluetoothStatus.Pairing => "PAIRING",
        BluetoothStatus.Connected => "CONNECTED",
        BluetoothStatus.Ready => "READY",
        BluetoothStatus.Printing => "PRINTING",
        BluetoothStatus.Disconnected => "DISCONNECTED",
        BluetoothStatus.OutOfRange => "OUT_OF_RANGE",
        BluetoothStatus.PrinterError => "PRINTER_ERROR",
        BluetoothStatus.PermissionRequired => "PERMISSION_REQUIRED",
        BluetoothStatus.UserActionRequired => "USER_ACTION_REQUIRED",
        _ => "UNKNOWN"
    };

    public static bool IsTemporaryDisconnect(BluetoothStatus status)
        => status is BluetoothStatus.Disconnected or BluetoothStatus.OutOfRange;
}
