namespace Forge.PrinterBridge.Security;

public interface ICredentialStore
{
    Task SaveAsync(BridgeCredentials credentials, CancellationToken cancellationToken = default);

    Task<BridgeCredentials?> LoadAsync(CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(CancellationToken cancellationToken = default);

    Task ClearAsync(CancellationToken cancellationToken = default);
}

public sealed class BridgeCredentials
{
    public string BridgeId { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public string AccessToken { get; set; } = string.Empty;
    public string? PairingCode { get; set; }
    public string? TenantId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
