using Forge.PrinterBridge.Bluetooth;
using Forge.PrinterBridge.Bluetooth.Ipc;
using Forge.PrinterBridge.Bluetooth.Transport;
using Forge.PrinterBridge.Cloud;
using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Core.Services;
using Forge.PrinterBridge.Security;
using Forge.PrinterBridge.Shared.Enums;
using Microsoft.Extensions.Options;

namespace Forge.PrinterBridge.Service;

public sealed class PrinterBridgeWorker : BackgroundService
{
    private readonly ILogger<PrinterBridgeWorker> _logger;
    private readonly IPrintJobQueue _queue;
    private readonly IJobIdempotencyStore _idempotencyStore;
    private readonly IPrinterDiscovery _discovery;
    private readonly IPrinterTransport _transport;
    private readonly BluetoothCompanionTransport _bluetoothTransport;
    private readonly BluetoothPipeClient _bluetoothPipe;
    private readonly PrintJobProcessor _processor;
    private readonly CloudConnectionClient _cloud;
    private readonly ICredentialStore _credentials;
    private readonly BridgeHostOptions _options;

    private IReadOnlyList<ForgePrinter> _printers = Array.Empty<ForgePrinter>();
    private DateTimeOffset _lastPrinterRefresh = DateTimeOffset.MinValue;
    private DateTimeOffset _lastCompanionLaunchAttempt = DateTimeOffset.MinValue;

    public PrinterBridgeWorker(
        ILogger<PrinterBridgeWorker> logger,
        IPrintJobQueue queue,
        IJobIdempotencyStore idempotencyStore,
        IPrinterDiscovery discovery,
        IPrinterTransport transport,
        BluetoothCompanionTransport bluetoothTransport,
        BluetoothPipeClient bluetoothPipe,
        PrintJobProcessor processor,
        CloudConnectionClient cloud,
        ICredentialStore credentials,
        IOptions<BridgeHostOptions> options)
    {
        _logger = logger;
        _queue = queue;
        _idempotencyStore = idempotencyStore;
        _discovery = discovery;
        _transport = transport;
        _bluetoothTransport = bluetoothTransport;
        _bluetoothPipe = bluetoothPipe;
        _processor = processor;
        _cloud = cloud;
        _credentials = credentials;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Forge Printer Bridge Service starting");

        await _queue.InitializeAsync(stoppingToken);
        await _idempotencyStore.InitializeAsync(stoppingToken);
        await MaybeLaunchCompanionAsync(stoppingToken);
        await RefreshPrintersAsync(stoppingToken);

        if (await _credentials.ExistsAsync(stoppingToken))
        {
            try
            {
                await _cloud.ConnectAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Initial cloud connect failed; will retry");
            }
        }
        else
        {
            _logger.LogWarning("Bridge credentials missing. Pair the bridge before cloud jobs can flow.");
        }

        var pollDelay = TimeSpan.FromSeconds(Math.Max(1, _options.QueuePollIntervalSeconds));
        var refreshInterval = TimeSpan.FromSeconds(Math.Max(15, _options.PrinterRefreshIntervalSeconds));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (DateTimeOffset.UtcNow - _lastPrinterRefresh > refreshInterval)
                {
                    await MaybeLaunchCompanionAsync(stoppingToken);
                    await RefreshPrintersAsync(stoppingToken);
                }

                if (!_cloud.IsConnected && await _credentials.ExistsAsync(stoppingToken))
                {
                    try
                    {
                        await _cloud.ConnectAsync(stoppingToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Cloud reconnect attempt failed");
                    }
                }

                await ProcessNextJobAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Worker loop error");
            }

            await Task.Delay(pollDelay, stoppingToken);
        }

