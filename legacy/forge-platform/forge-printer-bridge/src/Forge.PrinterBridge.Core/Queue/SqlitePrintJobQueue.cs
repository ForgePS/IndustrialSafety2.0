using Forge.PrinterBridge.Core.Abstractions;
using Forge.PrinterBridge.Core.Models;
using Forge.PrinterBridge.Shared.Constants;
using Forge.PrinterBridge.Shared.Enums;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;

namespace Forge.PrinterBridge.Core.Queue;

public sealed class SqlitePrintJobQueue : IPrintJobQueue, IJobIdempotencyStore
{
    private readonly string _connectionString;
    private readonly ILogger<SqlitePrintJobQueue> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public SqlitePrintJobQueue(ILogger<SqlitePrintJobQueue> logger, string? databasePath = null)
    {
        var path = databasePath ?? BridgeConstants.LocalDatabasePath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate
        }.ToString();
        _logger = logger;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY NOT NULL,
                tenant_id TEXT NOT NULL,
                bridge_id TEXT NOT NULL,
                printer_id TEXT NOT NULL,
                queue_name TEXT NULL,
                template_id TEXT NULL,
                template_version INTEGER NULL,
                width_inches REAL NOT NULL,
                height_inches REAL NOT NULL,
                dpi INTEGER NOT NULL,
                artifact_type TEXT NOT NULL,
                artifact_url TEXT NULL,
                artifact_sha256 TEXT NULL,
                local_artifact_path TEXT NULL,
                copies INTEGER NOT NULL,
                orientation TEXT NOT NULL,
                requested_by TEXT NULL,
                expires_at TEXT NULL,
                status TEXT NOT NULL,
                error_code TEXT NULL,
                error_message TEXT NULL,
                created_at TEXT NOT NULL,
                received_at TEXT NULL,
                started_at TEXT NULL,
                completed_at TEXT NULL,
                failed_at TEXT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                waiting_since TEXT NULL
            );

            CREATE TABLE IF NOT EXISTS completed_jobs (
                job_id TEXT PRIMARY KEY NOT NULL,
                status TEXT NOT NULL,
                completed_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status);
            CREATE INDEX IF NOT EXISTS ix_completed_jobs_completed_at ON completed_jobs(completed_at);
            """;

        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(cancellationToken);

        // Phase 2: track when a Bluetooth job first entered WaitingForPrinter.
        await using var migrate = connection.CreateCommand();
        migrate.CommandText = "ALTER TABLE jobs ADD COLUMN waiting_since TEXT NULL;";
        try
        {
            await migrate.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (SqliteException)
        {
            // Column already exists.
        }

        _logger.LogInformation("Local SQLite queue initialized");
    }

    public async Task EnqueueAsync(PrintJob job, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (await HasCompletedAsync(job.JobId, cancellationToken))
            {
                _logger.LogInformation("Skipping enqueue for already-completed job {JobId}", job.JobId);
                return;
            }

            var existing = await GetByIdAsync(job.JobId, cancellationToken);
            if (existing is not null)
            {
                _logger.LogInformation("Job {JobId} already queued with status {Status}", job.JobId, existing.Status);
                return;
            }

            job.Status = PrintJobStatus.Queued;
            job.ReceivedAt ??= DateTimeOffset.UtcNow;

            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO jobs (
                    job_id, tenant_id, bridge_id, printer_id, queue_name, template_id, template_version,
                    width_inches, height_inches, dpi, artifact_type, artifact_url, artifact_sha256,
                    local_artifact_path, copies, orientation, requested_by, expires_at, status,
                    error_code, error_message, created_at, received_at, started_at, completed_at,
                    failed_at, retry_count, waiting_since
                ) VALUES (
                    $job_id, $tenant_id, $bridge_id, $printer_id, $queue_name, $template_id, $template_version,
                    $width_inches, $height_inches, $dpi, $artifact_type, $artifact_url, $artifact_sha256,
                    $local_artifact_path, $copies, $orientation, $requested_by, $expires_at, $status,
                    $error_code, $error_message, $created_at, $received_at, $started_at, $completed_at,
                    $failed_at, $retry_count, $waiting_since
                );
                """;

            BindJob(command, job);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<PrintJob?> DequeueNextAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            await using var select = connection.CreateCommand();
            select.CommandText = """
                SELECT * FROM jobs
                WHERE status IN ('Queued', 'Received', 'WaitingForPrinter')
                ORDER BY created_at ASC;
                """;

            await using var reader = await select.ExecuteReaderAsync(cancellationToken);
            PrintJob? selected = null;
            while (await reader.ReadAsync(cancellationToken))
            {
                var candidate = MapJob(reader);
                if (candidate.Status == PrintJobStatus.WaitingForPrinter
                    && !IsWaitingJobReady(candidate))
                {
                    continue;
                }

                selected = candidate;
                break;
            }

            await reader.DisposeAsync();
            if (selected is null)
            {
                return null;
            }

            selected.Status = PrintJobStatus.Spooling;
            selected.StartedAt = DateTimeOffset.UtcNow;
            await UpdateStatusInternalAsync(
                connection,
                selected.JobId,
                selected.Status,
                null,
                null,
                selected.StartedAt,
                null,
                null,
                waitingSince: selected.WaitingSince,
                incrementRetry: false,
                cancellationToken);
            return selected;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task UpdateStatusAsync(
        string jobId,
        PrintJobStatus status,
        string? errorCode = null,
        string? errorMessage = null,
        CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            DateTimeOffset? completedAt = status is PrintJobStatus.Completed or PrintJobStatus.SentToPrinter
                ? DateTimeOffset.UtcNow
                : null;
            DateTimeOffset? failedAt = status is PrintJobStatus.Failed or PrintJobStatus.Cancelled or PrintJobStatus.Expired
                ? DateTimeOffset.UtcNow
                : null;

            DateTimeOffset? waitingSince = null;
            var incrementRetry = false;
            if (status == PrintJobStatus.WaitingForPrinter)
            {
                var existing = await GetByIdInternalAsync(connection, jobId, cancellationToken);
                waitingSince = existing?.WaitingSince ?? DateTimeOffset.UtcNow;
                incrementRetry = true;
            }

            await UpdateStatusInternalAsync(
                connection,
                jobId,
                status,
                errorCode,
                errorMessage,
                startedAt: null,
                completedAt,
                failedAt,
                waitingSince,
                incrementRetry,
                cancellationToken);

            if (status is PrintJobStatus.Completed or PrintJobStatus.SentToPrinter)
            {
                await MarkCompletedInternalAsync(connection, jobId, status, cancellationToken);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<PrintJob?> GetByIdAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT * FROM jobs WHERE job_id = $job_id LIMIT 1;";
        command.Parameters.AddWithValue("$job_id", jobId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return MapJob(reader);
    }

    public async Task<IReadOnlyList<PrintJob>> GetPendingAsync(CancellationToken cancellationToken = default)
    {
        var results = new List<PrintJob>();
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT * FROM jobs
            WHERE status NOT IN ('Completed', 'Failed', 'Cancelled', 'Expired', 'SentToPrinter')
            ORDER BY created_at ASC;
            """;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(MapJob(reader));
        }

        return results;
    }

    public async Task<int> GetPendingCountAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COUNT(1) FROM jobs
            WHERE status NOT IN ('Completed', 'Failed', 'Cancelled', 'Expired', 'SentToPrinter');
            """;
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(result);
    }

    public async Task<bool> HasCompletedAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM completed_jobs WHERE job_id = $job_id LIMIT 1;";
        command.Parameters.AddWithValue("$job_id", jobId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null;
    }

    public async Task MarkCompletedAsync(
        string jobId,
        PrintJobStatus status,
        CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);
            await MarkCompletedInternalAsync(connection, jobId, status, cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<PrintJobStatus?> GetCompletedStatusAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT status FROM completed_jobs WHERE job_id = $job_id LIMIT 1;";
        command.Parameters.AddWithValue("$job_id", jobId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        if (result is null or DBNull)
        {
            return null;
        }

        return Enum.Parse<PrintJobStatus>((string)result);
    }

    public async Task PurgeExpiredAsync(TimeSpan retention, CancellationToken cancellationToken = default)
    {
        var cutoff = DateTimeOffset.UtcNow.Subtract(retention).ToString("O");
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM completed_jobs WHERE completed_at < $cutoff;";
        command.Parameters.AddWithValue("$cutoff", cutoff);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpdateStatusInternalAsync(
        SqliteConnection connection,
        string jobId,
        PrintJobStatus status,
        string? errorCode,
        string? errorMessage,
        DateTimeOffset? startedAt,
        DateTimeOffset? completedAt,
        DateTimeOffset? failedAt,
        DateTimeOffset? waitingSince,
        bool incrementRetry,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE jobs SET
                status = $status,
                error_code = COALESCE($error_code, error_code),
                error_message = COALESCE($error_message, error_message),
                started_at = COALESCE($started_at, started_at),
                completed_at = COALESCE($completed_at, completed_at),
                failed_at = COALESCE($failed_at, failed_at),
                waiting_since = COALESCE($waiting_since, waiting_since),
                retry_count = CASE WHEN $increment_retry = 1 THEN retry_count + 1 ELSE retry_count END
            WHERE job_id = $job_id;
            """;
        command.Parameters.AddWithValue("$status", status.ToString());
        command.Parameters.AddWithValue("$error_code", (object?)errorCode ?? DBNull.Value);
        command.Parameters.AddWithValue("$error_message", (object?)errorMessage ?? DBNull.Value);
        command.Parameters.AddWithValue("$started_at", (object?)startedAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$completed_at", (object?)completedAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$failed_at", (object?)failedAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$waiting_since", (object?)waitingSince?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$increment_retry", incrementRetry ? 1 : 0);
        command.Parameters.AddWithValue("$job_id", jobId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<PrintJob?> GetByIdInternalAsync(
        SqliteConnection connection,
        string jobId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT * FROM jobs WHERE job_id = $job_id LIMIT 1;";
        command.Parameters.AddWithValue("$job_id", jobId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return MapJob(reader);
    }

    /// <summary>
    /// Mirrors <c>BluetoothReconnectPolicy</c> delays (5/15/30/60s, max 5m) without a Core→Bluetooth reference.
    /// </summary>
    private static bool IsWaitingJobReady(PrintJob job)
    {
        var attemptIndex = Math.Max(0, job.RetryCount - 1);
        var delay = attemptIndex switch
        {
            0 => TimeSpan.FromSeconds(5),
            1 => TimeSpan.FromSeconds(15),
            2 => TimeSpan.FromSeconds(30),
            3 => TimeSpan.FromSeconds(60),
            _ => TimeSpan.FromMinutes(5)
        };

        var lastAttempt = job.StartedAt ?? job.WaitingSince ?? job.CreatedAt;
        return DateTimeOffset.UtcNow - lastAttempt >= delay;
    }

    private static async Task MarkCompletedInternalAsync(
        SqliteConnection connection,
        string jobId,
        PrintJobStatus status,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO completed_jobs (job_id, status, completed_at)
            VALUES ($job_id, $status, $completed_at)
            ON CONFLICT(job_id) DO UPDATE SET status = excluded.status, completed_at = excluded.completed_at;
            """;
        command.Parameters.AddWithValue("$job_id", jobId);
        command.Parameters.AddWithValue("$status", status.ToString());
        command.Parameters.AddWithValue("$completed_at", DateTimeOffset.UtcNow.ToString("O"));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static void BindJob(SqliteCommand command, PrintJob job)
    {
        command.Parameters.AddWithValue("$job_id", job.JobId);
        command.Parameters.AddWithValue("$tenant_id", job.TenantId);
        command.Parameters.AddWithValue("$bridge_id", job.BridgeId);
        command.Parameters.AddWithValue("$printer_id", job.PrinterId);
        command.Parameters.AddWithValue("$queue_name", (object?)job.QueueName ?? DBNull.Value);
        command.Parameters.AddWithValue("$template_id", (object?)job.TemplateId ?? DBNull.Value);
        command.Parameters.AddWithValue("$template_version", (object?)job.TemplateVersion ?? DBNull.Value);
        command.Parameters.AddWithValue("$width_inches", job.WidthInches);
        command.Parameters.AddWithValue("$height_inches", job.HeightInches);
        command.Parameters.AddWithValue("$dpi", job.Dpi);
        command.Parameters.AddWithValue("$artifact_type", job.ArtifactType);
        command.Parameters.AddWithValue("$artifact_url", (object?)job.ArtifactUrl ?? DBNull.Value);
        command.Parameters.AddWithValue("$artifact_sha256", (object?)job.ArtifactSha256 ?? DBNull.Value);
        command.Parameters.AddWithValue("$local_artifact_path", (object?)job.LocalArtifactPath ?? DBNull.Value);
        command.Parameters.AddWithValue("$copies", job.Copies);
        command.Parameters.AddWithValue("$orientation", job.Orientation);
        command.Parameters.AddWithValue("$requested_by", (object?)job.RequestedBy ?? DBNull.Value);
        command.Parameters.AddWithValue("$expires_at", (object?)job.ExpiresAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$status", job.Status.ToString());
        command.Parameters.AddWithValue("$error_code", (object?)job.ErrorCode ?? DBNull.Value);
        command.Parameters.AddWithValue("$error_message", (object?)job.ErrorMessage ?? DBNull.Value);
        command.Parameters.AddWithValue("$created_at", job.CreatedAt.ToString("O"));
        command.Parameters.AddWithValue("$received_at", (object?)job.ReceivedAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$started_at", (object?)job.StartedAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$completed_at", (object?)job.CompletedAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$failed_at", (object?)job.FailedAt?.ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$retry_count", job.RetryCount);
        command.Parameters.AddWithValue("$waiting_since", (object?)job.WaitingSince?.ToString("O") ?? DBNull.Value);
    }

    private static PrintJob MapJob(SqliteDataReader reader)
    {
        DateTimeOffset? ReadOptionalTime(string column)
        {
            var ordinal = reader.GetOrdinal(column);
            return reader.IsDBNull(ordinal) ? null : DateTimeOffset.Parse(reader.GetString(ordinal));
        }

        DateTimeOffset? waitingSince = null;
        try
        {
            waitingSince = ReadOptionalTime("waiting_since");
        }
        catch (IndexOutOfRangeException)
        {
            // Pre-migration databases.
        }

        return new PrintJob
        {
            JobId = reader.GetString(reader.GetOrdinal("job_id")),
            TenantId = reader.GetString(reader.GetOrdinal("tenant_id")),
            BridgeId = reader.GetString(reader.GetOrdinal("bridge_id")),
            PrinterId = reader.GetString(reader.GetOrdinal("printer_id")),
            QueueName = reader.IsDBNull(reader.GetOrdinal("queue_name")) ? null : reader.GetString(reader.GetOrdinal("queue_name")),
            TemplateId = reader.IsDBNull(reader.GetOrdinal("template_id")) ? null : reader.GetString(reader.GetOrdinal("template_id")),
            TemplateVersion = reader.IsDBNull(reader.GetOrdinal("template_version")) ? null : reader.GetInt32(reader.GetOrdinal("template_version")),
            WidthInches = reader.GetDouble(reader.GetOrdinal("width_inches")),
            HeightInches = reader.GetDouble(reader.GetOrdinal("height_inches")),
            Dpi = reader.GetInt32(reader.GetOrdinal("dpi")),
            ArtifactType = reader.GetString(reader.GetOrdinal("artifact_type")),
            ArtifactUrl = reader.IsDBNull(reader.GetOrdinal("artifact_url")) ? null : reader.GetString(reader.GetOrdinal("artifact_url")),
            ArtifactSha256 = reader.IsDBNull(reader.GetOrdinal("artifact_sha256")) ? null : reader.GetString(reader.GetOrdinal("artifact_sha256")),
            LocalArtifactPath = reader.IsDBNull(reader.GetOrdinal("local_artifact_path")) ? null : reader.GetString(reader.GetOrdinal("local_artifact_path")),
            Copies = reader.GetInt32(reader.GetOrdinal("copies")),
            Orientation = reader.GetString(reader.GetOrdinal("orientation")),
            RequestedBy = reader.IsDBNull(reader.GetOrdinal("requested_by")) ? null : reader.GetString(reader.GetOrdinal("requested_by")),
            ExpiresAt = reader.IsDBNull(reader.GetOrdinal("expires_at")) ? null : DateTimeOffset.Parse(reader.GetString(reader.GetOrdinal("expires_at"))),
            Status = Enum.Parse<PrintJobStatus>(reader.GetString(reader.GetOrdinal("status"))),
            ErrorCode = reader.IsDBNull(reader.GetOrdinal("error_code")) ? null : reader.GetString(reader.GetOrdinal("error_code")),
            ErrorMessage = reader.IsDBNull(reader.GetOrdinal("error_message")) ? null : reader.GetString(reader.GetOrdinal("error_message")),
            CreatedAt = DateTimeOffset.Parse(reader.GetString(reader.GetOrdinal("created_at"))),
            ReceivedAt = reader.IsDBNull(reader.GetOrdinal("received_at")) ? null : DateTimeOffset.Parse(reader.GetString(reader.GetOrdinal("received_at"))),
            StartedAt = reader.IsDBNull(reader.GetOrdinal("started_at")) ? null : DateTimeOffset.Parse(reader.GetString(reader.GetOrdinal("started_at"))),
            CompletedAt = reader.IsDBNull(reader.GetOrdinal("completed_at")) ? null : DateTimeOffset.Parse(reader.GetString(reader.GetOrdinal("completed_at"))),
            FailedAt = reader.IsDBNull(reader.GetOrdinal("failed_at")) ? null : DateTimeOffset.Parse(reader.GetString(reader.GetOrdinal("failed_at"))),
            RetryCount = reader.GetInt32(reader.GetOrdinal("retry_count")),
            WaitingSince = waitingSince
        };
    }
}
