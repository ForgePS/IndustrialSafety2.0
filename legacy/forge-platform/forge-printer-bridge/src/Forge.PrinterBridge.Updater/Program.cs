using Forge.PrinterBridge.Shared.Constants;

namespace Forge.PrinterBridge.Updater;

/// <summary>
/// Phase 1 stub. Automatic updates are owned by a later phase (spec section 91).
/// </summary>
internal static class Program
{
    private static int Main(string[] args)
    {
        Console.WriteLine($"{BridgeConstants.ProductName} Updater (stub)");
        Console.WriteLine("Automatic updates are not implemented in Phase 1.");
        Console.WriteLine($"Expected install root: {BridgeConstants.InstallRoot}");
        Console.WriteLine($"Updates directory: {BridgeConstants.UpdatesDirectory}");
        if (args.Length > 0)
        {
            Console.WriteLine($"Args: {string.Join(' ', args)}");
        }

        return 0;
    }
}
