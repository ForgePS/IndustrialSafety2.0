namespace Forge.PrinterBridge.Windows.Discovery;

/// <summary>
/// Filters virtual / non-physical printers by default (spec section 14).
/// </summary>
public static class VirtualPrinterFilter
{
    private static readonly string[] VirtualNameFragments =
    [
        "Microsoft Print to PDF",
        "Microsoft XPS Document Writer",
        "Microsoft XPS",
        "Fax",
        "OneNote",
        "Send To OneNote"
    ];

    public static bool IsVirtualPrinter(string? queueName, string? driverName = null)
    {
        return Matches(queueName) || Matches(driverName);
    }

    public static IEnumerable<T> ExcludeVirtual<T>(
        IEnumerable<T> printers,
        Func<T, string?> queueNameSelector,
        Func<T, string?>? driverNameSelector = null)
    {
        foreach (var printer in printers)
        {
            var queue = queueNameSelector(printer);
            var driver = driverNameSelector?.Invoke(printer);
            if (!IsVirtualPrinter(queue, driver))
            {
                yield return printer;
            }
        }
    }

    private static bool Matches(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        foreach (var fragment in VirtualNameFragments)
        {
            if (value.Contains(fragment, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
