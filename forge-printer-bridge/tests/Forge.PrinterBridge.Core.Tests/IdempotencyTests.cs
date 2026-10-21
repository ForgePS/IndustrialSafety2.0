using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Core.Queue;
using Forge.PrinterBridge.Core.Services;
using Forge.PrinterBridge.Shared.Enums;
using Microsoft.Extensions.Logging.Abstractions;

namespace Forge.PrinterBridge.Core.Tests;

public class IdempotencyTests
{
    [Fact]
    public async Task CompletedJob_IsNotPrintedAgain()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"forge-bridge-test-{Guid.NewGuid():N}.db");
        try
        {
            var queue = new SqlitePrintJobQueue(NullLogger<SqlitePrintJobQueue>.Instance, dbPath);
            await queue.InitializeAsync();

            var idempotency = new JobIdempotencyService(queue, NullLogger<JobIdempotencyService>.Instance);
            const string jobId = "PRINT-20260910-000001";

            Assert.True(await idempotency.ShouldPrintAsync(jobId));

            await idempotency.MarkCompletedAsync(jobId, PrintJobStatus.SentToPrinter);

            Assert.False(await idempotency.ShouldPrintAsync(jobId));

            var existing = await idempotency.TryGetExistingCompletionAsync(jobId);
            Assert.NotNull(existing);
            Assert.True(existing!.AlreadyCompleted);
            Assert.Equal(PrintJobStatus.SentToPrinter, existing.Status);
            Assert.True(existing.Success);
        }
        finally
        {
            try
            {
                if (File.Exists(dbPath))
                {
                    File.Delete(dbPath);
                }
            }
            catch (IOException)
            {
                // SQLite may still hold the file briefly in tests.
            }
        }
    }

    [Fact]
    public async Task Enqueue_SkipsWhenAlreadyCompleted()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"forge-bridge-test-{Guid.NewGuid():N}.db");
        try
        {
            var queue = new SqlitePrintJobQueue(NullLogger<SqlitePrintJobQueue>.Instance, dbPath);
            await queue.InitializeAsync();

            const string jobId = "PRINT-DUP-1";
            await queue.MarkCompletedAsync(jobId, PrintJobStatus.Completed);

            await queue.EnqueueAsync(new PrintJob
            {
                JobId = jobId,
                TenantId = "T1",
                BridgeId = "B1",
                PrinterId = "P1",
                WidthInches = 4,
                HeightInches = 2
            });

            var pending = await queue.GetPendingAsync();
            Assert.DoesNotContain(pending, j => j.JobId == jobId);
        }
        finally
        {
            try
            {
                if (File.Exists(dbPath))
                {
                    File.Delete(dbPath);
                }
            }
            catch (IOException)
            {
                // SQLite may still hold the file briefly in tests.
            }
        }
    }
}
