#!/usr/bin/env node
/**
 * ECS one-off: Producers P2 Phase 1 tenant + persona seed (development Aurora).
 *
 *   node scripts/run-ecs-seed-producers-rice-mill-phase1.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { awsJson, awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const BUCKET =
  process.env.FORGE_IND11B_IMPORTS_BUCKET || "forge-development-imports-511343547817-us-east-1";
const PREFIX = `ind11b/p2-phase1/${new Date().toISOString().replace(/[:.]/g, "-")}`;
const key = `${PREFIX}/seed-producers-rice-mill-phase1.mjs`;
const local = path.resolve("scripts/seed-producers-rice-mill-phase1.mjs");

const up = spawnSync("aws", ["s3", "cp", local, `s3://${BUCKET}/${key}`], {
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
  "forge-development-secrets-database",
  "--query",
  "ARN",
]);

const evalCode = [
  `import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";`,
  `import { writeFileSync } from "node:fs";`,
  `import { spawnSync } from "node:child_process";`,
  `const bucket=${JSON.stringify(BUCKET)};`,
  `const key=${JSON.stringify(key)};`,
  `const c=new S3Client({});`,
  `const r=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));`,
  `writeFileSync("/tmp/seed-producers-phase1.mjs", await r.Body.transformToString("utf8"));`,
  `const run=spawnSync(process.execPath,["/tmp/seed-producers-phase1.mjs"],{stdio:"inherit",env:process.env});`,
  `process.exit(run.status??1);`,
].join("");

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", evalCode],
  "seed-producers-rice-mill-phase1",
  {
    environment: {
      DATABASE_SECRET_ARN: adminSecretArn,
    },
  },
);

spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
  timeout: 900_000,
});

const desc = awsJson(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", taskArn]);
const exitCode = desc.tasks?.[0]?.containers?.[0]?.exitCode;
const taskId = taskArn.split("/").pop();
let logs = "";
try {
  logs = awsText([
    "logs",
    "get-log-events",
    "--log-group-name",
    "/forge/development/platform-api",
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "100",
    "--query",
    "events[*].message",
    "--output",
    "text",
  ]);
} catch (e) {
  logs = String(e.message || e);
}

const evidenceDir = path.resolve(
  "docs/program/industrial-migration/ind-11/evidence/p2/01-tenant-infra",
);
fs.mkdirSync(evidenceDir, { recursive: true });
const evidence = {
  ok: exitCode === 0,
  at: new Date().toISOString(),
  taskArn,
  exitCode,
  logExcerpt: String(logs).slice(0, 20000),
};
fs.writeFileSync(
  path.join(evidenceDir, "phase1-seed-result.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

// Prefer structured JSON from log for tenant-ids.json update
let parsed = null;
try {
  const match = String(logs).match(/\{[\s\S]*"phase":\s*"PRODUCERS-P2-PHASE1-SEED"[\s\S]*\}/);
  if (match) parsed = JSON.parse(match[0].replace(/\t/g, ""));
} catch {
  /* ignore */
}

if (parsed?.ok && Array.isArray(parsed.results)) {
  const staging = parsed.results.find((r) => r.tenantKey === "producers-rice-mill-staging");
  const production = parsed.results.find((r) => r.tenantKey === "producers-rice-mill");
  const ids = {
    pilot: "PRODUCERS_AWS_PRIMARY_P2",
    firebaseBusinessId: "business-1782553339499",
    firebaseProject: "forge-industrial-safety",
    doNotUseTenantIds: ["019faa15-e558-70b6-adcd-a510c3c995f4"],
    provisionedAt: parsed.at,
    tenants: {
      staging: {
        tenantKey: "producers-rice-mill-staging",
        displayName: "Producers Rice Mill (Staging)",
        tenantId: staging?.tenantId ?? null,
        hostname: null,
        adminEmail: staging?.admin?.email ?? null,
        adminUserId: staging?.admin?.userId ?? null,
        modulesEntitled: staging?.entitlements?.modulesEntitled ?? null,
      },
      production: {
        tenantKey: "producers-rice-mill",
        displayName: "Producers Rice Mill",
        tenantId: production?.tenantId ?? null,
        hostname: "https://producers-rice-mill.industrial.forgepublicsafety.com/",
        adminEmail: production?.admin?.email ?? null,
        adminUserId: production?.admin?.userId ?? null,
        modulesEntitled: production?.entitlements?.modulesEntitled ?? null,
      },
    },
    notes: "Provisioned in development Aurora. Do not promote import-acceptance-tenant-a.",
  };
  fs.writeFileSync(path.join(evidenceDir, "tenant-ids.json"), `${JSON.stringify(ids, null, 2)}\n`);
}

console.log(JSON.stringify(evidence, null, 2));
process.exit(exitCode === 0 ? 0 : 1);
