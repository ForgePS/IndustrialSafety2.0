using Forge.PrinterBridge.Bluetooth.Ipc;
using Forge.PrinterBridge.Bluetooth.Models;
using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Shared.Enums;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Bluetooth.Transport;

/// <summary>
/// Routes print jobs to the Electron Brady Web SDK companion over named pipes (spec §58).
/// Does not implement Brady BLE itself.
/// </summary>
public sealed class BluetoothCompanionTransport : IPrinterTransport
{
    private readonly BluetoothPipeClient _pipeClient;
    private readonly ILogger<BluetoothCompanionTransport> _logger;

    public BluetoothCompanionTransport(
        BluetoothPipeClient pipeClient,
        ILogger<BluetoothCompanionTransport> logger)
    {
        _pipeClient = pipeClient;
        _logger = logger;
    }

    public string Name => "BluetoothCompanionTransport";

    public bool Supports(ForgePrinter printer)
    {
        if (printer.TransportType == PrinterTransportType.BradyWebBluetooth)
        {
            return true;
        }

        if (printer.ConnectionType == PrinterConnectionType.Bluetooth)
        {
            return true;
        }

        // Cloud / companion wire value
        return string.Equals(printer.TransportType.ToCloudString(), "BRADY_WEB_BLUETOOTH", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<PrinterStatus> GetStatusAsync(ForgePrinter printer, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            var printerKey = ResolvePrinterKey(printer);
            BluetoothIpcResponse response;
            try
            {
                response = await _pipeClient.GetPrinterInfoAsync(printerKey, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                response = await _pipeClient.BluetoothStatusAsync(printerKey, cancellationToken).ConfigureAwait(false);
            }

            var info = response.Printer
                       ?? response.Printers?.FirstOrDefault(p =>
                           string.Equals(p.PrinterId, printerKey, StringComparison.OrdinalIgnoreCase)
                           || string.Equals(p.DeviceId, printer.BluetoothDeviceId, StringComparison.OrdinalIgnoreCase)
                           || string.Equals(p.SavedId, printer.BluetoothSavedId, StringComparison.OrdinalIgnoreCase))
                       ?? response.Printers?.FirstOrDefault();

            var statusWire = info?.Status ?? response.Status ?? "UNKNOWN";
            var btStatus = BluetoothStatusMapper.Parse(statusWire);
            var ready = info?.Ready
                        ?? btStatus is BluetoothStatus.Ready or BluetoothStatus.Connected;
            var online = info?.Online
                         ?? info?.Connected
                         ?? btStatus is BluetoothStatus.Ready or BluetoothStatus.Connected or BluetoothStatus.Printing;

            return new PrinterStatus
            {
                PrinterId = printer.Id,
                QueueName = printer.QueueName,
                Online = online,
                Connected = online && !BluetoothStatusMapper.IsTemporaryDisconnect(btStatus),
                Ready = ready && !BluetoothStatusMapper.IsTemporaryDisconnect(btStatus),
                Status = BluetoothStatusMapper.ToWire(btStatus),
                Detail = response.Message ?? response.ErrorMessage ?? response.SdkStatus
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Bluetooth status unavailable for {Printer}", printer.Id);
            return new PrinterStatus
            {
                PrinterId = printer.Id,
                QueueName = printer.QueueName,
                Online = false,
                Connected = false,
                Ready = false,
                Status = "UNAVAILABLE",
                Detail = ex.Message
            };
        }
    }

    public async Task<PrintResult> PrintAsync(
        ForgePrinter printer,
        PrintJob job,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (string.IsNullOrWhiteSpace(job.LocalArtifactPath) || !File.Exists(job.LocalArtifactPath))
        {
            return PrintResult.Fail("ARTIFACT_MISSING", "Local print artifact path is missing or invalid.");
        }

        try
        {
            await EnsureReadyForPrintAsync(printer, cancellationToken).ConfigureAwait(false);

            var printerKey = ResolvePrinterKey(printer);
            var response = await _pipeClient.PrintAsync(
                job.JobId,
                printerKey,
                job.LocalArtifactPath,
                Math.Clamp(job.Copies, 1, 99),
                cancellationToken).ConfigureAwait(false);

            var statusWire = response.Status;
            var btStatus = BluetoothStatusMapper.Parse(statusWire);
            if (BluetoothStatusMapper.IsTemporaryDisconnect(btStatus)
                || string.Equals(response.ErrorCode, "OUT_OF_RANGE", StringComparison.OrdinalIgnoreCase)
                || string.Equals(response.ErrorCode, "DISCONNECTED", StringComparison.OrdinalIgnoreCase)
                || string.Equals(statusWire, "OUT_OF_RANGE", StringComparison.OrdinalIgnoreCase)
                || string.Equals(statusWire, "DISCONNECTED", StringComparison.OrdinalIgnoreCase))
            {
                // Spec §21 — do not fail immediately when the printer is temporarily unreachable.
                return PrintResult.Fail(
                    response.ErrorCode ?? BluetoothStatusMapper.ToWire(btStatus),
                    response.ErrorMessage ?? response.Message ?? "Bluetooth printer temporarily unavailable.",
                    PrintJobStatus.WaitingForPrinter);
            }

            if (response.Success == true)
            {
                return PrintResult.Ok(PrintJobStatus.SentToPrinter, job.JobId);
            }

            return PrintResult.Fail(
                response.ErrorCode ?? "BLUETOOTH_PRINT_FAILED",
                response.ErrorMessage ?? response.Message ?? "Bluetooth companion reported print failure.");
        }
        catch (TimeoutException ex)
        {
            _logger.LogWarning(ex, "Bluetooth print timed out for job {JobId}", job.JobId);
            return PrintResult.Fail("BLUETOOTH_TIMEOUT", ex.Message, PrintJobStatus.WaitingForPrinter);
        }
        catch (IOException ex)
        {
            _logger.LogWarning(ex, "Bluetooth companion unreachable for job {JobId}", job.JobId);
            return PrintResult.Fail("COMPANION_UNAVAILABLE", ex.Message, PrintJobStatus.WaitingForPrinter);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Bluetooth print failed for job {JobId}", job.JobId);
            return PrintResult.Fail("BLUETOOTH_PRINT_FAILED", ex.Message);
        }
    }

    public async Task<PrintResult> CancelAsync(
        ForgePrinter printer,
        string jobId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        try
        {
            var response = await _pipeClient.CancelAsync(jobId, ResolvePrinterKey(printer), cancellationToken)
                .ConfigureAwait(false);

            if (response.Success == true)
            {
                return PrintResult.Ok(PrintJobStatus.Cancelled);
            }

            return PrintResult.Fail(
                response.ErrorCode ?? "CANCEL_FAILED",
                response.ErrorMessage ?? response.Message ?? "Cancel failed.");
        }
        catch (Exception ex)
        {
            return PrintResult.Fail("CANCEL_FAILED", ex.Message);
        }
    }

    /// <summary>
    /// Maps companion printer records into <see cref="ForgePrinter"/> entries for discovery merge.
    /// </summary>
    public async Task<IReadOnlyList<ForgePrinter>> ListCompanionPrintersAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await _pipeClient.TryConnectAsync(cancellationToken).ConfigureAwait(false))
            {
                return Array.Empty<ForgePrinter>();
            }

            BluetoothIpcResponse response;
            try
            {
                response = await _pipeClient.GetPrinterInfoAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                response = await _pipeClient.BluetoothStatusAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
            }

            var list = new List<BluetoothPrinterInfo>();
            if (response.Printers is { Count: > 0 })
            {
                list.AddRange(response.Printers);
            }
            else if (response.Printer is not null)
            {
                list.Add(response.Printer);
            }

            return list.Select(MapPrinter).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Unable to list Bluetooth companion printers");
            return Array.Empty<ForgePrinter>();
        }
    }

