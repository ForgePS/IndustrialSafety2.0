#!/usr/bin/env node
/**
 * Import DLQ inspect / dry-run replay helper (S8).
 *
 * Safety:
 * - Requires explicit --env
 * - Default mode is dry-run (inspect only)
 * - Never prints message Body (may contain identifiers); prints attributes + MessageId only
 * - Rejects cross-environment queue URLs
 * - Replay requires --confirm-replay AND --message-id
 *
 * Usage:
 *   node scripts/import-dlq-ops.mjs --env development --mode inspect
 *   node scripts/import-dlq-ops.mjs --env development --mode dry-run-replay --message-id <id>
 *   node scripts/import-dlq-ops.mjs --env development --mode replay --message-id <id> --confirm-replay --operator alice
 */
import { spawnSync } from "node:child_process";

function arg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function awsJson(args) {
  const profile = process.env.AWS_PROFILE || "forge-dev";
  const region = process.env.AWS_REGION || "us-east-1";
  const result = spawnSync(
    "aws",
    [...args, "--profile", profile, "--region", region, "--output", "json"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "aws command failed");
  }
  return result.stdout ? JSON.parse(result.stdout) : {};
}

const env = arg("env");
const mode = arg("mode", "inspect");
const messageId = arg("message-id");
const operator = arg("operator", process.env.USER || process.env.USERNAME || "unknown");
const maxMessages = Number(arg("max", "5"));

if (!env) {
  console.error("ERROR: --env is required (e.g. development)");
  process.exit(2);
}

const account = "511343547817";
const region = process.env.AWS_REGION || "us-east-1";
const expectedPrefix = `forge-${env}-sqs-imports`;
const dlqUrl = `https://sqs.${region}.amazonaws.com/${account}/forge-${env}-sqs-imports-dlq`;
const mainUrl = `https://sqs.${region}.amazonaws.com/${account}/forge-${env}-sqs-imports`;

if (!dlqUrl.includes(expectedPrefix)) {
  console.error("ERROR: queue name does not match --env; refusing cross-environment ops");
  process.exit(2);
}

const correlationId = `dlq-ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

console.log(
  JSON.stringify(
    {
      correlationId,
      operator,
      env,
      mode,
      dlqUrl,
      mainUrl,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ),
);

if (mode === "inspect" || mode === "dry-run-replay") {
  const received = awsJson([
    "sqs",
    "receive-message",
    "--queue-url",
    dlqUrl,
    "--max-number-of-messages",
    String(Math.min(Math.max(maxMessages, 1), 10)),
    "--attribute-names",
    "All",
    "--message-attribute-names",
    "All",
    "--visibility-timeout",
    "30",
  ]);
  const messages = received.Messages ?? [];
  const sanitized = messages.map((m) => ({
    messageId: m.MessageId,
    receiptHandlePresent: Boolean(m.ReceiptHandle),
    attributes: m.Attributes ?? {},
    messageAttributes: Object.fromEntries(
      Object.entries(m.MessageAttributes ?? {}).map(([k, v]) => [
        k,
        { dataType: v.DataType, stringValue: v.StringValue ?? "[binary]" },
      ]),
    ),
    bodyBytes: m.Body ? Buffer.byteLength(m.Body, "utf8") : 0,
    bodyPreview: "[REDACTED — not printed by import-dlq-ops]",
  }));
  console.log(JSON.stringify({ count: sanitized.length, messages: sanitized }, null, 2));

  if (mode === "dry-run-replay") {
    const target = messageId ? sanitized.find((m) => m.messageId === messageId) : sanitized[0];
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          wouldReplayMessageId: target?.messageId ?? null,
          wouldSource: dlqUrl,
          wouldDestination: mainUrl,
          note: "No StartMessageMoveTask executed. Pass --mode replay --confirm-replay --message-id <id>",
        },
        null,
        2,
      ),
    );
  }

  // Return messages to DLQ visibility by not deleting; visibility timeout expires.
  process.exit(0);
}

if (mode === "replay") {
  if (!hasFlag("confirm-replay")) {
    console.error("ERROR: replay requires --confirm-replay");
    process.exit(2);
  }
  if (!messageId) {
    console.error("ERROR: replay requires --message-id");
    process.exit(2);
  }
  // Prefer AWS native redrive for the whole DLQ only when operator opts in with --redrive-all.
  // Per-message selective replay uses receive + send + delete without printing body.
  if (hasFlag("redrive-all")) {
    const task = awsJson([
      "sqs",
      "start-message-move-task",
      "--source-arn",
      `arn:aws:sqs:${region}:${account}:forge-${env}-sqs-imports-dlq`,
      "--destination-arn",
      `arn:aws:sqs:${region}:${account}:forge-${env}-sqs-imports`,
    ]);
    console.log(
      JSON.stringify(
        { outcome: "redrive-all-started", task, correlationId, operator, messageIdHint: messageId },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const received = awsJson([
    "sqs",
    "receive-message",
    "--queue-url",
    dlqUrl,
    "--max-number-of-messages",
    "10",
    "--attribute-names",
    "All",
    "--message-attribute-names",
    "All",
    "--visibility-timeout",
    "60",
  ]);
  const match = (received.Messages ?? []).find((m) => m.MessageId === messageId);
  if (!match) {
    console.error(
      JSON.stringify({
        outcome: "not-found",
        messageId,
        note: "Message not in first receive batch or visibility locked. Retry or use --redrive-all with care.",
        correlationId,
      }),
    );
    process.exit(1);
  }
  awsJson([
    "sqs",
    "send-message",
    "--queue-url",
    mainUrl,
    "--message-body",
    match.Body,
    ...(match.MessageAttributes
      ? ["--message-attributes", JSON.stringify(match.MessageAttributes)]
      : []),
  ]);
  awsJson([
    "sqs",
    "delete-message",
    "--queue-url",
    dlqUrl,
    "--receipt-handle",
    match.ReceiptHandle,
  ]);
  console.log(
    JSON.stringify(
      {
        outcome: "replayed",
        messageId,
        correlationId,
        operator,
        bodyNotLogged: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.error(`ERROR: unknown mode ${mode}`);
process.exit(2);
