using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Service;

/// <summary>Simple daily rolling file logger under ProgramData Logs.</summary>
internal sealed class RollingFileLoggerProvider : ILoggerProvider
{
    private readonly string _directory;
    private readonly object _gate = new();

    public RollingFileLoggerProvider(string directory)
    {
        _directory = directory;
        Directory.CreateDirectory(directory);
    }

    public ILogger CreateLogger(string categoryName) => new RollingFileLogger(categoryName, _directory, _gate);

    public void Dispose()
    {
    }

    private sealed class RollingFileLogger : ILogger
    {
        private readonly string _category;
        private readonly string _directory;
        private readonly object _gate;

        public RollingFileLogger(string category, string directory, object gate)
        {
            _category = category;
            _directory = directory;
            _gate = gate;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var line =
                $"{DateTimeOffset.UtcNow:O} [{logLevel}] {_category}: {formatter(state, exception)}";
            if (exception is not null)
            {
                line += Environment.NewLine + exception;
            }

            var path = Path.Combine(_directory, $"bridge-{DateTime.UtcNow:yyyyMMdd}.log");
            lock (_gate)
            {
                File.AppendAllText(path, line + Environment.NewLine);
            }
        }
    }
}
