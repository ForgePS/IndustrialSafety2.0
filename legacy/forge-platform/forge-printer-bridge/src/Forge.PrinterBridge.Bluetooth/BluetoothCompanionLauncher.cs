using System.Diagnostics;
using Forge.PrinterBridge.Shared.Constants;

namespace Forge.PrinterBridge.Bluetooth;

/// <summary>
/// Locates and starts ForgePrinterBridge.Bluetooth.exe without force-killing existing instances.
/// </summary>
public static class BluetoothCompanionLauncher
{
    public static bool IsRunning()
    {
        try
        {
            return Process.GetProcessesByName("ForgePrinterBridge.Bluetooth").Length > 0;
        }
        catch
        {
            return false;
        }
    }

    public static bool TryStart(string? configuredPath, out string detail)
    {
        if (IsRunning())
        {
            detail = "Companion process already running.";
            return true;
        }

        var path = ResolveExecutablePath(configuredPath);
        if (path is null)
        {
            detail = "ForgePrinterBridge.Bluetooth.exe not found under install dir or bluetooth-companion dist.";
            return false;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(path) ?? Environment.CurrentDirectory
            });
            detail = $"Started {path}";
            return true;
        }
        catch (Exception ex)
        {
            detail = ex.Message;
            return false;
        }
    }

    public static string? ResolveExecutablePath(string? configuredPath = null)
    {
        foreach (var candidate in EnumerateCandidates(configuredPath))
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static IEnumerable<string> EnumerateCandidates(string? configuredPath)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            yield return configuredPath;
        }

        // Prefer the full Electron unpack folder (ffmpeg.dll and siblings live here).
        // Never prefer a lone EXE at install root — that breaks with missing ffmpeg.dll.
        yield return Path.Combine(BridgeConstants.InstallRoot, "Bluetooth", BridgeConstants.BluetoothCompanionExeName);
        yield return Path.Combine(BridgeConstants.InstallRoot, "bluetooth-companion", BridgeConstants.BluetoothCompanionExeName);
        yield return Path.Combine(BridgeConstants.InstallRoot, "Bluetooth", "win-unpacked", BridgeConstants.BluetoothCompanionExeName);

        var baseDir = AppContext.BaseDirectory;
        yield return Path.Combine(baseDir, "Bluetooth", BridgeConstants.BluetoothCompanionExeName);
        yield return Path.Combine(baseDir, "Bluetooth", "win-unpacked", BridgeConstants.BluetoothCompanionExeName);

        // Dev layouts: forge-printer-bridge/bluetooth-companion/dist/...
        var cursor = new DirectoryInfo(baseDir);
        for (var i = 0; i < 6 && cursor is not null; i++, cursor = cursor.Parent)
        {
            yield return Path.Combine(cursor.FullName, "bluetooth-companion", "dist", BridgeConstants.BluetoothCompanionExeName);
            yield return Path.Combine(cursor.FullName, "bluetooth-companion", "dist", "win-unpacked", BridgeConstants.BluetoothCompanionExeName);
            yield return Path.Combine(cursor.FullName, "bluetooth-companion", "release", "win-unpacked", BridgeConstants.BluetoothCompanionExeName);
            yield return Path.Combine(cursor.FullName, "forge-printer-bridge", "bluetooth-companion", "dist", BridgeConstants.BluetoothCompanionExeName);
            yield return Path.Combine(cursor.FullName, "forge-printer-bridge", "bluetooth-companion", "dist", "win-unpacked", BridgeConstants.BluetoothCompanionExeName);
            yield return Path.Combine(cursor.FullName, "forge-printer-bridge", "bluetooth-companion", "release", "win-unpacked", BridgeConstants.BluetoothCompanionExeName);
        }
    }
}
