using Forge.PrinterBridge.Shared.Enums;

namespace Forge.PrinterBridge.Core.Models;

public sealed class ForgePrinter
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string QueueName { get; set; } = string.Empty;
    public string? DriverName { get; set; }
    public string? PortName { get; set; }
    public PrinterConnectionType ConnectionType { get; set; } = PrinterConnectionType.Unknown;
    public PrinterTransportType TransportType { get; set; } = PrinterTransportType.WindowsSpooler;
    /// <summary>SDK device identifier when available (Bluetooth).</summary>
    public string? BluetoothDeviceId { get; set; }
    /// <summary>Persisted paired-printer id used for reconnect (Bluetooth).</summary>
    public string? BluetoothSavedId { get; set; }
    public bool IsDefault { get; set; }
    public bool IsLocal { get; set; } = true;
    public bool IsNetwork { get; set; }
    public bool IsVirtual { get; set; }
    public bool IsBradyI4311 { get; set; }
    public bool Online { get; set; }
    public bool Ready { get; set; }
    public string StatusText { get; set; } = "UNKNOWN";
    public int Dpi { get; set; } = 300;
}
