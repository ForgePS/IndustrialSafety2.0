using Forge.PrinterBridge.Core.Models;

namespace Forge.PrinterBridge.Core.Abstractions;

public interface IPrinterDiscovery
{
    Task<IReadOnlyList<ForgePrinter>> DiscoverAsync(CancellationToken cancellationToken = default);
}
