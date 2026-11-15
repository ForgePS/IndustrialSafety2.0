using System.Text.Json.Serialization;
using Forge.PrinterBridge.Shared.Enums;

namespace Forge.PrinterBridge.Shared.Dtos;

public sealed class HeartbeatPayload
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = "bridge.heartbeat";

    [JsonPropertyName("bridgeId")]
    public string BridgeId { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = BridgeStatus.Online.ToString().ToUpperInvariant();

    [JsonPropertyName("version")]
    public string Version { get; set; } = "1.0.0";

    [JsonPropertyName("printers")]
    public HeartbeatPrinterCounts Printers { get; set; } = new();

    [JsonPropertyName("timestamp")]
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class HeartbeatPrinterCounts
{
    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("ready")]
    public int Ready { get; set; }

    [JsonPropertyName("offline")]
    public int Offline { get; set; }
}
