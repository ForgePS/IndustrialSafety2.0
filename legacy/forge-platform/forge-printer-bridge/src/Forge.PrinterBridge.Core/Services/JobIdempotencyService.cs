using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Shared.Enums;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Core.Services;

/// <summary>
/// Ensures completed jobs are never printed again (spec section 30).
/// </summary>
public sealed class JobIdempotencyService
{
    private readonly IJobIdempotencyStore _store;
    private readonly ILogger<JobIdempotencyService> _logger;

    public JobIdempotencyService(IJobIdempotencyStore store, ILogger<JobIdempotencyService> logger)
    {
        _store = store;
        _logger = logger;
    }

    public async Task<PrintResult?> TryGetExistingCompletionAsync(
        string jobId,
        CancellationToken cancellationToken = default)
    {
        var status = await _store.GetCompletedStatusAsync(jobId, cancellationToken);
        if (status is null)
        {
            return null;
        }

        _logger.LogInformation(
            "Job {JobId} already completed with status {Status}; suppressing reprint",
            jobId,
            status);

        return PrintResult.AlreadyDone(status.Value);
    }

    public async Task<bool> ShouldPrintAsync(string jobId, CancellationToken cancellationToken = default)
    {
        if (await _store.HasCompletedAsync(jobId, cancellationToken))
        {
            return false;
        }

        return true;
    }

    public Task MarkCompletedAsync(
        string jobId,
        PrintJobStatus status,
        CancellationToken cancellationToken = default)
        => _store.MarkCompletedAsync(jobId, status, cancellationToken);
}
