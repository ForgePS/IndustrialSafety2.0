using Forge.PrinterBridge.Shared.Constants;
using Forge.PrinterBridge.Tray;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        Directory.CreateDirectory(BridgeConstants.ConfigDirectory);

        using var mutex = new Mutex(initiallyOwned: true, BridgeConstants.TrayMutexName, out var createdNew);
        var protocolArg = args.FirstOrDefault(a =>
            a.StartsWith(BridgeConstants.ProtocolScheme + ":", StringComparison.OrdinalIgnoreCase));
        var startupAction = TrayProtocol.Parse(protocolArg);

        if (!createdNew)
        {
            // Another tray is already running — ask it to activate.
            if (startupAction == TrayProtocol.Action.None)
            {
                startupAction = TrayProtocol.Action.Open;
            }

            TrayProtocol.WriteActivationCommand(startupAction);
            return;
        }

        using var activateEvent = new EventWaitHandle(
            initialState: false,
            mode: EventResetMode.AutoReset,
            name: BridgeConstants.TrayActivateEventName);

        // Closing / exiting the tray must NOT stop the Windows service.
        using var context = new TrayApplicationContext(startupAction, activateEvent);
        Application.Run(context);

        try
        {
            mutex.ReleaseMutex();
        }
        catch
        {
            // ignore
        }
    }
}
