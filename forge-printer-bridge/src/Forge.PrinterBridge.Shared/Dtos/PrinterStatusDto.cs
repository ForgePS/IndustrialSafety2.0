using System.Text.Json.Serialization;

namespace Forge.PrinterBridge.Shared.Dtos;

public sealed class PrinterStatusDto
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = "printer.status";

    [JsonPropertyName("printerId")]
    public string PrinterId { get; set; } = string.Empty;

    [JsonPropertyName("queueName")]
    public string? QueueName { get; set; }

    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("connected")]
    public bool Connected { get; set; }

    [JsonPropertyName("ready")]
    public bool Ready { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "UNKNOWN";

    [JsonPropertyName("isDefault")]
    public bool IsDefault { get; set; }

    [JsonPropertyName("driverName")]
    public string? DriverName { get; set; }

    [JsonPropertyName("portName")]
    public string? PortName { get; set; }

    [JsonPropertyName("isBradyI4311")]
    public bool IsBradyI4311 { get; set; }

    [JsonPropertyName("isVirtual")]
    public bool IsVirtual { get; set; }
}
