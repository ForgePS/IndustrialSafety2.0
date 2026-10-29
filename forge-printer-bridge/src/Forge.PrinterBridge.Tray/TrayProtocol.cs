using Forge.PrinterBridge.Shared.Constants;

namespace Forge.PrinterBridge.Tray;

/// <summary>
/// Parses forge-printer-bridge:// URLs and maps them to tray actions.
/// </summary>
public static class TrayProtocol
{
    public enum Action
    {
        None,
        Open,
        Register,
        Status,
        Bluetooth,
    }

    public static Action Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Action.None;
        }

        var value = raw.Trim().Trim('"');
        if (!value.StartsWith(BridgeConstants.ProtocolScheme + ":", StringComparison.OrdinalIgnoreCase))
        {
            // Also accept bare action tokens from activation file.
            return value.ToLowerInvariant() switch
            {
                "open" => Action.Open,
                "register" => Action.Register,
                "status" => Action.Status,
                "bluetooth" => Action.Bluetooth,
                _ => Action.None,
            };
        }

        try
        {
            var uri = new Uri(value);
            var host = uri.Host;
            var path = uri.AbsolutePath.Trim('/');
            var action = string.IsNullOrWhiteSpace(host) ? path : host;
            if (string.IsNullOrWhiteSpace(action))
            {
                var q = uri.Query.TrimStart('?');
                foreach (var part in q.Split('&', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    var kv = part.Split('=', 2);
                    if (kv.Length == 2 && kv[0].Equals("action", StringComparison.OrdinalIgnoreCase))
                    {
                        action = Uri.UnescapeDataString(kv[1]);
                        break;
                    }
                }
            }

            return action.ToLowerInvariant() switch
            {
                "open" => Action.Open,
                "register" or "pair" => Action.Register,
                "status" => Action.Status,
                "bluetooth" or "ble" => Action.Bluetooth,
                _ => Action.Open,
            };
        }
        catch
        {
            return Action.Open;
        }
    }

    public static void WriteActivationCommand(Action action)
    {
        Directory.CreateDirectory(BridgeConstants.ConfigDirectory);
        var token = action switch
        {
            Action.Register => "register",
            Action.Status => "status",
            Action.Bluetooth => "bluetooth",
            _ => "open",
        };
        File.WriteAllText(BridgeConstants.TrayCommandPath, token);
        try
        {
            using var ev = EventWaitHandle.OpenExisting(BridgeConstants.TrayActivateEventName);
            ev.Set();
        }
        catch
        {
            // Primary instance may not be running yet; command file is enough for next start.
        }
    }

    public static Action ConsumeActivationCommand()
    {
        try
        {
            if (!File.Exists(BridgeConstants.TrayCommandPath))
            {
                return Action.None;
            }

            var raw = File.ReadAllText(BridgeConstants.TrayCommandPath);
            File.Delete(BridgeConstants.TrayCommandPath);
            return Parse(raw);
        }
        catch
        {
            return Action.None;
        }
    }
}
