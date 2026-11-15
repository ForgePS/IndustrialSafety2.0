#!/usr/bin/env node
/**
 * Seed Safety Supplies locations from PRM industrial sites via ECS one-off.
 *
 * Dry-run:
 *   node scripts/run-ecs-seed-safety-supplies-org-locations.mjs
 * Apply:
 *   APPLY=1 node scripts/run-ecs-seed-safety-supplies-org-locations.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

const SCRIPT_LOCAL = path.resolve("scripts/seed-safety-supplies-org-locations.mjs");

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}

const prefix = `seed/safety-supplies-org-locations/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/seed-safety-supplies-org-locations.mjs`;

const up = spawnSync("aws", ["s3", "cp", SCRIPT_LOCAL, `s3://${IMPORTS_BUCKET}/${scriptKey}`], {
  encoding: "utf8",
  shell: true,
});
if (up.status !== 0) {
  console.error(up.stderr || up.stdout);
  process.exit(1);
}

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  ADMIN_SECRET_NAME,
  "--query",
  "ARN",
]);

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(IMPORTS_BUCKET)};`,
  `const scriptKey=${JSON.stringify(scriptKey)};`,
  `const c=new S3Client({});`,
  `const script=await c.send(new GetObjectCommand({Bucket:bucket,Key:scriptKey}));`,
  `writeFileSync("/tmp/seed-safety-supplies-org-locations.mjs", await script.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-safety-supplies-org-locations.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `supplies-org-locs-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      APPLY,
    },
  },
);

console.log(JSON.stringify({ cluster, taskArn, apply: APPLY === "1" }, null, 2));

const taskId = String(taskArn).split("/").pop();
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
  const task = desc?.tasks?.[0];
  const status = task?.lastStatus;
  const stop = task?.stoppedReason;
  const exit = task?.containers?.[0]?.exitCode;
  console.log(`status=${status} exit=${exit ?? "-"} stop=${stop ?? "-"}`);
  if (status === "STOPPED") {
    try {
      const logs = spawnSync(
        "aws",
        [
          "logs",
          "get-log-events",
          "--log-group-name",
          LOG_GROUP,
          "--log-stream-name",
          `platform-api/platform-api/${taskId}`,
          "--limit",
          "100",
          "--query",
          "events[*].message",
          "--output",
          "text",
        ],
        { encoding: "utf8", shell: true },
      );
      if (logs.stdout) console.log(logs.stdout);
    } catch {
      /* ignore log fetch errors */
    }
    process.exit(exit === 0 ? 0 : 1);
  }
}

console.error("Timed out waiting for ECS task");
process.exit(1);
