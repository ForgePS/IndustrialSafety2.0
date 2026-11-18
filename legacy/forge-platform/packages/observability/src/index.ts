import { redactSensitive, safeSerializeError } from "@forge/security";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Operational failure categories for CloudWatch-friendly structured logs (MK-S16). */
export const OBSERVABILITY_ERROR_CATEGORIES = [
  "AUTHORIZATION",
  "JOB",
  "WEBHOOK",
  "EMAIL",
  "VALIDATION",
  "INTERNAL",
  "RATE_LIMIT",
  "DEPENDENCY",
] as const;

export type ObservabilityErrorCategory = (typeof OBSERVABILITY_ERROR_CATEGORIES)[number];

export interface LogContext {
  service: string;
  environment: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  eventType?: string;
  durationMs?: number;
  errorCategory?: ObservabilityErrorCategory;
}

export interface Logger {
  debug: (message: string, fields?: Record<string, unknown>) => void;
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
  child: (context: Partial<LogContext>) => Logger;
}

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function write(
  minLevel: LogLevel,
  level: LogLevel,
  context: LogContext,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  if (levelOrder[level] < levelOrder[minLevel]) return;

  const payload = redactSensitive({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    ...fields,
    error: fields.error ? safeSerializeError(fields.error) : undefined,
  });

  const line = JSON.stringify(payload);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export function createLogger(context: LogContext, options: { level?: LogLevel } = {}): Logger {
  const minLevel = options.level ?? "info";

  const logger: Logger = {
    debug: (message, fields) => write(minLevel, "debug", context, message, fields),
    info: (message, fields) => write(minLevel, "info", context, message, fields),
    warn: (message, fields) => write(minLevel, "warn", context, message, fields),
    error: (message, fields) => write(minLevel, "error", context, message, fields),
    child: (childContext) => createLogger({ ...context, ...childContext }, { level: minLevel }),
  };

  return logger;
}

/** Structured operational failure for CloudWatch Insights queries. Never pass secrets in fields. */
export function logOperationalFailure(
  logger: Logger,
  input: {
    category: ObservabilityErrorCategory;
    message: string;
    correlationId?: string;
    tenantId?: string;
    requestId?: string;
    code?: string;
    error?: unknown;
    fields?: Record<string, unknown>;
  },
): void {
  logger.error(input.message, {
    errorCategory: input.category,
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    requestId: input.requestId,
    code: input.code,
    error: input.error,
    ...(input.fields ?? {}),
  });
}
