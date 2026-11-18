using System.Text.Json.Serialization;

namespace Forge.PrinterBridge.Bluetooth.Models;

public static class BluetoothIpcMessageTypes
{
    public const string BluetoothStatus = "BLUETOOTH_STATUS";
    public const string Discover = "DISCOVER";
    public const string Connect = "CONNECT";
    public const string Disconnect = "DISCONNECT";
    public const string Print = "PRINT";
    public const string Cancel = "CANCEL";
    public const string GetPrinterInfo = "GET_PRINTER_INFO";
    public const string Heartbeat = "HEARTBEAT";
    public const string Forget = "FORGET";

    public const string BluetoothStatusResult = "BLUETOOTH_STATUS_RESULT";
    public const string DiscoverResult = "DISCOVER_RESULT";
    public const string ConnectResult = "CONNECT_RESULT";
    public const string DisconnectResult = "DISCONNECT_RESULT";
    public const string PrintResult = "PRINT_RESULT";
    public const string CancelResult = "CANCEL_RESULT";
    public const string PrinterInfoResult = "PRINTER_INFO_RESULT";
    public const string HeartbeatResult = "HEARTBEAT_RESULT";
    public const string ForgetResult = "FORGET_RESULT";
    public const string Error = "ERROR";
}

/// <summary>
/// Outbound JSON-line request to the Electron Bluetooth companion (spec §54).
/// </summary>
public sealed class BluetoothIpcRequest
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("requestId")]
    public string RequestId { get; set; } = string.Empty;

    [JsonPropertyName("jobId")]
    public string? JobId { get; set; }

    [JsonPropertyName("printerId")]
    public string? PrinterId { get; set; }

    [JsonPropertyName("deviceId")]
    public string? DeviceId { get; set; }

    [JsonPropertyName("savedId")]
    public string? SavedId { get; set; }

    [JsonPropertyName("artifactPath")]
    public string? ArtifactPath { get; set; }

    [JsonPropertyName("copies")]
    public int? Copies { get; set; }

    [JsonPropertyName("timestamp")]
    public DateTimeOffset? Timestamp { get; set; }
}

/// <summary>
/// Inbound JSON-line response from the companion, correlated by <see cref="RequestId"/>.
/// </summary>
public sealed class BluetoothIpcResponse
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("requestId")]
    public string? RequestId { get; set; }

    [JsonPropertyName("jobId")]
    public string? JobId { get; set; }

    [JsonPropertyName("printerId")]
    public string? PrinterId { get; set; }

    [JsonPropertyName("success")]
    public bool? Success { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("errorCode")]
    public string? ErrorCode { get; set; }

    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("sdkStatus")]
    public string? SdkStatus { get; set; }

    [JsonPropertyName("printers")]
    public List<BluetoothPrinterInfo>? Printers { get; set; }

    [JsonPropertyName("printer")]
    public BluetoothPrinterInfo? Printer { get; set; }

    [JsonPropertyName("timestamp")]
    public DateTimeOffset? Timestamp { get; set; }
}

public sealed class BluetoothPrinterInfo
{
    [JsonPropertyName("printerId")]
    public string? PrinterId { get; set; }

    [JsonPropertyName("deviceId")]
    public string? DeviceId { get; set; }

    [JsonPropertyName("savedId")]
    public string? SavedId { get; set; }

    [JsonPropertyName("displayName")]
    public string? DisplayName { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("model")]
    public string? Model { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("online")]
    public bool? Online { get; set; }

    [JsonPropertyName("connected")]
    public bool? Connected { get; set; }

    [JsonPropertyName("ready")]
    public bool? Ready { get; set; }

    [JsonPropertyName("dpi")]
    public int? Dpi { get; set; }

    [JsonPropertyName("isBradyI4311")]
    public bool? IsBradyI4311 { get; set; }

    [JsonPropertyName("transportType")]
    public string? TransportType { get; set; }
}
