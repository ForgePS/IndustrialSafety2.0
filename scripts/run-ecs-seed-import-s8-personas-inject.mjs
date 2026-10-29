#!/usr/bin/env node
/**
 * Inject gzipped compact S8 persona seed into ECS API one-off (DEF-S8-022).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import zlib from "node:zlib";
import { join } from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const seedPath = join(process.cwd(), "scripts/seed-import-s8-personas-compact.mjs");
const gzB64 = zlib.gzipSync(fs.readFileSync(seedPath), { level: 9 }).toString("base64");
// Write under /app so bare @forge/* and postgres resolve via workspace node_modules.
const target = "/app/packages/database/dist/seed-import-s8-personas-compact.mjs";

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-development-secrets-database",
  "--query",
  "ARN",
]);

const bootstrap = `
import fs from "node:fs";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";
fs.writeFileSync(${JSON.stringify(target)}, zlib.gunzipSync(Buffer.from(${JSON.stringify(gzB64)}, "base64")));
await import(pathToFileURL(${JSON.stringify(target)}).href);
`.trim();

if (Buffer.byteLength(bootstrap, "utf8") > 7500) {
  console.error("bootstrap too large", Buffer.byteLength(bootstrap, "utf8"));
  process.exit(1);
}

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", bootstrap],
  "seed-import-s8-personas-compact",
  {
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      NODE_PATH: "/app/node_modules:/app/apps/platform-api/node_modules",
    },
  },
);

console.log(
  JSON.stringify(
    { started: taskArn, cluster, bootstrapBytes: Buffer.byteLength(bootstrap, "utf8") },
    null,
    2,
  ),
);
execSync(`aws ecs wait tasks-stopped --cluster ${cluster} --tasks ${taskArn}`, {
  stdio: "inherit",
  shell: true,
});

const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
const task = desc.tasks?.[0];
const exitCode = task?.containers?.[0]?.exitCode;
const reason = task?.stoppedReason;
const taskId = taskArn.split("/").pop();
const logGroup = "/forge/development/ecs/platform-api";
const prefix = `platform-api/platform-api/${taskId}`;
let messages = "";
try {
  const streams = awsJson([
    "logs",
    "describe-log-streams",
    "--log-group-name",
    logGroup,
    "--log-stream-name-prefix",
    prefix,
    "--order-by",
    "LastEventTime",
    "--descending",
    "--max-items",
    "3",
  ]);
  const stream = streams.logStreams?.[0]?.logStreamName;
  if (stream) {
    const events = awsJson([
      "logs",
      "get-log-events",
      "--log-group-name",
      logGroup,
      "--log-stream-name",
      stream,
      "--limit",
      "100",
    ]);
    messages = (events.events ?? []).map((e) => e.message).join("\n");
  }
} catch (err) {
  messages = String(err);
}

fs.mkdirSync("docs/testing/evidence/import-platform", { recursive: true });
fs.writeFileSync(
  "docs/testing/evidence/import-platform/s8-personas-seed.json",
  JSON.stringify({ taskArn, exitCode, reason, messages }, null, 2),
);
console.log(messages || JSON.stringify({ exitCode, reason }, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
