using Forge.PrinterBridge.Shared.Enums;

namespace Forge.PrinterBridge.Core.Models;

public sealed class PrintJob
{
    public string JobId { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string BridgeId { get; set; } = string.Empty;
    public string PrinterId { get; set; } = string.Empty;
    public string? QueueName { get; set; }
    public string? TemplateId { get; set; }
    public int? TemplateVersion { get; set; }
    public double WidthInches { get; set; }
    public double HeightInches { get; set; }
    public int Dpi { get; set; } = 300;
    public string ArtifactType { get; set; } = "PNG";
    public string? ArtifactUrl { get; set; }
    public string? ArtifactSha256 { get; set; }
    public string? LocalArtifactPath { get; set; }
    public int Copies { get; set; } = 1;
    public string Orientation { get; set; } = "AUTO";
    public string? RequestedBy { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public PrintJobStatus Status { get; set; } = PrintJobStatus.Queued;
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReceivedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? FailedAt { get; set; }
    public int RetryCount { get; set; }
    /// <summary>UTC timestamp when the job first entered WaitingForPrinter (Bluetooth out-of-range).</summary>
    public DateTimeOffset? WaitingSince { get; set; }
}
