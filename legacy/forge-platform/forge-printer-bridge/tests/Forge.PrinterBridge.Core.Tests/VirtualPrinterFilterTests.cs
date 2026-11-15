using Forge.PrinterBridge.Windows.Discovery;

namespace Forge.PrinterBridge.Core.Tests;

public class VirtualPrinterFilterTests
{
    [Theory]
    [InlineData("Microsoft Print to PDF", null, true)]
    [InlineData("Microsoft XPS Document Writer", null, true)]
    [InlineData("Fax", null, true)]
    [InlineData("OneNote (Desktop)", null, true)]
    [InlineData("Send To OneNote 16", null, true)]
    [InlineData("Brady i4311", "Brady i4311 Driver", false)]
    [InlineData("HP LaserJet", "HP Universal", false)]
    public void IsVirtualPrinter_FiltersExpectedNames(string queue, string? driver, bool expected)
    {
        Assert.Equal(expected, VirtualPrinterFilter.IsVirtualPrinter(queue, driver));
    }

    [Fact]
    public void ExcludeVirtual_RemovesVirtualQueues()
    {
        var queues = new[]
        {
            ("Microsoft Print to PDF", "Microsoft Print To PDF"),
            ("Brady i4311", "Brady"),
            ("Fax", "Microsoft Shared Fax Driver")
        };

        var kept = VirtualPrinterFilter
            .ExcludeVirtual(queues, q => q.Item1, q => q.Item2)
            .ToList();

        Assert.Single(kept);
        Assert.Equal("Brady i4311", kept[0].Item1);
    }
}
