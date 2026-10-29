using System.Text.Json.Serialization;

namespace Forge.PrinterBridge.Shared.Dtos;

public sealed class PrintJobPayload
{
    [JsonPropertyName("jobId")]
    public string JobId { get; set; } = string.Empty;

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = string.Empty;

    [JsonPropertyName("bridgeId")]
    public string BridgeId { get; set; } = string.Empty;

    [JsonPropertyName("printerId")]
    public string PrinterId { get; set; } = string.Empty;

    /// <summary>Windows spooler queue name from Forge printer record (preferred resolve key).</summary>
    [JsonPropertyName("windowsQueueName")]
    public string? WindowsQueueName { get; set; }

    [JsonPropertyName("deviceIdentifier")]
    public string? DeviceIdentifier { get; set; }

    [JsonPropertyName("bluetoothDeviceId")]
    public string? BluetoothDeviceId { get; set; }

    [JsonPropertyName("bluetoothSavedId")]
    public string? BluetoothSavedId { get; set; }

    [JsonPropertyName("printerName")]
    public string? PrinterName { get; set; }

    [JsonPropertyName("template")]
    public PrintJobTemplateDto? Template { get; set; }

    [JsonPropertyName("media")]
    public PrintJobMediaDto? Media { get; set; }

    [JsonPropertyName("render")]
    public PrintJobRenderDto? Render { get; set; }

    [JsonPropertyName("settings")]
    public PrintJobSettingsDto? Settings { get; set; }

    [JsonPropertyName("requestedBy")]
    public string? RequestedBy { get; set; }

    [JsonPropertyName("expiresAt")]
    public DateTimeOffset? ExpiresAt { get; set; }
}

public sealed class PrintJobTemplateDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public int Version { get; set; }
}

public sealed class PrintJobMediaDto
{
    [JsonPropertyName("widthInches")]
    public double WidthInches { get; set; }

    [JsonPropertyName("heightInches")]
    public double HeightInches { get; set; }
}

public sealed class PrintJobRenderDto
{
    [JsonPropertyName("dpi")]
    public int Dpi { get; set; } = 300;

    [JsonPropertyName("artifactType")]
    public string ArtifactType { get; set; } = "PNG";

    [JsonPropertyName("artifactUrl")]
    public string ArtifactUrl { get; set; } = string.Empty;

    [JsonPropertyName("sha256")]
    public string Sha256 { get; set; } = string.Empty;
}

public sealed class PrintJobSettingsDto
{
    [JsonPropertyName("copies")]
    public int Copies { get; set; } = 1;

    [JsonPropertyName("orientation")]
    public string Orientation { get; set; } = "AUTO";
}
