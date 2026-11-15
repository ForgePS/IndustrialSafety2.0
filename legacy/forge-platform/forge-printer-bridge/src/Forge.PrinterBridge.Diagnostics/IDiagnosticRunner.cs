namespace Forge.PrinterBridge.Diagnostics;

public sealed class DiagnosticResult
{
    public string Name { get; init; } = string.Empty;
    public bool Passed { get; init; }
    public string Detail { get; init; } = string.Empty;
}

public interface IDiagnosticRunner
{
    Task<IReadOnlyList<DiagnosticResult>> RunAsync(CancellationToken cancellationToken = default);
}
