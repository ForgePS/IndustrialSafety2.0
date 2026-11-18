using Forge.PrinterBridge.Shared.Enums;

namespace Forge.PrinterBridge.Core.Abstractions;

/// <summary>
/// Tracks completed job IDs so duplicate delivery never reprints (spec section 30).
/// </summary>
public interface IJobIdempotencyStore
{
    Task InitializeAsync(CancellationToken cancellationToken = default);

    Task<bool> HasCompletedAsync(string jobId, CancellationToken cancellationToken = default);

    Task MarkCompletedAsync(
        string jobId,
        PrintJobStatus status,
        CancellationToken cancellationToken = default);

    Task<PrintJobStatus?> GetCompletedStatusAsync(string jobId, CancellationToken cancellationToken = default);

    Task PurgeExpiredAsync(TimeSpan retention, CancellationToken cancellationToken = default);
}
