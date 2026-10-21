#!/usr/bin/env node
/**
 * Sync OSHA case titles from linked incident titles for producers-rice-mill.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/run-ecs-fix-osha-incident-titles.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/run-ecs-fix-osha-incident-titles.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const TENANT_KEY = process.env.TENANT_KEY || "producers-rice-mill";
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true" ? "1" : "0";
const ADMIN_SECRET_NAME =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";
const IMPORTS_BUCKET =
  process.env.FORGE_IMPORTS_BUCKET || "forge-production-imports-511343547817-us-east-1";
const LOG_GROUP = process.env.FORGE_API_LOG_GROUP || "/forge/production/platform-api";

if (TENANT_KEY !== "producers-rice-mill") {
  console.error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
  process.exit(1);
}

const prefix = `fix/osha-incident-titles/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${prefix}/fix-osha-incident-titles.mjs`;
const local = path.resolve("scripts/fix-osha-incident-titles.mjs");

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
  `writeFileSync("/tmp/fix-osha-incident-titles.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/fix-osha-incident-titles.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  `fix-osha-titles-${APPLY === "1" ? "apply" : "dry"}-${TENANT_KEY}`,
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

spawnSync(
  "aws",
  ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn],
  { encoding: "utf8", shell: true },
);

const logs = spawnSync(
  "aws",
  ["logs", "tail", LOG_GROUP, "--since", "15m", "--format", "short"],
  { encoding: "utf8", shell: true, maxBuffer: 10 * 1024 * 1024 },
);
if (logs.stdout) {
  const lines = logs.stdout.split(/\r?\n/).filter((line) =>
    /wouldUpdate|updated|sample|Don Baity|Oscar|slash|Dry-run|apply|oshaCases/.test(line),
  );
  console.log(lines.join("\n"));
  const idx = logs.stdout.lastIndexOf('"oshaCases"');
  if (idx >= 0) console.log(logs.stdout.slice(idx, idx + 2200));
}
