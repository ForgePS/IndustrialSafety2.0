using System.ServiceProcess;
using System.Text;
using Forge.PrinterBridge.Bluetooth;
using Forge.PrinterBridge.Cloud;
using Forge.PrinterBridge.Diagnostics;
using Forge.PrinterBridge.Security;
using Forge.PrinterBridge.Shared.Constants;
using Forge.PrinterBridge.Windows.Discovery;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Forge.PrinterBridge.Tray;

/// <summary>
/// Lightweight NotifyIcon tray (spec section 10). Closing this app does not stop the service.
/// </summary>
public sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _notifyIcon;
    private readonly ContextMenuStrip _menu;
    private readonly ICredentialStore _credentialStore;
    private readonly BridgeCloudOptions _cloudOptions;
    private readonly EventWaitHandle _activateEvent;
    private readonly CancellationTokenSource _lifetime = new();
    private string _cloudStatus = "Unknown";
    private string _printerSummary = "No printers discovered";

    public TrayApplicationContext(
        TrayProtocol.Action startupAction,
        EventWaitHandle activateEvent)
    {
        _activateEvent = activateEvent;

        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables(prefix: "FORGE_BRIDGE_")
            .Build();

        _cloudOptions = new BridgeCloudOptions();
        configuration.GetSection(BridgeCloudOptions.SectionName).Bind(_cloudOptions);
        _credentialStore = new DpapiCredentialStore();

        _menu = new ContextMenuStrip();
        _menu.Items.Add("Open Printer Bridge", null, (_, _) => ShowStatusDialog());
        _menu.Items.Add("Printer Status", null, (_, _) => ShowStatusDialog());
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("Register with Forge…", null, (_, _) => RegisterWithForgeAsync());
        _menu.Items.Add("Connect Bluetooth Printer…", null, (_, _) => ConnectBluetoothCompanion());
        _menu.Items.Add("Refresh Printers", null, async (_, _) => await RefreshAsync());
        _menu.Items.Add("Test Print", null, (_, _) => ShowTestPrintNote());
        _menu.Items.Add("Diagnostics", null, async (_, _) => await RunDiagnosticsAsync());
        _menu.Items.Add("Settings", null, (_, _) => ShowSettings());
        _menu.Items.Add("Check for Updates", null, (_, _) => MessageBox.Show(
            "Updater is a stub. Automatic updates arrive in a later phase.",
            BridgeConstants.ProductName));
        _menu.Items.Add("Restart Service", null, (_, _) => RestartService());
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("About", null, (_, _) => ShowAbout());
        _menu.Items.Add("Exit Tray", null, (_, _) => ExitTrayOnly());

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = BridgeConstants.ProductName,
            ContextMenuStrip = _menu
        };
        // Windows 11 often hides icons; left-click should open the same menu as right-click.
        _notifyIcon.MouseUp += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                _menu.Show(Cursor.Position);
            }
        };
        _notifyIcon.DoubleClick += (_, _) => ShowStatusDialog();

        _ = RefreshAsync();
        EnsureBluetoothCompanionForAutoReconnect();
        StartActivationWatcher();

        if (startupAction != TrayProtocol.Action.None)
        {
            // Defer until the message pump is running.
            var timer = new System.Windows.Forms.Timer { Interval = 250 };
            timer.Tick += (_, _) =>
            {
                timer.Stop();
                timer.Dispose();
                HandleProtocolAction(startupAction);
            };
            timer.Start();
        }
    }

    private void StartActivationWatcher()
    {
        _ = Task.Run(() =>
        {
            var handles = new WaitHandle[] { _activateEvent, _lifetime.Token.WaitHandle };
            while (!_lifetime.IsCancellationRequested)
            {
                var signaled = WaitHandle.WaitAny(handles, 2000);
                if (signaled != 0)
                {
                    continue;
                }

                var action = TrayProtocol.ConsumeActivationCommand();
                if (action == TrayProtocol.Action.None)
                {
                    action = TrayProtocol.Action.Open;
                }

                try
                {
                    if (_notifyIcon.ContextMenuStrip?.InvokeRequired == true)
                    {
                        _notifyIcon.ContextMenuStrip.BeginInvoke(() => HandleProtocolAction(action));
                    }
                    else
                    {
                        HandleProtocolAction(action);
                    }
                }
                catch
                {
                    // Ignore activation races during exit.
                }
            }
        }, _lifetime.Token);
    }

    private void HandleProtocolAction(TrayProtocol.Action action)
    {
        switch (action)
        {
            case TrayProtocol.Action.Register:
                _notifyIcon.ShowBalloonTip(
                    4000,
                    BridgeConstants.ProductName,
                    "Enter your Forge pairing code to register this PC.",
                    ToolTipIcon.Info);
                RegisterWithForgeAsync();
                break;
            case TrayProtocol.Action.Status:
                ShowStatusDialog();
                break;
            case TrayProtocol.Action.Bluetooth:
                ConnectBluetoothCompanion();
                break;
            case TrayProtocol.Action.Open:
            default:
                ShowStatusDialog();
                break;
        }
    }

    /// <summary>
    /// At logon, ensure the Brady companion is up so saved BLE printers can reconnect silently.
    /// </summary>
    private static void EnsureBluetoothCompanionForAutoReconnect()
    {
        if (BluetoothCompanionLauncher.IsRunning())
        {
            return;
        }

        BluetoothCompanionLauncher.TryStart(configuredPath: null, out _);
    }

    private async Task RefreshAsync()
    {
        try
        {
            var discovery = new WindowsPrinterDiscovery(NullLogger<WindowsPrinterDiscovery>.Instance);
            var printers = await discovery.DiscoverAsync();
            var ready = printers.Count(p => p.Ready);
            _printerSummary = $"{printers.Count} connected, {ready} ready";

            var hasCreds = await _credentialStore.ExistsAsync();
            _cloudStatus = hasCreds ? "Credentials present (service manages live WSS)" : "Not paired";
            _notifyIcon.Text = $"{BridgeConstants.ProductName}\nForge Cloud: {_cloudStatus}\nPrinters: {_printerSummary}";
        }
        catch (Exception ex)
        {
            _cloudStatus = "Error";
            _printerSummary = ex.Message;
            _notifyIcon.Text = $"{BridgeConstants.ProductName}\n{ex.Message}";
        }
    }

    private void ShowStatusDialog()
    {
        using var form = new Form
        {
            Text = BridgeConstants.ProductName,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            StartPosition = FormStartPosition.CenterScreen,
            ClientSize = new Size(440, 280),
            Font = SystemFonts.MessageBoxFont,
        };

        var companionRunning = BluetoothCompanionLauncher.IsRunning();
        var companionPath = BluetoothCompanionLauncher.ResolveExecutablePath();
        var body = new Label
        {
            AutoSize = false,
            Location = new Point(16, 16),
            Size = new Size(408, 160),
            Text =
                $"FORGE PRINTER BRIDGE\r\n\r\n" +
                $"Forge Cloud: {_cloudStatus}\r\n" +
                $"Printers: {_printerSummary}\r\n" +
                $"Service: {GetServiceStatus()}\r\n" +
                $"Bluetooth Companion: {(companionRunning ? "Running" : "Not running")}\r\n" +
                (companionPath is null
                    ? "Companion EXE: not found (build bluetooth-companion or install under Program Files)"
                    : $"Companion EXE: {companionPath}"),
        };

        var connect = new Button
        {
            Text = "Connect Bluetooth Printer…",
            Location = new Point(16, 190),
            Size = new Size(220, 32),
            TabIndex = 0,
        };
        connect.Click += (_, _) =>
        {
            form.Close();
            ConnectBluetoothCompanion();
        };

        var close = new Button
        {
            Text = "Close",
            DialogResult = DialogResult.Cancel,
            Location = new Point(330, 190),
            Size = new Size(94, 32),
            TabIndex = 1,
        };

        form.Controls.Add(body);
        form.Controls.Add(connect);
        form.Controls.Add(close);
        form.CancelButton = close;
        form.AcceptButton = connect;
        form.ShowDialog();
    }

    private void RegisterWithForgeAsync()
    {
        using var form = new Form
        {
            Text = "Register Forge Print Bridge",
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            StartPosition = FormStartPosition.CenterScreen,
            ClientSize = new Size(480, 220),
            Font = SystemFonts.MessageBoxFont,
        };

        var help = new Label
        {
            AutoSize = false,
            Location = new Point(16, 12),
            Size = new Size(448, 48),
            Text = "Create a pairing code in Forge → Settings → Printer Bridges (or Print Manager), then enter it below.",
        };

        var apiLabel = new Label { Text = "API base URL", Location = new Point(16, 70), AutoSize = true };
        var apiBox = new TextBox
        {
            Location = new Point(16, 90),
            Size = new Size(448, 23),
            Text = _cloudOptions.ApiBaseUrl ?? string.Empty,
        };

        var codeLabel = new Label { Text = "Pairing code (FPB-XXX-XXX)", Location = new Point(16, 124), AutoSize = true };
        var codeBox = new TextBox
        {
            Location = new Point(16, 144),
            Size = new Size(280, 23),
            PlaceholderText = "FPB-123-456",
        };

        var register = new Button
        {
            Text = "Register",
            Location = new Point(310, 142),
            Size = new Size(74, 28),
        };
        var cancel = new Button
        {
            Text = "Cancel",
            DialogResult = DialogResult.Cancel,
            Location = new Point(390, 142),
            Size = new Size(74, 28),
        };

        register.Click += async (_, _) =>
        {
            var code = codeBox.Text.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(code))
            {
                MessageBox.Show("Enter the pairing code from Forge.", BridgeConstants.ProductName);
                return;
            }

            if (!string.IsNullOrWhiteSpace(apiBox.Text))
            {
                _cloudOptions.ApiBaseUrl = apiBox.Text.Trim();
            }

            register.Enabled = false;
            try
            {
                var ok = await PairFromTrayAsync(code);
                if (!ok)
                {
                    return;
                }

                form.DialogResult = DialogResult.OK;
                form.Close();
                MessageBox.Show(
                    "Bridge registered. Restarting the Windows service so it connects with the new credentials.",
                    BridgeConstants.ProductName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                RestartService();
                await RefreshAsync();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Pairing failed.\n\n{ex.Message}",
                    BridgeConstants.ProductName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            finally
            {
                register.Enabled = true;
            }
        };

        form.Controls.Add(help);
        form.Controls.Add(apiLabel);
        form.Controls.Add(apiBox);
        form.Controls.Add(codeLabel);
        form.Controls.Add(codeBox);
        form.Controls.Add(register);
        form.Controls.Add(cancel);
        form.CancelButton = cancel;
        form.AcceptButton = register;
        form.ShowDialog();
    }

    private async Task<bool> PairFromTrayAsync(string pairingCode)
    {
        var apiBase = (_cloudOptions.ApiBaseUrl ?? string.Empty).TrimEnd('/');
        var pairingPath = string.IsNullOrWhiteSpace(_cloudOptions.PairingPath)
            ? "/api/v1/printer-bridge/v1/pair"
            : _cloudOptions.PairingPath;
        var url = $"{apiBase}{pairingPath}";
        var deviceId = $"DEVICE-{Environment.MachineName}-{Guid.NewGuid():N}".ToUpperInvariant();

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        // CloudFront WAF CommonRuleSet blocks requests with no User-Agent (NoUserAgent_HEADER).
        http.DefaultRequestHeaders.TryAddWithoutValidation(
            "User-Agent",
            "ForgePrinterBridge.Tray/1.1.0 (Windows)");
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(
                System.Text.Json.JsonSerializer.Serialize(new
                {
                    pairingCode,
                    deviceId,
                    computerName = Environment.MachineName,
                    osVersion = Environment.OSVersion.ToString(),
                    bridgeVersion = "1.1.0",
                    name = Environment.MachineName
                }),
                Encoding.UTF8,
                "application/json")
        };

        using var response = await http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            MessageBox.Show(
                $"Pairing failed: {(int)response.StatusCode}\n{body}",
                BridgeConstants.ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return false;
        }

        using var doc = System.Text.Json.JsonDocument.Parse(body);
        var root = doc.RootElement;
        var data = root.TryGetProperty("data", out var dataEl) ? dataEl : root;
        var accessToken = data.TryGetProperty("accessToken", out var tokenEl) ? tokenEl.GetString() : null;
        var bridgeId = data.TryGetProperty("bridgeId", out var bridgeEl) ? bridgeEl.GetString() : null;
        var tenantId = data.TryGetProperty("tenantId", out var tenantEl) ? tenantEl.GetString() : null;
        var responseDeviceId = data.TryGetProperty("deviceId", out var deviceEl) ? deviceEl.GetString() : null;

        if (string.IsNullOrWhiteSpace(accessToken) || string.IsNullOrWhiteSpace(bridgeId))
        {
            MessageBox.Show("Pairing response was incomplete.", BridgeConstants.ProductName);
            return false;
        }

        await _credentialStore.SaveAsync(new BridgeCredentials
        {
            BridgeId = bridgeId!,
            DeviceId = string.IsNullOrWhiteSpace(responseDeviceId) ? deviceId : responseDeviceId!,
            AccessToken = accessToken!,
            TenantId = tenantId ?? string.Empty,
            PairingCode = pairingCode
        });
        return true;
    }

    private static void ConnectBluetoothCompanion()
    {
        if (BluetoothCompanionLauncher.IsRunning())
        {
            MessageBox.Show(
                "Forge Bluetooth Printer Companion is already running.\nUse that window to scan and pair Brady Bluetooth printers.",
                BridgeConstants.ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (BluetoothCompanionLauncher.TryStart(configuredPath: null, out var detail))
        {
            MessageBox.Show(
                $"Started Forge Bluetooth Printer Companion.\n\n{detail}\n\nComplete pairing in the companion UI. The Windows service talks to it over {BridgeConstants.BluetoothNamedPipe}.",
                BridgeConstants.ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        MessageBox.Show(
            $"Unable to start the Bluetooth companion.\n\n{detail}\n\nInstall ForgePrinterBridge.Bluetooth.exe under:\n{BridgeConstants.InstallRoot}\nor build bluetooth-companion (pnpm dist) so dist/win-unpacked contains the EXE.",
            BridgeConstants.ProductName,
            MessageBoxButtons.OK,
            MessageBoxIcon.Warning);
    }

    private static void ShowTestPrintNote()
    {
        MessageBox.Show(
            "Test Print is handled by the Windows service once a printer queue or Bluetooth printer is selected.\nUse Forge Admin or the service diagnostics to submit a test label.",
            BridgeConstants.ProductName);
    }

    private async Task RunDiagnosticsAsync()
    {
        var runner = new DiagnosticRunner(
            Options.Create(_cloudOptions),
            _credentialStore,
            NullLogger<DiagnosticRunner>.Instance);

        var results = await runner.RunAsync();
        var text = string.Join(Environment.NewLine, results.Select(r =>
            $"{r.Name}: {(r.Passed ? "PASS" : "FAIL")} — {r.Detail}"));
        MessageBox.Show(text, "Diagnostics", MessageBoxButtons.OK,
            results.All(r => r.Passed) ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
    }

    private void ShowSettings()
    {
        MessageBox.Show(
            $"Install: {BridgeConstants.InstallRoot}\nData: {BridgeConstants.DataRoot}\nAPI: {_cloudOptions.ApiBaseUrl}\nWSS: {_cloudOptions.ResolveWebSocketUrl()}\nBluetooth pipe: {BridgeConstants.BluetoothNamedPipe}",
            "Settings");
    }

    private static void ShowAbout()
    {
        MessageBox.Show(
            $"{BridgeConstants.ProductName}\nVersion 1.1.0 (Phase 2)\nWindows Spooler + Bluetooth companion\n\nClosing this tray does not stop {BridgeConstants.ServiceDisplayName}.\n\nBluetooth: click the tray icon → Connect Bluetooth Printer…",
            "About");
    }

    private static string GetServiceStatus()
    {
        try
        {
            using var controller = new ServiceController(BridgeConstants.ServiceName);
            return controller.Status.ToString();
        }
        catch
        {
            return "Not installed / unavailable";
        }
    }

    private static void RestartService()
    {
        try
        {
            using var controller = new ServiceController(BridgeConstants.ServiceName);
            if (controller.Status == ServiceControllerStatus.Running)
            {
                controller.Stop();
                controller.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
            }

            controller.Start();
            controller.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
            MessageBox.Show("Service restarted.", BridgeConstants.ProductName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Unable to restart service. Run the tray elevated if needed.\n\n{ex.Message}",
                BridgeConstants.ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void ExitTrayOnly()
    {
        // Explicitly do not stop the Windows service.
        _lifetime.Cancel();
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _lifetime.Cancel();
            _lifetime.Dispose();
            _notifyIcon.Dispose();
            _menu.Dispose();
        }

        base.Dispose(disposing);
    }
}
