#!/usr/bin/env node
/**
 * Controlled DLQ poison exercise for S8 closeout (synthetic only).
 * Sends an intentionally invalid IMPORT_EXECUTE-shaped message that cannot
 * commit records, waits for DLQ, inspects sanitized metadata, dry-runs replay.
 *
 * Usage:
 *   node scripts/import-s8-dlq-poison-exercise.mjs --env development --operator <you> --confirm
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}
function has(name) {
  return process.argv.includes(`--${name}`);
}
function aws(args) {
  const profile = process.env.AWS_PROFILE || "forge-dev";
  const region = process.env.AWS_REGION || "us-east-1";
  const r = spawnSync(
    "aws",
    [...args, "--profile", profile, "--region", region, "--output", "json"],
    {
      encoding: "utf8",
    },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "aws failed");
  return r.stdout ? JSON.parse(r.stdout) : {};
}

const env = arg("env");
const operator = arg("operator", process.env.USERNAME || "unknown");
if (!env) {
  console.error("--env required");
  process.exit(2);
}
if (!has("confirm")) {
  console.error("Refusing: pass --confirm for controlled poison exercise");
  process.exit(2);
}

const account = "511343547817";
const region = process.env.AWS_REGION || "us-east-1";
const mainUrl = `https://sqs.${region}.amazonaws.com/${account}/forge-${env}-sqs-imports`;
const dlqUrl = `https://sqs.${region}.amazonaws.com/${account}/forge-${env}-sqs-imports-dlq`;
const correlationId = `s8-dlq-poison-${Date.now()}`;

// Invalid schema / unknown job — worker must reject safely without committing rows.
const poisonBody = JSON.stringify({
  messageType: "IMPORT_EXECUTE",
  schemaVersion: "1",
  tenantId: "00000000-0000-0000-0000-000000000000",
  jobId: "00000000-0000-0000-0000-000000000000",
  fileId: "00000000-0000-0000-0000-000000000000",
  correlationId,
  // Intentionally omit required fields / use impossible UUIDs
  poison: true,
  note: "S8 controlled poison — no sensitive payload",
});

const send = aws([
  "sqs",
  "send-message",
  "--queue-url",
  mainUrl,
  "--message-body",
  poisonBody,
  "--message-attributes",
  JSON.stringify({
    correlationId: { DataType: "String", StringValue: correlationId },
    messageType: { DataType: "String", StringValue: "IMPORT_EXECUTE" },
    s8Poison: { DataType: "String", StringValue: "true" },
  }),
]);

const started = Date.now();
let dlqDepth = 0;
let waitedMs = 0;
while (Date.now() - started < 180_000) {
  const attrs = aws([
    "sqs",
    "get-queue-attributes",
    "--queue-url",
    dlqUrl,
    "--attribute-names",
    "ApproximateNumberOfMessages",
  ]);
  dlqDepth = Number(attrs.Attributes?.ApproximateNumberOfMessages ?? 0);
  if (dlqDepth >= 1) break;
  spawnSync(
    process.platform === "win32" ? "timeout" : "sleep",
    process.platform === "win32" ? ["/m", "15"] : ["15"],
    {
      shell: true,
    },
  );
  waitedMs = Date.now() - started;
}

const inspect = spawnSync(
  "node",
  ["scripts/import-dlq-ops.mjs", "--env", env, "--mode", "inspect", "--max", "5"],
  { encoding: "utf8" },
);
const dryRun = spawnSync(
  "node",
  ["scripts/import-dlq-ops.mjs", "--env", env, "--mode", "dry-run-replay"],
  { encoding: "utf8" },
);

const evidence = {
  correlationId,
  operator,
  env,
  messageId: send.MessageId,
  bodyNotLogged: true,
  waitedMs,
  dlqDepth,
  inspectExit: inspect.status,
  dryRunExit: dryRun.status,
  inspectStdout: inspect.stdout,
  dryRunStdout: dryRun.stdout,
  note: "Replay of poison not auto-executed; operator may purge or leave for investigation",
  at: new Date().toISOString(),
};

mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
writeFileSync(
  "docs/testing/evidence/import-platform/s8-dlq-poison.json",
  JSON.stringify(evidence, null, 2),
);
console.log(
  JSON.stringify(
    { ok: dlqDepth >= 1, correlationId, dlqDepth, messageId: send.MessageId },
    null,
    2,
  ),
);
process.exit(dlqDepth >= 1 ? 0 : 1);
