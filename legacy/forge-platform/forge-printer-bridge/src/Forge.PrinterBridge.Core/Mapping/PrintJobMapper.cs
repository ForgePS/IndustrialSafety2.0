using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Shared.Dtos;
using Forge.PrinterBridge.Shared.Enums;

namespace Forge.PrinterBridge.Core.Mapping;

public static class PrintJobMapper
{
    public static PrintJob FromPayload(PrintJobPayload payload, string? localArtifactPath = null)
    {
        return new PrintJob
        {
            JobId = payload.JobId,
            TenantId = payload.TenantId,
            BridgeId = payload.BridgeId,
            PrinterId = payload.PrinterId,
            QueueName = FirstNonEmpty(
                payload.WindowsQueueName,
                payload.DeviceIdentifier,
                payload.BluetoothSavedId,
                payload.BluetoothDeviceId),
            TemplateId = payload.Template?.Id,
            TemplateVersion = payload.Template?.Version,
            WidthInches = payload.Media?.WidthInches ?? 0,
            HeightInches = payload.Media?.HeightInches ?? 0,
            Dpi = payload.Render?.Dpi ?? 300,
            ArtifactType = payload.Render?.ArtifactType ?? "PNG",
            ArtifactUrl = payload.Render?.ArtifactUrl,
            ArtifactSha256 = payload.Render?.Sha256,
            LocalArtifactPath = localArtifactPath,
            Copies = payload.Settings?.Copies ?? 1,
            Orientation = payload.Settings?.Orientation ?? "AUTO",
            RequestedBy = payload.RequestedBy,
            ExpiresAt = payload.ExpiresAt,
            Status = PrintJobStatus.Received,
            ReceivedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow
        };
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return null;
    }
}
