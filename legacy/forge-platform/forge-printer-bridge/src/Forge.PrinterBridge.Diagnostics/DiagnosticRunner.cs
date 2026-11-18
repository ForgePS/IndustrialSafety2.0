using System.Printing;
using Forge.PrinterBridge.Bluetooth.Ipc;
using Forge.PrinterBridge.Bluetooth.Models;
using Forge.PrinterBridge.Cloud;
using Forge.PrinterBridge.Security;
using Forge.PrinterBridge.Shared.Constants;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Forge.PrinterBridge.Diagnostics;

public sealed class DiagnosticRunner : IDiagnosticRunner
{
    private readonly BridgeCloudOptions _cloudOptions;
    private readonly ICredentialStore _credentialStore;
    private readonly ILogger<DiagnosticRunner> _logger;
    private readonly BluetoothPipeClient? _bluetoothPipe;

    public DiagnosticRunner(
        IOptions<BridgeCloudOptions> cloudOptions,
        ICredentialStore credentialStore,
        ILogger<DiagnosticRunner> logger,
        BluetoothPipeClient? bluetoothPipe = null)
    {
        _cloudOptions = cloudOptions.Value;
        _credentialStore = credentialStore;
        _logger = logger;
        _bluetoothPipe = bluetoothPipe;
    }

    public async Task<IReadOnlyList<DiagnosticResult>> RunAsync(CancellationToken cancellationToken = default)
    {
        var pipe = _bluetoothPipe ?? new BluetoothPipeClient(NullLogger<BluetoothPipeClient>.Instance);
        var results = new List<DiagnosticResult>
        {
            CheckCloudUrlConfigured(),
            await CheckCredentialsPresentAsync(cancellationToken),
            CheckSpoolerReachable(),
            await CheckBluetoothPipeAsync(pipe, cancellationToken),
            await CheckBluetoothHeartbeatAsync(pipe, cancellationToken),
            await CheckBradySdkStatusAsync(pipe, cancellationToken)
        };

        _logger.LogInformation(
            "Diagnostics finished: {Passed}/{Total} passed",
            results.Count(r => r.Passed),
            results.Count);

        return results;
    }

    private DiagnosticResult CheckCloudUrlConfigured()
    {
        var configured = !string.IsNullOrWhiteSpace(_cloudOptions.ApiBaseUrl)
                         || !string.IsNullOrWhiteSpace(_cloudOptions.WebSocketUrl);

        return new DiagnosticResult
        {
            Name = "Cloud URL configured",
            Passed = configured,
            Detail = configured
                ? $"API={_cloudOptions.ApiBaseUrl}; WSS={_cloudOptions.ResolveWebSocketUrl()}"
                : "Cloud:ApiBaseUrl / Cloud:WebSocketUrl is not configured."
        };
    }

    private async Task<DiagnosticResult> CheckCredentialsPresentAsync(CancellationToken cancellationToken)
    {
        var exists = await _credentialStore.ExistsAsync(cancellationToken);
        BridgeCredentials? credentials = null;
        if (exists)
        {
            credentials = await _credentialStore.LoadAsync(cancellationToken);
        }

        var passed = exists
                     && credentials is not null
                     && !string.IsNullOrWhiteSpace(credentials.AccessToken)
                     && !string.IsNullOrWhiteSpace(credentials.BridgeId);

        return new DiagnosticResult
        {
            Name = "Credentials present",
            Passed = passed,
            Detail = passed
                ? $"DPAPI store present for bridge {credentials!.BridgeId}"
                : "Device token / bridge credentials not found in DPAPI store."
        };
    }

    private static DiagnosticResult CheckSpoolerReachable()
    {
        try
        {
            using var server = new LocalPrintServer();
            _ = server.GetPrintQueues(new[]
            {
                EnumeratedPrintQueueTypes.Local,
                EnumeratedPrintQueueTypes.Connections
            });

            return new DiagnosticResult
            {
                Name = "Windows spooler reachable",
                Passed = true,
                Detail = $"LocalPrintServer OK on {Environment.MachineName}"
            };
        }
        catch (Exception ex)
        {
            return new DiagnosticResult
            {
                Name = "Windows spooler reachable",
                Passed = false,
                Detail = ex.Message
            };
        }
    }

    private static async Task<DiagnosticResult> CheckBluetoothPipeAsync(
        BluetoothPipeClient pipe,
        CancellationToken cancellationToken)
    {
        try
        {
            var ok = await pipe.TryConnectAsync(cancellationToken, timeoutMs: 1500);
            return new DiagnosticResult
            {
                Name = "Bluetooth companion pipe reachable",
                Passed = ok,
                Detail = ok
                    ? $"Connected to {BridgeConstants.BluetoothNamedPipe}"
                    : $"Unable to connect to {BridgeConstants.BluetoothNamedPipe}. Is ForgePrinterBridge.Bluetooth.exe running?"
            };
        }
        catch (Exception ex)
        {
            return new DiagnosticResult
            {
                Name = "Bluetooth companion pipe reachable",
                Passed = false,
                Detail = ex.Message
            };
        }
    }

    private static async Task<DiagnosticResult> CheckBluetoothHeartbeatAsync(
        BluetoothPipeClient pipe,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!await pipe.TryConnectAsync(cancellationToken, timeoutMs: 1500))
            {
                return new DiagnosticResult
                {
                    Name = "Bluetooth companion heartbeat",
                    Passed = false,
                    Detail = "Skipped — companion pipe not reachable."
                };
            }

            var response = await pipe.HeartbeatAsync(cancellationToken);
            var ok = response.Success != false
                     && !string.Equals(response.Type, BluetoothIpcMessageTypes.Error, StringComparison.OrdinalIgnoreCase);
            return new DiagnosticResult
            {
                Name = "Bluetooth companion heartbeat",
                Passed = ok,
                Detail = ok
                    ? $"HEARTBEAT ok status={response.Status ?? "OK"}"
                    : response.ErrorMessage ?? response.Message ?? "Heartbeat failed."
            };
        }
        catch (Exception ex)
        {
            return new DiagnosticResult
            {
                Name = "Bluetooth companion heartbeat",
                Passed = false,
                Detail = ex.Message
            };
        }
    }

    private static async Task<DiagnosticResult> CheckBradySdkStatusAsync(
        BluetoothPipeClient pipe,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!await pipe.TryConnectAsync(cancellationToken, timeoutMs: 1500))
            {
                return new DiagnosticResult
                {
                    Name = "Brady SDK status (via companion)",
                    Passed = false,
                    Detail = "Skipped — companion pipe not reachable."
                };
            }

            var response = await pipe.GetPrinterInfoAsync(cancellationToken: cancellationToken);
            var sdk = response.SdkStatus ?? response.Status ?? response.Message;
            var ok = response.Success != false
                     && !string.Equals(response.Type, BluetoothIpcMessageTypes.Error, StringComparison.OrdinalIgnoreCase);
            return new DiagnosticResult
            {
                Name = "Brady SDK status (via companion)",
                Passed = ok,
                Detail = string.IsNullOrWhiteSpace(sdk)
                    ? (ok ? "GET_PRINTER_INFO succeeded (no sdkStatus field)." : "GET_PRINTER_INFO failed.")
                    : sdk
            };
        }
        catch (Exception ex)
        {
            return new DiagnosticResult
            {
                Name = "Brady SDK status (via companion)",
                Passed = false,
                Detail = ex.Message
            };
        }
    }
}
