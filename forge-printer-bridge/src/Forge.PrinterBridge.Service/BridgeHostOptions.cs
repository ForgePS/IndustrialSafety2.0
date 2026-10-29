namespace Forge.PrinterBridge.Service;



public sealed class BridgeHostOptions

{

    public const string SectionName = "Bridge";



    public bool IncludeVirtualPrinters { get; set; }

    public int QueuePollIntervalSeconds { get; set; } = 2;

    public int PrinterRefreshIntervalSeconds { get; set; } = 60;



    /// <summary>Spec §21 default — abandon WaitingForPrinter after this many minutes.</summary>

    public int BluetoothWaitingTimeoutMinutes { get; set; } = 15;



    /// <summary>

    /// Optional path to ForgePrinterBridge.Bluetooth.exe. When set and the companion pipe is down,

    /// the service may attempt Process.Start (documented; does not force-kill an existing process).

    /// </summary>

    public string? BluetoothCompanionPath { get; set; }



    /// <summary>When true, try launching the companion if the named pipe is unreachable.</summary>
    public bool LaunchBluetoothCompanionIfMissing { get; set; } = true;

}


