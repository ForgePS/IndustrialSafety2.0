using Forge.PrinterBridge.Core.Models;

namespace Forge.PrinterBridge.Core.Abstractions;

/// <summary>
/// Spec section 58 — print transport abstraction.
/// </summary>
public interface IPrinterTransport
{
    string Name { get; }

    bool Supports(ForgePrinter printer);

    Task<PrinterStatus> GetStatusAsync(
        ForgePrinter printer,
        CancellationToken cancellationToken);

    Task<PrintResult> PrintAsync(
        ForgePrinter printer,
        PrintJob job,
        CancellationToken cancellationToken);

    Task<PrintResult> CancelAsync(
        ForgePrinter printer,
        string jobId,
        CancellationToken cancellationToken);
}
