using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Forge.PrinterBridge.Shared.Constants;

namespace Forge.PrinterBridge.Security;

/// <summary>
/// DPAPI-backed credential store. Secrets are never written as plain JSON.
/// </summary>
public sealed class DpapiCredentialStore : ICredentialStore
{
    private readonly string _storePath;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public DpapiCredentialStore(string? storePath = null)
    {
        _storePath = storePath ?? BridgeConstants.CredentialsStorePath;
        Directory.CreateDirectory(Path.GetDirectoryName(_storePath)!);
    }

    public Task SaveAsync(BridgeCredentials credentials, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        credentials.UpdatedAt = DateTimeOffset.UtcNow;

        var json = JsonSerializer.Serialize(credentials, JsonOptions);
        var plainBytes = Encoding.UTF8.GetBytes(json);
        var protectedBytes = ProtectedData.Protect(plainBytes, optionalEntropy: null, scope: DataProtectionScope.LocalMachine);
        File.WriteAllBytes(_storePath, protectedBytes);
        CryptographicOperations.ZeroMemory(plainBytes);
        return Task.CompletedTask;
    }

    public Task<BridgeCredentials?> LoadAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!File.Exists(_storePath))
        {
            return Task.FromResult<BridgeCredentials?>(null);
        }

        var protectedBytes = File.ReadAllBytes(_storePath);
        if (protectedBytes.Length == 0)
        {
            return Task.FromResult<BridgeCredentials?>(null);
        }

        var plainBytes = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, scope: DataProtectionScope.LocalMachine);
        try
        {
            var json = Encoding.UTF8.GetString(plainBytes);
            var credentials = JsonSerializer.Deserialize<BridgeCredentials>(json, JsonOptions);
            return Task.FromResult(credentials);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plainBytes);
        }
    }

    public Task<bool> ExistsAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(File.Exists(_storePath) && new FileInfo(_storePath).Length > 0);
    }

    public Task ClearAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (File.Exists(_storePath))
        {
            File.Delete(_storePath);
        }

        return Task.CompletedTask;
    }
}
