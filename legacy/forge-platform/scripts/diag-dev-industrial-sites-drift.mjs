#!/usr/bin/env node
/**
 * Diagnose why 0040_industrial_domain_s1 fails on development (schema drift).
 */
import { spawnSync } from "node:child_process";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

process.env.FORGE_ENV = "development";
const forgeEnvironment = "development";

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  `forge-${forgeEnvironment}-secrets-database`,
  "--query",
  "ARN",
]);

const script = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import { createDatabase } from "@forge/database";
const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const rows = (r) => r.rows ?? r;
const cols = await db.execute(sql\`
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'industrial_sites'
  order by ordinal_position
\`);
const indexes = await db.execute(sql\`
  select indexname, indexdef
  from pg_indexes
  where schemaname = 'public' and tablename = 'industrial_sites'
  order by indexname
\`);
console.info("AUDIT_JSON_START");
console.info(JSON.stringify({ columns: rows(cols), indexes: rows(indexes) }));
console.info("AUDIT_JSON_END");
process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "diag-dev-industrial-sites",
  { forgeEnvironment, environment: { DATABASE_SECRET_ARN: adminSecretArn } },
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
    `/forge/${forgeEnvironment}/platform-api`,
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
const match = text.match(/AUDIT_JSON_START\s*([\s\S]*?)\s*AUDIT_JSON_END/);
if (!match) {
  console.error("Could not parse output.\n" + text);
  process.exit(1);
}
console.log(JSON.stringify(JSON.parse(match[1]), null, 2));
