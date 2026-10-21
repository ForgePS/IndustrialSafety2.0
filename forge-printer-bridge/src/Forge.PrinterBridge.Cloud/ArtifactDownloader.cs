using System.Security.Cryptography;
using Forge.PrinterBridge.Shared.Constants;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Cloud;

public sealed class ArtifactDownloader
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ArtifactDownloader> _logger;

    public ArtifactDownloader(HttpClient httpClient, ILogger<ArtifactDownloader> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<string> DownloadAndVerifyAsync(
        string signedUrl,
        string expectedSha256,
        string jobId,
        CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(BridgeConstants.CacheDirectory);
        var extension = GuessExtension(signedUrl);
        var localPath = Path.Combine(BridgeConstants.CacheDirectory, $"{jobId}{extension}");

        await using (var remote = await _httpClient.GetStreamAsync(signedUrl, cancellationToken))
        await using (var local = File.Create(localPath))
        {
            await remote.CopyToAsync(local, cancellationToken);
        }

        var actualHash = await ComputeSha256HexAsync(localPath, cancellationToken);
        if (!string.Equals(actualHash, expectedSha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(localPath);
            throw new InvalidOperationException(
                $"Artifact SHA-256 mismatch for job {jobId}. Expected {expectedSha256}, got {actualHash}.");
        }

        _logger.LogInformation("Downloaded and verified artifact for job {JobId} at {Path}", jobId, localPath);
        return localPath;
    }

    public static async Task<string> ComputeSha256HexAsync(string filePath, CancellationToken cancellationToken = default)
    {
        await using var stream = File.OpenRead(filePath);
        var hash = await SHA256.HashDataAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string GuessExtension(string url)
    {
        try
        {
            var path = new Uri(url).AbsolutePath;
            var ext = Path.GetExtension(path);
            return string.IsNullOrWhiteSpace(ext) ? ".png" : ext;
        }
        catch
        {
            return ".png";
        }
    }
}
