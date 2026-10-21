using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Core.Services;

/// <summary>
/// Selects among registered <see cref="IPrinterTransport"/> implementations via <see cref="IPrinterTransport.Supports"/>.
/// </summary>
public sealed class PrinterTransportRouter : IPrinterTransport
{
    private readonly IReadOnlyList<IPrinterTransport> _transports;
    private readonly ILogger<PrinterTransportRouter> _logger;

    public PrinterTransportRouter(
        IEnumerable<IPrinterTransport> transports,
        ILogger<PrinterTransportRouter> logger)
    {
        _transports = transports
            .Where(t => t is not PrinterTransportRouter)
            .ToList();
        _logger = logger;

        if (_transports.Count == 0)
        {
            throw new ArgumentException("At least one IPrinterTransport implementation is required.", nameof(transports));
        }
    }

    public string Name => "PrinterTransportRouter";

    public bool Supports(ForgePrinter printer)
        => _transports.Any(t => t.Supports(printer));

    public Task<PrinterStatus> GetStatusAsync(ForgePrinter printer, CancellationToken cancellationToken)
        => Resolve(printer).GetStatusAsync(printer, cancellationToken);

    public Task<PrintResult> PrintAsync(ForgePrinter printer, PrintJob job, CancellationToken cancellationToken)
        => Resolve(printer).PrintAsync(printer, job, cancellationToken);

    public Task<PrintResult> CancelAsync(ForgePrinter printer, string jobId, CancellationToken cancellationToken)
        => Resolve(printer).CancelAsync(printer, jobId, cancellationToken);

    public IPrinterTransport Resolve(ForgePrinter printer)
    {
        var match = _transports.FirstOrDefault(t => t.Supports(printer));
        if (match is null)
        {
            _logger.LogWarning(
                "No transport supports printer {PrinterId} transport={Transport} connection={Connection}",
                printer.Id,
                printer.TransportType,
                printer.ConnectionType);
            throw new InvalidOperationException(
                $"No printer transport supports printer '{printer.Id}' ({printer.TransportType}/{printer.ConnectionType}).");
        }

        return match;
    }
}