        await _cloud.DisconnectAsync();
        _logger.LogInformation("Forge Printer Bridge Service stopped");
    }

    private async Task RefreshPrintersAsync(CancellationToken cancellationToken)
    {
        var windows = await _discovery.DiscoverAsync(cancellationToken);
        var bluetooth = await _bluetoothTransport.ListCompanionPrintersAsync(cancellationToken);
        _printers = MergePrinters(windows, bluetooth);
        _cloud.UpdatePrinterSnapshot(_printers);
        _lastPrinterRefresh = DateTimeOffset.UtcNow;
        _logger.LogInformation(
            "Printer discovery complete: {Windows} Windows + {Bluetooth} Bluetooth = {Total}",
            windows.Count,
            bluetooth.Count,
            _printers.Count);
    }

    private static IReadOnlyList<ForgePrinter> MergePrinters(
        IReadOnlyList<ForgePrinter> windows,
        IReadOnlyList<ForgePrinter> bluetooth)
    {
        var merged = new List<ForgePrinter>(windows);
        foreach (var bt in bluetooth)
        {
            var exists = merged.Any(p =>
                string.Equals(p.Id, bt.Id, StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrWhiteSpace(bt.BluetoothSavedId)
                    && string.Equals(p.BluetoothSavedId, bt.BluetoothSavedId, StringComparison.OrdinalIgnoreCase))
                || (!string.IsNullOrWhiteSpace(bt.BluetoothDeviceId)
                    && string.Equals(p.BluetoothDeviceId, bt.BluetoothDeviceId, StringComparison.OrdinalIgnoreCase)));
            if (!exists)
            {
                merged.Add(bt);
            }
        }

        return merged;
    }

    private async Task ProcessNextJobAsync(CancellationToken cancellationToken)
    {
        var job = await _queue.DequeueNextAsync(cancellationToken);
        if (job is null)
        {
            return;
        }

        var existing = await _idempotencyStore.GetCompletedStatusAsync(job.JobId, cancellationToken);
        if (existing is not null)
        {
            _logger.LogInformation("Skipping already-completed job {JobId}", job.JobId);
            await _queue.UpdateStatusAsync(job.JobId, existing.Value, cancellationToken: cancellationToken);
            await _cloud.ReportJobStatusAsync(job.JobId, existing.Value, "Already completed", cancellationToken);
            return;
        }

        if (job.WaitingSince is not null
            && BluetoothReconnectPolicy.HasExceededWaitingTimeout(
                job.WaitingSince.Value,
                TimeSpan.FromMinutes(Math.Max(1, _options.BluetoothWaitingTimeoutMinutes))))
        {
            await _queue.UpdateStatusAsync(
                job.JobId,
                PrintJobStatus.Failed,
                "BLUETOOTH_WAIT_TIMEOUT",
                $"Printer remained unavailable longer than {_options.BluetoothWaitingTimeoutMinutes} minutes.",
                cancellationToken);
            await _cloud.ReportJobStatusAsync(job.JobId, PrintJobStatus.Failed, "Bluetooth waiting timeout", cancellationToken);
            return;
        }

        var printer = ResolvePrinter(job);
        if (printer is null)
        {
            await _queue.UpdateStatusAsync(job.JobId, PrintJobStatus.Failed, "PRINTER_NOT_FOUND", $"Printer {job.PrinterId} not found", cancellationToken);
            await _cloud.ReportJobStatusAsync(job.JobId, PrintJobStatus.Failed, "Printer not found", cancellationToken);
            return;
        }

        var isBluetooth = printer.TransportType == PrinterTransportType.BradyWebBluetooth
                          || printer.ConnectionType == PrinterConnectionType.Bluetooth;
        if (isBluetooth)
        {
            await MaybeLaunchCompanionAsync(cancellationToken, force: true);
            await EnsureBluetoothReconnectAsync(printer, cancellationToken);
        }

        var preStatus = isBluetooth
            ? PrintJobStatus.Transmitting
            : PrintJobStatus.Spooling;
        await _cloud.ReportJobStatusAsync(job.JobId, preStatus, cancellationToken: cancellationToken);

        var result = await _processor.ProcessAsync(printer, job, cancellationToken);
        await _cloud.ReportJobStatusAsync(job.JobId, result.Status, result.ErrorMessage, cancellationToken);
    }

    /// <summary>
    /// Ask the companion to reconnect a previously paired Brady printer before a BLE job.
    /// </summary>
    private async Task EnsureBluetoothReconnectAsync(ForgePrinter printer, CancellationToken cancellationToken)
    {
        var savedId = printer.BluetoothSavedId ?? printer.BluetoothDeviceId;
        if (string.IsNullOrWhiteSpace(savedId))
        {
            return;
        }

        try
        {
            if (!await _bluetoothPipe.TryConnectAsync(cancellationToken).ConfigureAwait(false))
            {
                _logger.LogDebug("Companion pipe unavailable; BLE reconnect deferred for {Printer}", printer.Id);
                return;
            }

            var status = await _bluetoothTransport.GetStatusAsync(printer, cancellationToken).ConfigureAwait(false);
            if (status.Ready)
            {
                return;
            }

            _logger.LogInformation(
                "Triggering Brady BLE reconnect for {Printer} using saved id",
                printer.Id);
            await _bluetoothPipe.ConnectAsync(
                printer.Id,
                deviceId: savedId,
                savedId: savedId,
                cancellationToken: cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "BLE reconnect before job failed for {Printer}; job may wait", printer.Id);
        }
    }

    private ForgePrinter? ResolvePrinter(PrintJob job)
    {
        return _printers.FirstOrDefault(p =>
                   MatchesPrinter(p, job.PrinterId)
                   || MatchesPrinter(p, job.QueueName))
               ?? _printers.FirstOrDefault(p => p.IsBradyI4311 && p.Ready)
               ?? _printers.FirstOrDefault(p => p.Ready);
    }

    private static bool MatchesPrinter(ForgePrinter printer, string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        return string.Equals(printer.Id, key, StringComparison.OrdinalIgnoreCase)
               || string.Equals(printer.QueueName, key, StringComparison.OrdinalIgnoreCase)
               || string.Equals(printer.BluetoothDeviceId, key, StringComparison.OrdinalIgnoreCase)
               || string.Equals(printer.BluetoothSavedId, key, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Optionally starts the companion if configured. Never force-kills an existing process.
    /// </summary>
    private async Task MaybeLaunchCompanionAsync(CancellationToken cancellationToken, bool force = false)
    {
        if (!_options.LaunchBluetoothCompanionIfMissing)
        {
            return;
        }

        if (await _bluetoothPipe.TryConnectAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        if (!force && DateTimeOffset.UtcNow - _lastCompanionLaunchAttempt < TimeSpan.FromMinutes(2))
        {
            return;
        }

        _lastCompanionLaunchAttempt = DateTimeOffset.UtcNow;
        var launched = BluetoothCompanionLauncher.TryStart(_options.BluetoothCompanionPath, out var detail);
        _logger.LogInformation("Bluetooth companion launch attempt: {Ok} — {Detail}", launched, detail);
        if (launched)
        {
            // Give Electron a moment to open the named pipe.
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken).ConfigureAwait(false);
        }
    }
}
