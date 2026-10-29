using Forge.PrinterBridge.Shared.Constants;

namespace Forge.PrinterBridge.Windows.Profiles;

/// <summary>
/// Brady i4311 initial profile helpers (spec section 33) — 300 DPI.
/// </summary>
public static class BradyI4311Profile
{
    public const int Dpi = BridgeConstants.DefaultDpi;
    public const string ModelName = "Brady i4311";

    public static int InchesToPixels(double inches, int dpi = Dpi)
        => (int)Math.Round(inches * dpi);

    public static (int WidthPx, int HeightPx) MediaToPixels(double widthInches, double heightInches, int dpi = Dpi)
        => (InchesToPixels(widthInches, dpi), InchesToPixels(heightInches, dpi));

    public static bool MatchesNameOrDriver(string? queueName, string? driverName)
    {
        static bool ContainsBradyI4311(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return false;
            }

            var normalized = value.Replace(" ", string.Empty, StringComparison.OrdinalIgnoreCase);
            return normalized.Contains("Bradyi4311", StringComparison.OrdinalIgnoreCase)
                   || value.Contains("i4311", StringComparison.OrdinalIgnoreCase)
                   || (value.Contains("Brady", StringComparison.OrdinalIgnoreCase)
                       && value.Contains("4311", StringComparison.OrdinalIgnoreCase));
        }

        return ContainsBradyI4311(queueName) || ContainsBradyI4311(driverName);
    }
}
