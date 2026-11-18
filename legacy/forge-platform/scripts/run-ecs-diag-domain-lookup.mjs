#!/usr/bin/env node
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";
import { spawnSync } from "node:child_process";

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  "forge-production-secrets-database",
  "--query",
  "ARN",
]);

const script = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import { createDatabase } from "@forge/database";
const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const rows = await db.execute(sql\`select * from forge_lookup_tenant_domain('producersrice.forgepublicsafety.com')\`);
const all = await db.execute(sql\`select domain, verification_status, tenant_id::text from tenant_domains where domain ilike '%producers%' order by 1\`);
console.info(JSON.stringify({lookup: rows.rows??rows, domains: all.rows??all},null,2));
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "diag-domain-lookup",
  { forgeEnvironment: "production", environment: { DATABASE_SECRET_ARN: adminSecretArn } },
);
spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
});
const taskId = taskArn.split("/").pop();
const logs = spawnSync(
  "aws",
  [
    "logs",
    "get-log-events",
    "--log-group-name",
    "/forge/production/platform-api",
    "--log-stream-name",
    `platform-api/platform-api/${taskId}`,
    "--limit",
    "20",
    "--query",
    "events[-1].message",
    "--output",
    "text",
  ],
  { encoding: "utf8", shell: true },
);
process.stdout.write(String(logs.stdout || logs.stderr || ""));
