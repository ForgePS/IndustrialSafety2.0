#!/usr/bin/env node
/**
 * ECS one-off: remove a training assignment assignee row.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const ASSIGNMENT_TITLE = process.env.ASSIGNMENT_TITLE || "";
const EMPLOYEE_NUMBER = process.env.EMPLOYEE_NUMBER || "";
const STATUS = process.env.STATUS || "NOT_STARTED";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}
if (!ASSIGNMENT_TITLE.trim() || !EMPLOYEE_NUMBER.trim()) {
  console.error("ASSIGNMENT_TITLE and EMPLOYEE_NUMBER are required");
  process.exit(1);
}

const prefix = `fix/training-remove-assignee/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/remove-training-assignment-assignee.mjs`;
const local = path.resolve("scripts/remove-training-assignment-assignee.mjs");

const up = spawnSync("aws", ["s3", "cp", local, `s3://${IMPORTS_BUCKET}/${key}`], {
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
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/remove-training-assignment-assignee.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/remove-training-assignment-assignee.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `remove-training-assignee-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
  {
    forgeEnvironment: "production",
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      TENANT_KEY,
      ASSIGNMENT_TITLE,
      EMPLOYEE_NUMBER,
      STATUS,
      APPLY,
    },
  },
);

console.log(JSON.stringify({ cluster, taskArn, apply: APPLY === "1" }, null, 2));

const wait = spawnSync(
  "aws",
  ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn],
  { encoding: "utf8", shell: true },
);
if (wait.status !== 0) {
  console.error(wait.stderr || wait.stdout);
  process.exit(1);
}

const desc = spawnSync(
  "aws",
  ["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn, "--output", "json"],
  { encoding: "utf8", shell: true },
);
if (desc.status === 0) {
  const parsed = JSON.parse(desc.stdout);
  const task = parsed.tasks?.[0];
  console.log(
    JSON.stringify({
      lastStatus: task?.lastStatus,
      stopCode: task?.stopCode,
      stoppedReason: task?.stoppedReason,
      containerExitCode: task?.containers?.[0]?.exitCode,
    }),
  );
  if (task?.containers?.[0]?.exitCode !== 0) process.exit(1);
}
