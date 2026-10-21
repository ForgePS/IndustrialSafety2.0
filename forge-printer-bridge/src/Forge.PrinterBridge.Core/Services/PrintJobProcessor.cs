using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Core.Services;
using Forge.PrinterBridge.Shared.Enums;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Core.Services;

public sealed class PrintJobProcessor
{
    private readonly IPrintJobQueue _queue;
    private readonly JobIdempotencyService _idempotency;
    private readonly IPrinterTransport _transport;
    private readonly ILogger<PrintJobProcessor> _logger;

    public PrintJobProcessor(
        IPrintJobQueue queue,
        JobIdempotencyService idempotency,
        IPrinterTransport transport,
        ILogger<PrintJobProcessor> logger)
    {
        _queue = queue;
        _idempotency = idempotency;
        _transport = transport;
        _logger = logger;
    }

    public async Task<PrintResult> ProcessAsync(
        ForgePrinter printer,
        PrintJob job,
        CancellationToken cancellationToken = default)
    {
        var existing = await _idempotency.TryGetExistingCompletionAsync(job.JobId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        if (!_transport.Supports(printer))
        {
            var unsupported = PrintResult.Fail("TRANSPORT_UNSUPPORTED", $"Transport {_transport.Name} does not support printer {printer.QueueName}");
            await _queue.UpdateStatusAsync(job.JobId, PrintJobStatus.Failed, unsupported.ErrorCode, unsupported.ErrorMessage, cancellationToken);
            return unsupported;
        }

        var result = await _transport.PrintAsync(printer, job, cancellationToken);
        if (result.Success)
        {
            await _queue.UpdateStatusAsync(job.JobId, result.Status, cancellationToken: cancellationToken);
            await _idempotency.MarkCompletedAsync(job.JobId, result.Status, cancellationToken);
        }
        else
        {
            await _queue.UpdateStatusAsync(job.JobId, result.Status, result.ErrorCode, result.ErrorMessage, cancellationToken);
        }

        _logger.LogInformation(
            "Processed job {JobId} on {Printer} => {Status} success={Success}",
            job.JobId,
            printer.QueueName,
            result.Status,
            result.Success);

        return result;
    }
}
