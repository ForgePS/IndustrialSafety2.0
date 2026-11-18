namespace Forge.PrinterBridge.Core.Models;

public sealed class PrinterStatus
{
    public string PrinterId { get; set; } = string.Empty;
    public string QueueName { get; set; } = string.Empty;
    public bool Online { get; set; }
    public bool Connected { get; set; }
    public bool Ready { get; set; }
    public string Status { get; set; } = "UNKNOWN";
    public string? Detail { get; set; }
}
