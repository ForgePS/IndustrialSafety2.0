using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Printing;
using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Shared.Enums;
using Forge.PrinterBridge.Windows.Profiles;
using Microsoft.Extensions.Logging;
using PrintJobStatus = Forge.PrinterBridge.Shared.Enums.PrintJobStatus;

namespace Forge.PrinterBridge.Windows.Transport;

/// <summary>
/// Windows spooler transport (spec sections 58-59) using System.Drawing.Printing / System.Printing.
/// </summary>
public sealed class WindowsSpoolerTransport : IPrinterTransport
{
    private readonly ILogger<WindowsSpoolerTransport> _logger;

    public WindowsSpoolerTransport(ILogger<WindowsSpoolerTransport> logger)
    {
        _logger = logger;
    }

    public string Name => "WindowsSpoolerTransport";

    public bool Supports(ForgePrinter printer)
        => printer.TransportType == PrinterTransportType.WindowsSpooler
           && !string.IsNullOrWhiteSpace(printer.QueueName);

    public Task<PrinterStatus> GetStatusAsync(ForgePrinter printer, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            using var server = new LocalPrintServer();
            using var queue = server.GetPrintQueue(printer.QueueName);
            queue.Refresh();

            var ready = !queue.IsOffline && !queue.IsNotAvailable && !queue.IsInError;
            return Task.FromResult(new PrinterStatus
            {
                PrinterId = printer.Id,
                QueueName = printer.QueueName,
                Online = !queue.IsOffline && !queue.IsNotAvailable,
                Connected = true,
                Ready = ready,
                Status = ready ? "READY" : "OFFLINE",
                Detail = queue.QueueStatus.ToString()
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to read status for queue {Queue}", printer.QueueName);
            return Task.FromResult(new PrinterStatus
            {
                PrinterId = printer.Id,
                QueueName = printer.QueueName,
                Online = false,
                Connected = false,
                Ready = false,
                Status = "UNAVAILABLE",
                Detail = ex.Message
            });
        }
    }

    public Task<PrintResult> PrintAsync(
        ForgePrinter printer,
        PrintJob job,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (string.IsNullOrWhiteSpace(job.LocalArtifactPath) || !File.Exists(job.LocalArtifactPath))
        {
            return Task.FromResult(PrintResult.Fail("ARTIFACT_MISSING", "Local print artifact path is missing or invalid."));
        }

        try
        {
            using var server = new LocalPrintServer();
            using var queue = server.GetPrintQueue(printer.QueueName);
            queue.Refresh();

            if (queue.IsOffline || queue.IsNotAvailable)
            {
                return Task.FromResult(PrintResult.Fail("PRINTER_OFFLINE", $"Queue {printer.QueueName} is offline."));
            }

            var dpi = job.Dpi > 0 ? job.Dpi : BradyI4311Profile.Dpi;
            var widthPx = BradyI4311Profile.InchesToPixels(job.WidthInches, dpi);
            var heightPx = BradyI4311Profile.InchesToPixels(job.HeightInches, dpi);

            using var image = Image.FromFile(job.LocalArtifactPath);
            using var printDocument = new PrintDocument();
            printDocument.PrinterSettings.PrinterName = printer.QueueName;
            printDocument.PrinterSettings.Copies = (short)Math.Clamp(job.Copies, 1, 99);
            printDocument.DocumentName = $"Forge-{job.JobId}";
            printDocument.DefaultPageSettings.PrinterSettings = printDocument.PrinterSettings;

            if (job.WidthInches > 0 && job.HeightInches > 0)
            {
                printDocument.DefaultPageSettings.PaperSize = new PaperSize(
                    "ForgeLabel",
                    (int)Math.Round(job.WidthInches * 100),
                    (int)Math.Round(job.HeightInches * 100));
            }

            printDocument.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
            printDocument.OriginAtMargins = false;

            Exception? printError = null;
            printDocument.PrintPage += (_, args) =>
            {
                try
                {
                    var destRect = args.PageBounds;
                    if (widthPx > 0 && heightPx > 0)
                    {
                        // Prefer exact media dimensions when provided.
                        destRect = new Rectangle(0, 0, args.PageBounds.Width, args.PageBounds.Height);
                    }

                    args.Graphics!.DrawImage(image, destRect);
                    args.HasMorePages = false;
                }
                catch (Exception ex)
                {
                    printError = ex;
                    args.HasMorePages = false;
                }
            };

            printDocument.Print();

            if (printError is not null)
            {
                throw printError;
            }

            _logger.LogInformation(
                "Submitted job {JobId} to spooler queue {Queue} ({Width}x{Height}@{Dpi}dpi)",
                job.JobId,
                printer.QueueName,
                widthPx,
                heightPx,
                dpi);

            // Windows spool acceptance is not physical print confirmation (spec section 60).
            return Task.FromResult(PrintResult.Ok(PrintJobStatus.SentToPrinter, job.JobId));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to print job {JobId} to {Queue}", job.JobId, printer.QueueName);
            return Task.FromResult(PrintResult.Fail("SPOOLER_PRINT_FAILED", ex.Message));
        }
    }

    public Task<PrintResult> CancelAsync(
        ForgePrinter printer,
        string jobId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            using var server = new LocalPrintServer();
            using var queue = server.GetPrintQueue(printer.QueueName);
            queue.Refresh();

            var jobs = queue.GetPrintJobInfoCollection();
            var cancelled = false;
            foreach (var spoolJob in jobs)
            {
                if (spoolJob.Name.Contains(jobId, StringComparison.OrdinalIgnoreCase)
                    || spoolJob.JobIdentifier.ToString().Equals(jobId, StringComparison.OrdinalIgnoreCase))
                {
                    spoolJob.Cancel();
                    cancelled = true;
                }

                spoolJob.Dispose();
            }

            return Task.FromResult(cancelled
                ? PrintResult.Ok(PrintJobStatus.Cancelled)
                : PrintResult.Fail("JOB_NOT_FOUND", $"No spooler job matching {jobId} was found.", PrintJobStatus.Failed));
        }
        catch (Exception ex)
        {
            return Task.FromResult(PrintResult.Fail("CANCEL_FAILED", ex.Message));
        }
    }
}
