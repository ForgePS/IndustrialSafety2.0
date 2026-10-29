using Forge.PrinterBridge.Bluetooth.Ipc;
using Forge.PrinterBridge.Bluetooth.Transport;
using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Core.Services;
using Forge.PrinterBridge.Shared.Enums;
using Forge.PrinterBridge.Windows.Transport;
using Microsoft.Extensions.Logging.Abstractions;

namespace Forge.PrinterBridge.Core.Tests;

public class PrinterTransportRouterTests
{
    [Fact]
    public void Supports_SelectsSpoolerForWindowsQueues()
    {
        var router = CreateRouter();
        var printer = new ForgePrinter
        {
            Id = "win-1",
            QueueName = "Brady i4311",
            TransportType = PrinterTransportType.WindowsSpooler,
            ConnectionType = PrinterConnectionType.Usb
        };

        Assert.True(router.Supports(printer));
        Assert.Equal("WindowsSpoolerTransport", router.Resolve(printer).Name);
    }

    [Fact]
    public void Supports_SelectsBluetoothForBradyWebBluetooth()
    {
        var router = CreateRouter();
        var printer = new ForgePrinter
        {
            Id = "bt-1",
            QueueName = "bt-1",
            TransportType = PrinterTransportType.BradyWebBluetooth,
            ConnectionType = PrinterConnectionType.Bluetooth,
            BluetoothDeviceId = "SDK-1"
        };

        Assert.True(router.Supports(printer));
        Assert.Equal("BluetoothCompanionTransport", router.Resolve(printer).Name);
    }

    [Fact]
    public void Supports_SelectsBluetoothWhenConnectionIsBluetooth()
    {
        var router = CreateRouter();
        var printer = new ForgePrinter
        {
            Id = "bt-2",
            QueueName = "bt-2",
            TransportType = PrinterTransportType.Unknown,
            ConnectionType = PrinterConnectionType.Bluetooth
        };

        Assert.Equal("BluetoothCompanionTransport", router.Resolve(printer).Name);
    }

    [Fact]
    public void BradyWebBluetooth_MapsToCloudString()
    {
        Assert.Equal("BRADY_WEB_BLUETOOTH", PrinterTransportType.BradyWebBluetooth.ToCloudString());
        Assert.Equal(PrinterTransportType.BradyWebBluetooth, PrinterTransportTypeExtensions.FromCloudString("BRADY_WEB_BLUETOOTH"));
    }

    private static PrinterTransportRouter CreateRouter()
    {
        var spooler = new WindowsSpoolerTransport(NullLogger<WindowsSpoolerTransport>.Instance);
        var bluetooth = new BluetoothCompanionTransport(
            new BluetoothPipeClient(NullLogger<BluetoothPipeClient>.Instance),
            NullLogger<BluetoothCompanionTransport>.Instance);
        return new PrinterTransportRouter(
            new IPrinterTransport[] { spooler, bluetooth },
            NullLogger<PrinterTransportRouter>.Instance);
    }
}
