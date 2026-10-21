using Forge.PrinterBridge.Core.Models;

namespace Forge.PrinterBridge.Core.Abstractions;

public interface IPrintJobQueue
{
    Task InitializeAsync(CancellationToken cancellationToken = default);

    Task EnqueueAsync(PrintJob job, CancellationToken cancellationToken = default);

    Task<PrintJob?> DequeueNextAsync(CancellationToken cancellationToken = default);

    Task UpdateStatusAsync(
        string jobId,
        Shared.Enums.PrintJobStatus status,
        string? errorCode = null,
        string? errorMessage = null,
        CancellationToken cancellationToken = default);

    Task<PrintJob?> GetByIdAsync(string jobId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PrintJob>> GetPendingAsync(CancellationToken cancellationToken = default);

    Task<int> GetPendingCountAsync(CancellationToken cancellationToken = default);
}
