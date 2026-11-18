using Forge.PrinterBridge.Windows.Profiles;

namespace Forge.PrinterBridge.Core.Tests;

public class InchesToPixelsTests
{
    [Theory]
    [InlineData(1, 300, 300)]
    [InlineData(2, 300, 600)]
    [InlineData(3, 300, 900)]
    [InlineData(4, 300, 1200)]
    [InlineData(4.0, 300, 1200)]
    [InlineData(2.5, 300, 750)]
    public void InchesToPixels_RoundsExpectedValues(double inches, int dpi, int expected)
    {
        Assert.Equal(expected, BradyI4311Profile.InchesToPixels(inches, dpi));
    }

    [Fact]
    public void MediaToPixels_FourByTwoAt300Dpi()
    {
        var (width, height) = BradyI4311Profile.MediaToPixels(4, 2);
        Assert.Equal(1200, width);
        Assert.Equal(600, height);
    }
}
