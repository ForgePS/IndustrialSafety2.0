using System.Printing;
using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Shared.Enums;
using Forge.PrinterBridge.Windows.Profiles;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Windows.Discovery;

public sealed class WindowsPrinterDiscovery : IPrinterDiscovery
{
    private readonly ILogger<WindowsPrinterDiscovery> _logger;
    private readonly bool _includeVirtualPrinters;

    public WindowsPrinterDiscovery(
        ILogger<WindowsPrinterDiscovery> logger,
        bool includeVirtualPrinters = false)
    {
        _logger = logger;
        _includeVirtualPrinters = includeVirtualPrinters;
    }

    public Task<IReadOnlyList<ForgePrinter>> DiscoverAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var results = new List<ForgePrinter>();

        using var server = new LocalPrintServer();
        var queues = server.GetPrintQueues(
            new[]
            {
                EnumeratedPrintQueueTypes.Local,
                EnumeratedPrintQueueTypes.Connections
            });

        foreach (var queue in queues)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                queue.Refresh();
                var queueName = queue.FullName;
                var driverName = queue.QueueDriver?.Name;
                var isVirtual = VirtualPrinterFilter.IsVirtualPrinter(queueName, driverName);

                if (!_includeVirtualPrinters && isVirtual)
                {
                    continue;
                }

                var isBrady = BradyI4311Profile.MatchesNameOrDriver(queueName, driverName);
                var status = MapQueueStatus(queue);

                results.Add(new ForgePrinter
                {
                    Id = queueName,
                    DisplayName = queue.Name,
                    QueueName = queueName,
                    DriverName = driverName,
                    PortName = queue.QueuePort?.Name,
                    ConnectionType = InferConnectionType(queue.QueuePort?.Name),
                    TransportType = PrinterTransportType.WindowsSpooler,
                    IsDefault = string.Equals(server.DefaultPrintQueue?.FullName, queueName, StringComparison.OrdinalIgnoreCase),
                    IsLocal = !queue.IsShared,
                    IsNetwork = queue.IsShared || (queue.QueuePort?.Name?.StartsWith("IP_", StringComparison.OrdinalIgnoreCase) ?? false),
                    IsVirtual = isVirtual,
                    IsBradyI4311 = isBrady,
                    Online = !queue.IsOffline && !queue.IsNotAvailable,
                    Ready = status.Ready,
                    StatusText = status.Status,
                    Dpi = isBrady ? BradyI4311Profile.Dpi : 300
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to inspect print queue {Queue}", queue.FullName);
            }
            finally
            {
                queue.Dispose();
            }
        }

        _logger.LogInformation("Discovered {Count} Windows print queues", results.Count);
        return Task.FromResult<IReadOnlyList<ForgePrinter>>(results);
    }

    private static PrinterConnectionType InferConnectionType(string? portName)
    {
        if (string.IsNullOrWhiteSpace(portName))
        {
            return PrinterConnectionType.Unknown;
        }

        if (portName.StartsWith("USB", StringComparison.OrdinalIgnoreCase))
        {
            return PrinterConnectionType.Usb;
        }

        if (portName.StartsWith("WSD", StringComparison.OrdinalIgnoreCase)
            || portName.Contains("Wi", StringComparison.OrdinalIgnoreCase)
            || portName.Contains("WLAN", StringComparison.OrdinalIgnoreCase))
        {
            return PrinterConnectionType.WiFi;
        }

        if (portName.StartsWith("IP_", StringComparison.OrdinalIgnoreCase)
            || portName.Contains("TCP", StringComparison.OrdinalIgnoreCase)
            || portName.Contains("Standard TCP", StringComparison.OrdinalIgnoreCase))
        {
            return PrinterConnectionType.Ethernet;
        }

        return PrinterConnectionType.Unknown;
    }

    private static (bool Ready, string Status) MapQueueStatus(PrintQueue queue)
    {
        if (queue.IsOffline || queue.IsNotAvailable)
        {
            return (false, "OFFLINE");
        }

        if (queue.IsOutOfPaper || queue.IsPaperJammed || queue.IsInError || queue.IsDoorOpened)
        {
            return (false, "ERROR");
        }

        if (queue.IsBusy || queue.IsPrinting || queue.NumberOfJobs > 0)
        {
            return (true, "BUSY");
        }

        return (true, "READY");
    }
}
