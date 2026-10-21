using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Forge.PrinterBridge.Bluetooth.Models;
using Forge.PrinterBridge.Shared.Constants;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Bluetooth.Ipc;

/// <summary>
/// Named-pipe JSON-line client for <c>\\.\pipe\ForgePrinterBridgeBluetooth</c> (spec §54–§55).
/// Pipe ACLs must allow only the Forge Printer Bridge Service, the authorized interactive user,
/// and the Bluetooth companion. Do not use localhost HTTP for this IPC channel.
/// </summary>
public sealed class BluetoothPipeClient : IAsyncDisposable
{
    public const string PipeName = "ForgePrinterBridgeBluetooth";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        PropertyNameCaseInsensitive = true
    };

    private readonly ILogger<BluetoothPipeClient> _logger;
    private readonly TimeSpan _defaultTimeout;
    private readonly SemaphoreSlim _sendGate = new(1, 1);
    private readonly ConcurrentDictionary<string, TaskCompletionSource<BluetoothIpcResponse>> _pending = new();

    private NamedPipeClientStream? _stream;
    private StreamReader? _reader;
    private StreamWriter? _writer;
    private CancellationTokenSource? _readCts;
    private Task? _readLoop;
    private readonly object _connectLock = new();

    public BluetoothPipeClient(
        ILogger<BluetoothPipeClient> logger,
        TimeSpan? defaultTimeout = null)
    {
        _logger = logger;
        _defaultTimeout = defaultTimeout ?? TimeSpan.FromSeconds(30);
    }

    /// <summary>Full path reserved in BridgeConstants (documentation / diagnostics).</summary>
    public static string PipePath => BridgeConstants.BluetoothNamedPipe;

    public bool IsConnected => _stream is { IsConnected: true };

    public async Task<bool> TryConnectAsync(CancellationToken cancellationToken = default, int timeoutMs = 2000)
    {
        if (IsConnected)
        {
            return true;
        }

        lock (_connectLock)
        {
            if (IsConnected)
            {
                return true;
            }
        }

        try
        {
            await EnsureConnectedAsync(cancellationToken, timeoutMs).ConfigureAwait(false);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "Bluetooth companion pipe not reachable");
            return false;
        }
    }

    public async Task<BluetoothIpcResponse> SendAsync(
        BluetoothIpcRequest request,
        CancellationToken cancellationToken = default,
        TimeSpan? timeout = null)
    {
        if (string.IsNullOrWhiteSpace(request.RequestId))
        {
            request.RequestId = Guid.NewGuid().ToString("N");
        }

        request.Timestamp ??= DateTimeOffset.UtcNow;

        await EnsureConnectedAsync(cancellationToken).ConfigureAwait(false);

        var tcs = new TaskCompletionSource<BluetoothIpcResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_pending.TryAdd(request.RequestId, tcs))
        {
            throw new InvalidOperationException($"Duplicate requestId {request.RequestId}");
        }

        var effectiveTimeout = timeout ?? _defaultTimeout;
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(effectiveTimeout);

        try
        {
            var line = JsonSerializer.Serialize(request, JsonOptions);
            await _sendGate.WaitAsync(timeoutCts.Token).ConfigureAwait(false);
            try
            {
                if (_writer is null)
                {
                    throw new IOException("Bluetooth pipe writer is not available.");
                }

                await _writer.WriteLineAsync(line.AsMemory(), timeoutCts.Token).ConfigureAwait(false);
                await _writer.FlushAsync(timeoutCts.Token).ConfigureAwait(false);
                _logger.LogDebug("Bluetooth IPC sent {Type} requestId={RequestId}", request.Type, request.RequestId);
            }
            finally
            {
                _sendGate.Release();
            }

            await using var reg = timeoutCts.Token.Register(() =>
                tcs.TrySetException(new TimeoutException(
                    $"Bluetooth IPC request {request.Type} ({request.RequestId}) timed out after {effectiveTimeout}.")));

            return await tcs.Task.ConfigureAwait(false);
        }
        catch
        {
            _pending.TryRemove(request.RequestId, out _);
            throw;
        }
    }

    public Task<BluetoothIpcResponse> BluetoothStatusAsync(
        string? printerId = null,
        CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest
        {
            Type = BluetoothIpcMessageTypes.BluetoothStatus,
            PrinterId = printerId
        }, cancellationToken);

    public Task<BluetoothIpcResponse> DiscoverAsync(CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest { Type = BluetoothIpcMessageTypes.Discover }, cancellationToken, TimeSpan.FromSeconds(60));

    public Task<BluetoothIpcResponse> ConnectAsync(
        string printerId,
        string? deviceId = null,
        string? savedId = null,
        CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest
        {
            Type = BluetoothIpcMessageTypes.Connect,
            PrinterId = printerId,
            DeviceId = deviceId,
            SavedId = savedId
        }, cancellationToken, TimeSpan.FromSeconds(60));

    public Task<BluetoothIpcResponse> DisconnectAsync(
        string? printerId = null,
        CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest
        {
            Type = BluetoothIpcMessageTypes.Disconnect,
            PrinterId = printerId
        }, cancellationToken);

    public Task<BluetoothIpcResponse> PrintAsync(
        string jobId,
        string printerId,
        string artifactPath,
        int copies,
        CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest
        {
            Type = BluetoothIpcMessageTypes.Print,
            JobId = jobId,
            PrinterId = printerId,
            ArtifactPath = artifactPath,
            Copies = copies
        }, cancellationToken, TimeSpan.FromMinutes(2));

    public Task<BluetoothIpcResponse> CancelAsync(
        string jobId,
        string? printerId = null,
        CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest
        {
            Type = BluetoothIpcMessageTypes.Cancel,
            JobId = jobId,
            PrinterId = printerId
        }, cancellationToken);

    public Task<BluetoothIpcResponse> GetPrinterInfoAsync(
        string? printerId = null,
        CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest
        {
            Type = BluetoothIpcMessageTypes.GetPrinterInfo,
            PrinterId = printerId
        }, cancellationToken);

    public Task<BluetoothIpcResponse> HeartbeatAsync(CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest { Type = BluetoothIpcMessageTypes.Heartbeat }, cancellationToken, TimeSpan.FromSeconds(10));

    public Task<BluetoothIpcResponse> ForgetAsync(
        string printerId,
        string? savedId = null,
        CancellationToken cancellationToken = default)
        => SendAsync(new BluetoothIpcRequest
        {
            Type = BluetoothIpcMessageTypes.Forget,
            PrinterId = printerId,
            SavedId = savedId
        }, cancellationToken);

    private async Task EnsureConnectedAsync(CancellationToken cancellationToken, int timeoutMs = 5000)
    {
        if (IsConnected && _writer is not null && _reader is not null)
        {
            return;
        }

        await _sendGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (IsConnected && _writer is not null && _reader is not null)
            {
                return;
            }

            await DisposeConnectionAsync().ConfigureAwait(false);

            // PipeName only — NamedPipeClientStream prepends \\.\pipe\ itself.
            // Spec §55: connect as current process identity (service or user); companion enforces ACL.
            var stream = new NamedPipeClientStream(
                serverName: ".",
                pipeName: PipeName,
                direction: PipeDirection.InOut,
                options: PipeOptions.Asynchronous);

            await stream.ConnectAsync(timeoutMs, cancellationToken).ConfigureAwait(false);
            stream.ReadMode = PipeTransmissionMode.Byte;

            _stream = stream;
            _reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
            _writer = new StreamWriter(stream, Encoding.UTF8, bufferSize: 4096, leaveOpen: true)
            {
                AutoFlush = true,
                NewLine = "\n"
            };

            _readCts = new CancellationTokenSource();
            _readLoop = Task.Run(() => ReadLoopAsync(_readCts.Token), CancellationToken.None);
            _logger.LogInformation("Connected to Bluetooth companion pipe {Pipe}", BridgeConstants.BluetoothNamedPipe);
        }
        finally
        {
            _sendGate.Release();
        }
    }

    private async Task ReadLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested && _reader is not null)
            {
                var line = await _reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                if (line is null)
                {
                    break;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                BluetoothIpcResponse? response;
                try
                {
                    response = JsonSerializer.Deserialize<BluetoothIpcResponse>(line, JsonOptions);
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Invalid Bluetooth IPC JSON line");
                    continue;
                }

                if (response is null)
                {
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(response.RequestId)
                    && _pending.TryRemove(response.RequestId, out var tcs))
                {
                    tcs.TrySetResult(response);
                }
                else
                {
                    _logger.LogDebug(
                        "Unsolicited Bluetooth IPC {Type} requestId={RequestId}",
                        response.Type,
                        response.RequestId);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // shutdown
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Bluetooth pipe read loop ended");
        }
        finally
        {
            foreach (var pair in _pending)
            {
                if (_pending.TryRemove(pair.Key, out var tcs))
                {
                    tcs.TrySetException(new IOException("Bluetooth companion pipe disconnected."));
                }
            }
        }
    }

    private async Task DisposeConnectionAsync()
    {
        if (_readCts is not null)
        {
            await _readCts.CancelAsync().ConfigureAwait(false);
            _readCts.Dispose();
            _readCts = null;
        }

        if (_readLoop is not null)
        {
            try
            {
                await Task.WhenAny(_readLoop, Task.Delay(1000)).ConfigureAwait(false);
            }
            catch
            {
                // ignore
            }

            _readLoop = null;
        }

        if (_writer is not null)
        {
            await _writer.DisposeAsync().ConfigureAwait(false);
            _writer = null;
        }

        if (_reader is not null)
        {
            _reader.Dispose();
            _reader = null;
        }

        if (_stream is not null)
        {
            await _stream.DisposeAsync().ConfigureAwait(false);
            _stream = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await DisposeConnectionAsync().ConfigureAwait(false);
        _sendGate.Dispose();
    }
}
