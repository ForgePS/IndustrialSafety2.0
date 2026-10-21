#!/usr/bin/env node
/**
 * Apply 0094_user_push_subscriptions_s1 via ECS one-off.
 * Defaults to Development. Refuses production without --allow-production.
 *
 * Dry-run:
 *   node scripts/run-ecs-apply-user-push-subscriptions-migration.mjs --env development
 * Apply:
 *   node scripts/run-ecs-apply-user-push-subscriptions-migration.mjs --env development --apply
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const forgeEnvironment = envIndex === -1 ? "development" : args[envIndex + 1];
const APPLY = args.includes("--apply") ? "1" : "0";
const ALLOW_PRODUCTION = args.includes("--allow-production") ? "1" : "0";

if (!["development", "production"].includes(forgeEnvironment)) {
  console.error(
    "Usage: node scripts/run-ecs-apply-user-push-subscriptions-migration.mjs --env <development|production> [--apply]",
  );
  process.exit(1);
}
if (forgeEnvironment === "production" && ALLOW_PRODUCTION !== "1") {
  console.error("Refusing production without --allow-production");
  process.exit(1);
}

process.env.FORGE_ENV = forgeEnvironment;

const adminSecretName = `forge-${forgeEnvironment}-secrets-database`;
const importsBucket =
  process.env.FORGE_IMPORTS_BUCKET ||
  `forge-${forgeEnvironment}-imports-511343547817-us-east-1`;
const logGroup = `/forge/${forgeEnvironment}/platform-api`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localScript = path.join(__dirname, "apply-user-push-subscriptions-migration.mjs");
const sql0094 = path.join(
  __dirname,
  "..",
  "packages",
  "database",
  "drizzle",
  "0094_user_push_subscriptions_s1.sql",
);

const prefix = `user-push/migrations/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const scriptKey = `${prefix}/apply-user-push-subscriptions-migration.mjs`;
const key0094 = `${prefix}/0094_user_push_subscriptions_s1.sql`;

for (const [local, key] of [
  [localScript, scriptKey],
  [sql0094, key0094],
]) {
  const up = spawnSync("aws", ["s3", "cp", local, `s3://${importsBucket}/${key}`], {
    encoding: "utf8",
    shell: true,
  });
  if (up.status !== 0) {
    console.error(up.stderr || up.stdout);
    process.exit(1);
  }
}

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  adminSecretName,
  "--query",
  "ARN",
]);

if (!adminSecretArn.includes(`forge-${forgeEnvironment}-`) || adminSecretArn.includes("database-app")) {
  throw new Error(`Refusing non-admin secret ARN: ${adminSecretArn}`);
}

console.log(
  JSON.stringify(
    {
      forgeEnvironment,
      apply: APPLY === "1",
      adminSecretName,
      importsBucket,
      scriptKey,
      key0094,
      sql0094Bytes: readFileSync(sql0094).length,
    },
    null,
    2,
  ),
);

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(importsBucket)};`,
  `const scriptKey=${JSON.stringify(scriptKey)};`,
  `const key0094=${JSON.stringify(key0094)};`,
  `const c=new S3Client({});`,
  `const scriptObj=await c.send(new GetObjectCommand({Bucket:bucket,Key:scriptKey}));`,
  `const sql0094Obj=await c.send(new GetObjectCommand({Bucket:bucket,Key:key0094}));`,
  `writeFileSync("/tmp/apply-user-push-subscriptions-migration.mjs", await scriptObj.Body.transformToString("utf8"));`,
  `writeFileSync("/tmp/0094_user_push_subscriptions_s1.sql", await sql0094Obj.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/apply-user-push-subscriptions-migration.mjs"],{stdio:"inherit",env:{...process.env,SQL_0094_PATH:"/tmp/0094_user_push_subscriptions_s1.sql"}});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `push-mig-${APPLY === "1" ? "apply" : "dry"}-${forgeEnvironment}`,
  {
    forgeEnvironment,
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
      FORGE_ENV: forgeEnvironment,
      APPLY,
      ALLOW_PRODUCTION,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 900_000,
});

const exitCode = spawnSync(
  "aws",
  [
    "ecs",
    "describe-tasks",
    "--cluster",
    cluster,
    "--tasks",
    taskArn,
    "--region",
    "us-east-1",
    "--query",
    "tasks[0].containers[0].exitCode",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);

const taskId = taskArn.split("/").pop();
const logs = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    logGroup,
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "200",
    "--region",
    "us-east-1",
    "--output",
    "json",
  ],
  { encoding: "utf8", shell: true },
);

const text = (JSON.parse(logs.stdout || "{}").events || []).map((e) => e.message).join("\n");
console.log(text);

const code = String(exitCode.stdout || "").trim();
console.log(`\npush-subscriptions migration exitCode=${code} environment=${forgeEnvironment} apply=${APPLY}`);
process.exit(code === "0" ? 0 : 1);
