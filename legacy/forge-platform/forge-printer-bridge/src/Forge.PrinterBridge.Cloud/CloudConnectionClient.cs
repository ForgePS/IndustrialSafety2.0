using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Mapping;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Security;
using Forge.PrinterBridge.Shared.Constants;
using Forge.PrinterBridge.Shared.Dtos;
using Forge.PrinterBridge.Shared.Enums;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Forge.PrinterBridge.Cloud;

public sealed class CloudConnectionClient : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly BridgeCloudOptions _options;
    private readonly ICredentialStore _credentialStore;
    private readonly IPrintJobQueue _queue;
    private readonly ArtifactDownloader _artifactDownloader;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<CloudConnectionClient> _logger;

    private ClientWebSocket? _socket;
    private CancellationTokenSource? _loopCts;
    private Task? _receiveLoop;
    private Task? _heartbeatLoop;
    private BridgeStatus _status = BridgeStatus.Offline;
    private IReadOnlyList<ForgePrinter> _printers = Array.Empty<ForgePrinter>();
    private bool _httpConnected;

    public CloudConnectionClient(
        IOptions<BridgeCloudOptions> options,
        ICredentialStore credentialStore,
        IPrintJobQueue queue,
        ArtifactDownloader artifactDownloader,
        IHttpClientFactory httpClientFactory,
        ILogger<CloudConnectionClient> logger)
    {
        _options = options.Value;
        _credentialStore = credentialStore;
        _queue = queue;
        _artifactDownloader = artifactDownloader;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public BridgeStatus Status => _status;
    public bool IsConnected => _httpConnected || _socket?.State == WebSocketState.Open;
    public string? LastError { get; private set; }
    public event Func<PrintJob, Task>? JobEnqueued;
    public event Func<string, PrintJobStatus, string?, Task>? JobStatusReported;

    public void UpdatePrinterSnapshot(IReadOnlyList<ForgePrinter> printers)
        => _printers = printers;

    public async Task<bool> PairAsync(string pairingCode, CancellationToken cancellationToken = default)
    {
        var client = _httpClientFactory.CreateClient("ForgeCloud");
        var url = $"{_options.ApiBaseUrl.TrimEnd('/')}{_options.PairingPath}";
        var deviceId = $"DEVICE-{Environment.MachineName}-{Guid.NewGuid():N}".ToUpperInvariant();
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    pairingCode,
                    deviceId,
                    computerName = Environment.MachineName,
                    osVersion = Environment.OSVersion.ToString(),
                    bridgeVersion = "1.0.0",
                    name = Environment.MachineName
                }, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            LastError = $"Pairing failed: {(int)response.StatusCode} {response.ReasonPhrase}";
            _logger.LogWarning("Pairing failed: {Status}", response.StatusCode);
            return false;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = doc.RootElement;
        var data = root.TryGetProperty("data", out var dataEl) ? dataEl : root;
        var payload = JsonSerializer.Deserialize<PairingResponse>(data.GetRawText(), JsonOptions);
        if (payload is null || string.IsNullOrWhiteSpace(payload.AccessToken))
        {
            LastError = "Pairing response missing access token.";
            return false;
        }

        await _credentialStore.SaveAsync(new BridgeCredentials
        {
            BridgeId = payload.BridgeId,
            DeviceId = string.IsNullOrWhiteSpace(payload.DeviceId) ? deviceId : payload.DeviceId,
            AccessToken = payload.AccessToken,
            TenantId = payload.TenantId,
            PairingCode = pairingCode
        }, cancellationToken);

        _status = BridgeStatus.Online;
        _logger.LogInformation("Bridge paired successfully as {BridgeId}", payload.BridgeId);
        return true;
    }

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        var credentials = await _credentialStore.LoadAsync(cancellationToken);
        if (credentials is null || string.IsNullOrWhiteSpace(credentials.AccessToken))
        {
            _status = BridgeStatus.Pairing;
            LastError = "No bridge credentials. Pairing required.";
            throw new InvalidOperationException(LastError);
        }

        await DisconnectAsync();

        if (_options.PreferHttpPolling)
        {
            _httpConnected = true;
            _status = BridgeStatus.Online;
            LastError = null;
            _loopCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            _heartbeatLoop = Task.Run(() => HttpHeartbeatLoopAsync(credentials, _loopCts.Token), CancellationToken.None);
            _receiveLoop = Task.Run(() => HttpJobPollLoopAsync(credentials, _loopCts.Token), CancellationToken.None);
            _logger.LogInformation("Connected to Forge cloud via HTTPS poll for device {DeviceId}", credentials.DeviceId);
            return;
        }

        _socket = new ClientWebSocket();
        _socket.Options.SetRequestHeader("Authorization", $"Bearer {credentials.AccessToken}");
        _socket.Options.SetRequestHeader("X-Forge-Bridge-Id", credentials.BridgeId);
        _socket.Options.SetRequestHeader("X-Forge-Device-Id", credentials.DeviceId);
        _socket.Options.SetRequestHeader("X-Bridge-Device-Id", credentials.DeviceId);
        _socket.Options.SetRequestHeader("X-Bridge-Access-Token", credentials.AccessToken);

        var wsUrl = _options.ResolveWebSocketUrl();
        _logger.LogInformation("Connecting to Forge cloud at {Url}", wsUrl);
        await _socket.ConnectAsync(new Uri(wsUrl), cancellationToken);

        var handshake = new BridgeHandshake
        {
            BridgeId = credentials.BridgeId,
            DeviceId = credentials.DeviceId,
            Version = "1.0.0",
            ComputerName = Environment.MachineName,
            OsVersion = Environment.OSVersion.ToString()
        };
        await SendJsonAsync(handshake, cancellationToken);
        await SendEventAsync("bridge.connected", credentials.BridgeId, cancellationToken: cancellationToken);

        _status = BridgeStatus.Online;
        LastError = null;
        _loopCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _receiveLoop = Task.Run(() => ReceiveLoopAsync(_loopCts.Token), CancellationToken.None);
        _heartbeatLoop = Task.Run(() => HeartbeatLoopAsync(credentials.BridgeId, _loopCts.Token), CancellationToken.None);
    }

    public async Task ReportJobStatusAsync(
        string jobId,
        PrintJobStatus status,
        string? message = null,
        CancellationToken cancellationToken = default)
    {
        if (_options.PreferHttpPolling || _httpConnected)
        {
            var credentials = await _credentialStore.LoadAsync(cancellationToken);
            if (credentials is not null)
            {
                await PostJobStatusHttpAsync(credentials, jobId, status, message, cancellationToken);
            }
        }
        else
        {
            var eventName = status switch
            {
                PrintJobStatus.Received => "print.job.received",
                PrintJobStatus.WaitingForPrinter => "print.job.waiting",
                PrintJobStatus.Spooling => "print.job.spooling",
                PrintJobStatus.Transmitting or PrintJobStatus.Printing => "print.job.transmitting",
                PrintJobStatus.Completed or PrintJobStatus.SentToPrinter => "print.job.completed",
                PrintJobStatus.Failed => "print.job.failed",
                _ => "bridge.status"
            };

            await SendJsonAsync(new CloudEventEnvelope
            {
                Event = eventName,
                JobId = jobId,
                Status = status.ToString(),
                Message = message,
                Timestamp = DateTimeOffset.UtcNow
            }, cancellationToken);
        }

        if (JobStatusReported is not null)
        {
            await JobStatusReported.Invoke(jobId, status, message);
        }
    }

    public async Task DisconnectAsync()
    {
        if (_loopCts is not null)
        {
            _loopCts.Cancel();
            _loopCts.Dispose();
            _loopCts = null;
        }

        if (_receiveLoop is not null)
        {
            try { await _receiveLoop; } catch { /* ignore shutdown races */ }
            _receiveLoop = null;
        }

        if (_heartbeatLoop is not null)
        {
            try { await _heartbeatLoop; } catch { /* ignore shutdown races */ }
            _heartbeatLoop = null;
        }

        if (_socket is not null)
        {
            try
            {
                if (_socket.State == WebSocketState.Open)
                {
                    await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "shutdown", CancellationToken.None);
                }
            }
            catch
            {
                // ignore
            }

            _socket.Dispose();
            _socket = null;
        }

        _httpConnected = false;
        _status = BridgeStatus.Offline;
    }

    private async Task HttpHeartbeatLoopAsync(BridgeCredentials credentials, CancellationToken cancellationToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(5, _options.HeartbeatIntervalSeconds));
        var client = _httpClientFactory.CreateClient("ForgeCloud");
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var ready = _printers.Count(p => p.Ready);
                var offline = _printers.Count(p => !p.Online);
                var url = $"{_options.ApiBaseUrl.TrimEnd('/')}/api/v1/printer-bridge/v1/bridges/{Uri.EscapeDataString(credentials.DeviceId)}/heartbeat";
                using var request = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = new StringContent(
                        JsonSerializer.Serialize(new
                        {
                            status = "ONLINE",
                            version = "1.0.0",
                            printers = new { total = _printers.Count, ready, offline }
                        }, JsonOptions),
                        Encoding.UTF8,
                        "application/json")
                };
                ApplyBridgeHeaders(request, credentials);
                using var response = await client.SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    LastError = $"Heartbeat failed: {(int)response.StatusCode}";
                    _logger.LogWarning("HTTP heartbeat failed: {Status}", response.StatusCode);
                }

                // Sync discovered printers periodically with heartbeat cycle.
                await UpsertPrintersHttpAsync(client, credentials, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LastError = ex.Message;
                _logger.LogWarning(ex, "HTTP heartbeat failed");
            }

            await Task.Delay(interval, cancellationToken);
        }
    }

    private async Task HttpJobPollLoopAsync(BridgeCredentials credentials, CancellationToken cancellationToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(1, _options.JobPollIntervalSeconds));
        var client = _httpClientFactory.CreateClient("ForgeCloud");
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var url = $"{_options.ApiBaseUrl.TrimEnd('/')}/api/v1/printer-bridge/v1/bridges/{Uri.EscapeDataString(credentials.DeviceId)}/jobs?limit=10";
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                ApplyBridgeHeaders(request, credentials);
                using var response = await client.SendAsync(request, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                    using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                    var root = doc.RootElement;
                    var data = root.TryGetProperty("data", out var dataEl) ? dataEl : root;
                    JsonElement jobsEl = default;
                    var hasJobs = false;
                    if (data.ValueKind == JsonValueKind.Array)
                    {
                        jobsEl = data;
                        hasJobs = true;
                    }
                    else if (data.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                    {
                        jobsEl = items;
                        hasJobs = true;
                    }
                    else if (data.TryGetProperty("jobs", out var jobs) && jobs.ValueKind == JsonValueKind.Array)
                    {
                        jobsEl = jobs;
                        hasJobs = true;
                    }

                    if (hasJobs)
                    {
                        foreach (var item in jobsEl.EnumerateArray())
                        {
                            await EnqueueClaimedJobAsync(item, cancellationToken);
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LastError = ex.Message;
                _logger.LogWarning(ex, "HTTP job poll failed");
            }

            await Task.Delay(interval, cancellationToken);
        }
    }

    private async Task UpsertPrintersHttpAsync(
        HttpClient client,
        BridgeCredentials credentials,
        CancellationToken cancellationToken)
    {
        if (_printers.Count == 0) return;
        var url = $"{_options.ApiBaseUrl.TrimEnd('/')}/api/v1/printer-bridge/v1/bridges/{Uri.EscapeDataString(credentials.DeviceId)}/printers";
        var body = _printers.Select(p =>
        {
            var isBluetooth = p.TransportType == PrinterTransportType.BradyWebBluetooth
                              || p.ConnectionType == PrinterConnectionType.Bluetooth;
            var deviceIdentifier = isBluetooth
                ? (p.BluetoothSavedId ?? p.BluetoothDeviceId ?? p.Id ?? p.QueueName)
                : p.QueueName;
            return new
            {
                deviceIdentifier,
                name = string.IsNullOrWhiteSpace(p.DisplayName)
                    ? (isBluetooth ? "Mobile Brady i4311" : p.QueueName)
                    : p.DisplayName,
                displayName = p.DisplayName,
                manufacturer = p.IsBradyI4311 || isBluetooth ? "Brady" : null,
                model = p.IsBradyI4311 || isBluetooth ? "i4311" : p.DriverName,
                connectionType = p.ConnectionType switch
                {
                    PrinterConnectionType.Usb => "USB",
                    PrinterConnectionType.Ethernet => "ETHERNET",
                    PrinterConnectionType.WiFi => "WIFI",
                    PrinterConnectionType.Bluetooth => "BLUETOOTH_BLE",
                    _ => isBluetooth ? "BLUETOOTH_BLE" : "USB"
                },
                transportType = isBluetooth
                    ? "BRADY_WEB_BLUETOOTH"
                    : p.TransportType.ToCloudString(),
                windowsQueueName = isBluetooth ? null : p.QueueName,
                bluetoothDeviceId = p.BluetoothDeviceId,
                bluetoothSavedId = p.BluetoothSavedId,
                dpi = p.Dpi > 0 ? p.Dpi : 300,
                supportsBitmap = true,
                supportsCut = false,
                supportsFeed = !isBluetooth,
                supportsMultipleCopies = true,
                online = p.Online,
                connected = p.Online || p.Ready,
                ready = p.Ready
            };
        }).ToArray();

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json")
        };
        ApplyBridgeHeaders(request, credentials);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogDebug("Printer upsert returned {Status}", response.StatusCode);
        }
    }

    private async Task PostJobStatusHttpAsync(
        BridgeCredentials credentials,
        string jobId,
        PrintJobStatus status,
        string? message,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient("ForgeCloud");
        var url = $"{_options.ApiBaseUrl.TrimEnd('/')}/api/v1/printer-bridge/v1/jobs/{Uri.EscapeDataString(jobId)}/status";
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    status = MapStatusToCloud(status),
                    message
                }, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };
        ApplyBridgeHeaders(request, credentials);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Job status POST failed for {JobId}: {Status}", jobId, response.StatusCode);
        }
    }

    private async Task EnqueueClaimedJobAsync(JsonElement item, CancellationToken cancellationToken)
    {
        PrintJobPayload? payload = null;
        try
        {
            payload = JsonSerializer.Deserialize<PrintJobPayload>(item.GetRawText(), JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse claimed print job");
            return;
        }

        if (payload is null || string.IsNullOrWhiteSpace(payload.JobId))
        {
            return;
        }

        if (await _queue.GetByIdAsync(payload.JobId, cancellationToken) is not null)
        {
            return;
        }

        string? localPath = null;
        if (payload.Render is not null
            && !string.IsNullOrWhiteSpace(payload.Render.ArtifactUrl)
            && !string.IsNullOrWhiteSpace(payload.Render.Sha256))
        {
            localPath = await _artifactDownloader.DownloadAndVerifyAsync(
                payload.Render.ArtifactUrl,
                payload.Render.Sha256,
                payload.JobId,
                cancellationToken);
        }

        var job = PrintJobMapper.FromPayload(payload, localPath);
        await _queue.EnqueueAsync(job, cancellationToken);
        await ReportJobStatusAsync(job.JobId, PrintJobStatus.Received, cancellationToken: cancellationToken);
        if (JobEnqueued is not null)
        {
            await JobEnqueued.Invoke(job);
        }
    }

    private static void ApplyBridgeHeaders(HttpRequestMessage request, BridgeCredentials credentials)
    {
        request.Headers.TryAddWithoutValidation("X-Bridge-Device-Id", credentials.DeviceId);
        request.Headers.TryAddWithoutValidation("X-Bridge-Access-Token", credentials.AccessToken);
    }

    private static string MapStatusToCloud(PrintJobStatus status) => status switch
    {
        PrintJobStatus.Received => "RECEIVED",
        PrintJobStatus.WaitingForPrinter => "WAITING_FOR_PRINTER",
        PrintJobStatus.Spooling => "SPOOLING",
        PrintJobStatus.Transmitting => "TRANSMITTING",
        PrintJobStatus.Printing => "PRINTING",
        PrintJobStatus.Completed => "COMPLETED",
        PrintJobStatus.SentToPrinter => "SENT_TO_PRINTER",
        PrintJobStatus.Failed => "FAILED",
        PrintJobStatus.Cancelled => "CANCELLED",
        _ => status.ToString().ToUpperInvariant()
    };

    private async Task HeartbeatLoopAsync(string bridgeId, CancellationToken cancellationToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(5, _options.HeartbeatIntervalSeconds));
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var ready = _printers.Count(p => p.Ready);
                var offline = _printers.Count(p => !p.Online);
                var heartbeat = new HeartbeatPayload
                {
                    BridgeId = bridgeId,
                    Status = _status.ToString().ToUpperInvariant(),
                    Version = "1.0.0",
                    Printers = new HeartbeatPrinterCounts
                    {
                        Total = _printers.Count,
                        Ready = ready,
                        Offline = offline
                    },
                    Timestamp = DateTimeOffset.UtcNow
                };
                await SendJsonAsync(heartbeat, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LastError = ex.Message;
                _logger.LogWarning(ex, "Heartbeat failed");
            }

            await Task.Delay(interval, cancellationToken);
        }
    }

    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[64 * 1024];
        var message = new MemoryStream();

        while (!cancellationToken.IsCancellationRequested && _socket?.State == WebSocketState.Open)
        {
            try
            {
                message.SetLength(0);
                WebSocketReceiveResult result;
                do
                {
                    result = await _socket.ReceiveAsync(buffer, cancellationToken);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        _status = BridgeStatus.Offline;
                        return;
                    }

                    message.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                var json = Encoding.UTF8.GetString(message.ToArray());
                await HandleMessageAsync(json, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                _logger.LogWarning(ex, "WebSocket receive failed");
                _status = BridgeStatus.Degraded;
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
            }
        }
    }

    private async Task HandleMessageAsync(string json, CancellationToken cancellationToken)
    {
        var envelope = JsonSerializer.Deserialize<CloudEventEnvelope>(json, JsonOptions);
        if (envelope is null || string.IsNullOrWhiteSpace(envelope.Event))
        {
            return;
        }

        switch (envelope.Event)
        {
            case "print.job.available":
                await HandlePrintJobAvailableAsync(envelope, cancellationToken);
                break;
            case "print.job.cancel":
                if (!string.IsNullOrWhiteSpace(envelope.JobId))
                {
                    await _queue.UpdateStatusAsync(envelope.JobId, PrintJobStatus.Cancelled, "CANCELLED", "Cancelled by cloud", cancellationToken);
                }
                break;
            case "printer.refresh":
            case "bridge.config.updated":
            case "bridge.update.available":
            case "bridge.restart_requested":
                _logger.LogInformation("Received cloud event {Event}", envelope.Event);
                break;
            default:
                _logger.LogDebug("Ignoring unknown cloud event {Event}", envelope.Event);
                break;
        }
    }

    private async Task HandlePrintJobAvailableAsync(CloudEventEnvelope envelope, CancellationToken cancellationToken)
    {
        var payload = envelope.Payload;
        if (payload is null || string.IsNullOrWhiteSpace(payload.JobId))
        {
            _logger.LogWarning("print.job.available missing payload");
            return;
        }

        if (await _queue.GetByIdAsync(payload.JobId, cancellationToken) is not null)
        {
            _logger.LogInformation("Job {JobId} already present locally", payload.JobId);
            return;
        }

        string? localPath = null;
        if (payload.Render is not null
            && !string.IsNullOrWhiteSpace(payload.Render.ArtifactUrl)
            && !string.IsNullOrWhiteSpace(payload.Render.Sha256))
        {
            localPath = await _artifactDownloader.DownloadAndVerifyAsync(
                payload.Render.ArtifactUrl,
                payload.Render.Sha256,
                payload.JobId,
                cancellationToken);
        }

        var job = PrintJobMapper.FromPayload(payload, localPath);
        await _queue.EnqueueAsync(job, cancellationToken);
        await ReportJobStatusAsync(job.JobId, PrintJobStatus.Received, cancellationToken: cancellationToken);

        if (JobEnqueued is not null)
        {
            await JobEnqueued.Invoke(job);
        }
    }

    private async Task SendEventAsync(string eventName, string bridgeId, CancellationToken cancellationToken)
    {
        await SendJsonAsync(new CloudEventEnvelope
        {
            Event = eventName,
            Status = bridgeId,
            Timestamp = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    private async Task SendJsonAsync<T>(T payload, CancellationToken cancellationToken)
    {
        if (_socket is null || _socket.State != WebSocketState.Open)
        {
            return;
        }

        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, JsonOptions));
        await _socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, cancellationToken);
    }

    public async ValueTask DisposeAsync() => await DisconnectAsync();

    private sealed class PairingResponse
    {
        public string BridgeId { get; set; } = string.Empty;
        public string DeviceId { get; set; } = string.Empty;
        public string AccessToken { get; set; } = string.Empty;
        public string? TenantId { get; set; }
    }
}
