using Forge.PrinterBridge.Shared.Constants;

namespace Forge.PrinterBridge.Cloud;

public sealed class BridgeCloudOptions
{
    public const string SectionName = "Cloud";

    /// <summary>HTTPS API base URL, e.g. https://api.forgepublicsafety.com</summary>
    public string ApiBaseUrl { get; set; } = BridgeConstants.DefaultCloudApiBaseUrl;

    /// <summary>WSS path appended to host, e.g. /printer-bridge/v1/connect</summary>
    public string WebSocketPath { get; set; } = BridgeConstants.DefaultWebSocketPath;

    /// <summary>Optional full WSS URL override. When set, takes precedence over ApiBaseUrl + WebSocketPath.</summary>
    public string? WebSocketUrl { get; set; }

    public int HeartbeatIntervalSeconds { get; set; } = BridgeConstants.HeartbeatIntervalSeconds;

    /// <summary>Public bridge consume-pairing path (device auth, not Cognito).</summary>
    public string PairingPath { get; set; } = "/api/v1/printer-bridge/v1/pair";

    /// <summary>When true, use HTTPS poll for jobs (Phase 1). WebSocket remains optional.</summary>
    public bool PreferHttpPolling { get; set; } = true;

    public int JobPollIntervalSeconds { get; set; } = 3;

    public string ResolveWebSocketUrl()
    {
        if (!string.IsNullOrWhiteSpace(WebSocketUrl))
        {
            return WebSocketUrl;
        }

        var baseUri = new Uri(ApiBaseUrl.TrimEnd('/') + "/");
        var builder = new UriBuilder(baseUri)
        {
            Scheme = baseUri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) ? "ws" : "wss",
            Path = WebSocketPath
        };
        return builder.Uri.ToString();
    }
}