    private async Task EnsureReadyForPrintAsync(ForgePrinter printer, CancellationToken cancellationToken)
    {
        var status = await GetStatusAsync(printer, cancellationToken).ConfigureAwait(false);
        if (status.Ready)
        {
            return;
        }

        var savedId = printer.BluetoothSavedId ?? printer.BluetoothDeviceId;
        if (string.IsNullOrWhiteSpace(savedId))
        {
            return;
        }

        try
        {
            if (!await _pipeClient.TryConnectAsync(cancellationToken).ConfigureAwait(false))
            {
                return;
            }

            _logger.LogInformation("Requesting Brady BLE reconnect before print for {Printer}", printer.Id);
            await _pipeClient.ConnectAsync(
                ResolvePrinterKey(printer),
                deviceId: savedId,
                savedId: savedId,
                cancellationToken: cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Pre-print BLE reconnect did not complete for {Printer}", printer.Id);
        }
    }

    private static ForgePrinter MapPrinter(BluetoothPrinterInfo info)
    {
        var status = BluetoothStatusMapper.Parse(info.Status);
        var name = info.DisplayName ?? info.Name ?? info.PrinterId ?? info.DeviceId ?? "Brady Bluetooth";
        var id = info.PrinterId ?? info.SavedId ?? info.DeviceId ?? name;
        var ready = info.Ready ?? status is BluetoothStatus.Ready or BluetoothStatus.Connected;
        var online = info.Online ?? info.Connected ?? ready;

        return new ForgePrinter
        {
            Id = id,
            DisplayName = name,
            QueueName = id,
            DriverName = info.Model ?? "Brady Web Bluetooth",
            PortName = "BLUETOOTH",
            ConnectionType = PrinterConnectionType.Bluetooth,
            TransportType = PrinterTransportType.BradyWebBluetooth,
            BluetoothDeviceId = info.DeviceId,
            BluetoothSavedId = info.SavedId,
            IsLocal = true,
            IsNetwork = false,
            IsVirtual = false,
            IsBradyI4311 = info.IsBradyI4311
                           ?? ((info.Model?.Contains("i4311", StringComparison.OrdinalIgnoreCase) ?? false)
                               || name.Contains("i4311", StringComparison.OrdinalIgnoreCase)),
            Online = online && !BluetoothStatusMapper.IsTemporaryDisconnect(status),
            Ready = ready && !BluetoothStatusMapper.IsTemporaryDisconnect(status),
            StatusText = BluetoothStatusMapper.ToWire(status),
            Dpi = info.Dpi is > 0 ? info.Dpi.Value : 300
        };
    }

    private static string ResolvePrinterKey(ForgePrinter printer)
        => !string.IsNullOrWhiteSpace(printer.Id) ? printer.Id
            : !string.IsNullOrWhiteSpace(printer.BluetoothSavedId) ? printer.BluetoothSavedId!
            : !string.IsNullOrWhiteSpace(printer.BluetoothDeviceId) ? printer.BluetoothDeviceId!
            : printer.QueueName;
}
