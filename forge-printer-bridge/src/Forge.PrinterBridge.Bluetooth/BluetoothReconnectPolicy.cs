namespace Forge.PrinterBridge.Bluetooth;

/// <summary>
/// Spec §19 Bluetooth reconnect backoff: 5s, 15s, 30s, 60s, capped at 5 minutes.
/// </summary>
public static class BluetoothReconnectPolicy
{
    private static readonly TimeSpan[] Delays =
    [
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(15),
        TimeSpan.FromSeconds(30),
        TimeSpan.FromSeconds(60)
    ];

    public static readonly TimeSpan MaxDelay = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan DefaultWaitingTimeout = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Returns the delay before the next reconnect attempt for the given zero-based attempt index.
    /// </summary>
    public static TimeSpan GetDelay(int attemptIndex)
    {
        if (attemptIndex < 0)
        {
            attemptIndex = 0;
        }

        if (attemptIndex < Delays.Length)
        {
            return Delays[attemptIndex];
        }

        return MaxDelay;
    }

    /// <summary>
    /// Delay sequence used by unit tests and documentation.
    /// </summary>
    public static IReadOnlyList<TimeSpan> DelaySequence => Delays;

    public static bool HasExceededWaitingTimeout(
        DateTimeOffset waitingSince,
        TimeSpan? timeout = null,
        DateTimeOffset? utcNow = null)
    {
        var limit = timeout ?? DefaultWaitingTimeout;
        var now = utcNow ?? DateTimeOffset.UtcNow;
        return now - waitingSince >= limit;
    }

    public static bool IsReadyForRetry(
        DateTimeOffset lastAttemptAt,
        int attemptIndex,
        DateTimeOffset? utcNow = null)
    {
        var now = utcNow ?? DateTimeOffset.UtcNow;
        return now - lastAttemptAt >= GetDelay(attemptIndex);
    }
}
