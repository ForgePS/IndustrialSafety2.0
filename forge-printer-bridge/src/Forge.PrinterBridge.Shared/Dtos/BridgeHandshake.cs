using System.Text.Json.Serialization;

namespace Forge.PrinterBridge.Shared.Dtos;

public sealed class BridgeHandshake
{
    [JsonPropertyName("bridgeId")]
    public string BridgeId { get; set; } = string.Empty;

    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public string Version { get; set; } = "1.0.0";

    [JsonPropertyName("computerName")]
    public string? ComputerName { get; set; }

    [JsonPropertyName("osVersion")]
    public string? OsVersion { get; set; }
}
