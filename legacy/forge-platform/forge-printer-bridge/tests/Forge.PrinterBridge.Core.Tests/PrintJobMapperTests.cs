using Forge.PrinterBridge.Core.Mapping;
using Forge.PrinterBridge.Shared.Dtos;

namespace Forge.PrinterBridge.Core.Tests;

public class PrintJobMapperTests
{
    [Fact]
    public void FromPayload_prefers_windows_queue_name_for_local_resolve()
    {
        var payload = new PrintJobPayload
        {
            JobId = "job-1",
            TenantId = "tenant-1",
            BridgeId = "bridge-1",
            PrinterId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            WindowsQueueName = "Brady i4311",
            DeviceIdentifier = "Brady i4311",
            Render = new PrintJobRenderDto
            {
                Dpi = 300,
                ArtifactType = "PNG",
                ArtifactUrl = "https://example.com/a.png",
                Sha256 = "deadbeef"
            }
        };

        var job = PrintJobMapper.FromPayload(payload, localArtifactPath: null);

        Assert.Equal("Brady i4311", job.QueueName);
        Assert.Equal(payload.PrinterId, job.PrinterId);
    }
}
