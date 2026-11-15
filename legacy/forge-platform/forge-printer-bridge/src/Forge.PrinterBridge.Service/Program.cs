using Forge.PrinterBridge.Bluetooth.Ipc;
using Forge.PrinterBridge.Bluetooth.Transport;
using Forge.PrinterBridge.Cloud;
using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Queue;
using Forge.PrinterBridge.Core.Services;
using Forge.PrinterBridge.Diagnostics;
using Forge.PrinterBridge.Security;
using Forge.PrinterBridge.Service;
using Forge.PrinterBridge.Windows.Discovery;
using Forge.PrinterBridge.Windows.Transport;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = Forge.PrinterBridge.Shared.Constants.BridgeConstants.ServiceName;
});

Directory.CreateDirectory(Forge.PrinterBridge.Shared.Constants.BridgeConstants.LogsDirectory);
Directory.CreateDirectory(Forge.PrinterBridge.Shared.Constants.BridgeConstants.QueueDirectory);
Directory.CreateDirectory(Forge.PrinterBridge.Shared.Constants.BridgeConstants.CacheDirectory);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddEventLog();
builder.Logging.AddProvider(new Forge.PrinterBridge.Service.RollingFileLoggerProvider(
    Forge.PrinterBridge.Shared.Constants.BridgeConstants.LogsDirectory));

builder.Services.Configure<BridgeCloudOptions>(builder.Configuration.GetSection(BridgeCloudOptions.SectionName));
builder.Services.Configure<BridgeHostOptions>(builder.Configuration.GetSection(BridgeHostOptions.SectionName));

builder.Services.AddHttpClient("ForgeCloud", client =>
{
    // CloudFront WAF CommonRuleSet blocks empty User-Agent (NoUserAgent_HEADER).
    client.DefaultRequestHeaders.TryAddWithoutValidation(
        "User-Agent",
        "ForgePrinterBridge.Service/1.1.0 (Windows)");
});
builder.Services.AddHttpClient<ArtifactDownloader>(client =>
{
    client.DefaultRequestHeaders.TryAddWithoutValidation(
        "User-Agent",
        "ForgePrinterBridge.Service/1.1.0 (Windows)");
});

builder.Services.AddSingleton<ICredentialStore, DpapiCredentialStore>();
builder.Services.AddSingleton<SqlitePrintJobQueue>();
builder.Services.AddSingleton<IPrintJobQueue>(sp => sp.GetRequiredService<SqlitePrintJobQueue>());
builder.Services.AddSingleton<IJobIdempotencyStore>(sp => sp.GetRequiredService<SqlitePrintJobQueue>());
builder.Services.AddSingleton<JobIdempotencyService>();
builder.Services.AddSingleton<IPrinterDiscovery>(sp =>
{
    var includeVirtual = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<BridgeHostOptions>>().Value.IncludeVirtualPrinters;
    return new WindowsPrinterDiscovery(
        sp.GetRequiredService<ILogger<WindowsPrinterDiscovery>>(),
        includeVirtual);
});

builder.Services.AddSingleton<WindowsSpoolerTransport>();
builder.Services.AddSingleton<BluetoothPipeClient>();
builder.Services.AddSingleton<BluetoothCompanionTransport>();
builder.Services.AddSingleton<IPrinterTransport>(sp =>
{
    IPrinterTransport[] transports =
    [
        sp.GetRequiredService<WindowsSpoolerTransport>(),
        sp.GetRequiredService<BluetoothCompanionTransport>()
    ];
    return new PrinterTransportRouter(
        transports,
        sp.GetRequiredService<ILogger<PrinterTransportRouter>>());
});

builder.Services.AddSingleton<PrintJobProcessor>();
builder.Services.AddSingleton<CloudConnectionClient>();
builder.Services.AddSingleton<IDiagnosticRunner, DiagnosticRunner>();
builder.Services.AddHostedService<PrinterBridgeWorker>();

var host = builder.Build();
await host.RunAsync();
