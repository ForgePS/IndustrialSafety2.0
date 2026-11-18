namespace Forge.PrinterBridge.Shared.Enums;

public enum PrintJobStatus
{
    Created = 0,
    Rendering = 1,
    Queued = 2,
    BridgeAssigned = 3,
    Delivering = 4,
    Received = 5,
    Validating = 6,
    WaitingForPrinter = 7,
    Spooling = 8,
    Transmitting = 9,
    Printing = 10,
    Completed = 11,
    Failed = 12,
    Cancelled = 13,
    Expired = 14,
    SentToPrinter = 15
}
