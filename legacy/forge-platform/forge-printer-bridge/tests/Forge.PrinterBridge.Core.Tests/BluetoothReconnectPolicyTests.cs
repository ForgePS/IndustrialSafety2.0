using Forge.PrinterBridge.Bluetooth;

namespace Forge.PrinterBridge.Core.Tests;

public class BluetoothReconnectPolicyTests
{
    [Fact]
    public void DelaySequence_IsFiveFifteenThirtySixty()
    {
        Assert.Equal(
            new[]
            {
                TimeSpan.FromSeconds(5),
                TimeSpan.FromSeconds(15),
                TimeSpan.FromSeconds(30),
                TimeSpan.FromSeconds(60)
            },
            BluetoothReconnectPolicy.DelaySequence);
    }

    [Theory]
    [InlineData(0, 5)]
    [InlineData(1, 15)]
    [InlineData(2, 30)]
    [InlineData(3, 60)]
    [InlineData(4, 300)]
    [InlineData(10, 300)]
    public void GetDelay_FollowsBackoffThenCapsAtFiveMinutes(int attempt, int expectedSeconds)
    {
        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), BluetoothReconnectPolicy.GetDelay(attempt));
    }

    [Fact]
    public void HasExceededWaitingTimeout_UsesFifteenMinuteDefault()
    {
        var since = DateTimeOffset.Parse("2026-09-11T00:00:00Z");
        Assert.False(BluetoothReconnectPolicy.HasExceededWaitingTimeout(
            since,
            utcNow: since.AddMinutes(14)));
        Assert.True(BluetoothReconnectPolicy.HasExceededWaitingTimeout(
            since,
            utcNow: since.AddMinutes(15)));
    }

    [Fact]
    public void IsReadyForRetry_RespectsAttemptDelay()
    {
        var last = DateTimeOffset.Parse("2026-09-11T00:00:00Z");
        Assert.False(BluetoothReconnectPolicy.IsReadyForRetry(last, 0, last.AddSeconds(4)));
        Assert.True(BluetoothReconnectPolicy.IsReadyForRetry(last, 0, last.AddSeconds(5)));
        Assert.False(BluetoothReconnectPolicy.IsReadyForRetry(last, 1, last.AddSeconds(14)));
        Assert.True(BluetoothReconnectPolicy.IsReadyForRetry(last, 1, last.AddSeconds(15)));
    }
}
