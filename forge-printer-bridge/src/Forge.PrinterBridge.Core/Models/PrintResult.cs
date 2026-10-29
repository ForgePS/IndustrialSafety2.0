using Forge.PrinterBridge.Shared.Enums;

namespace Forge.PrinterBridge.Core.Models;

public sealed class PrintResult
{
    public bool Success { get; set; }
    public PrintJobStatus Status { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public string? SpoolerJobId { get; set; }
    public bool AlreadyCompleted { get; set; }

    public static PrintResult Ok(PrintJobStatus status, string? spoolerJobId = null) => new()
    {
        Success = true,
        Status = status,
        SpoolerJobId = spoolerJobId
    };

    public static PrintResult AlreadyDone(PrintJobStatus status) => new()
    {
        Success = true,
        Status = status,
        AlreadyCompleted = true
    };

    public static PrintResult Fail(string errorCode, string message, PrintJobStatus status = PrintJobStatus.Failed) => new()
    {
        Success = false,
        Status = status,
        ErrorCode = errorCode,
        ErrorMessage = message
    };
}
