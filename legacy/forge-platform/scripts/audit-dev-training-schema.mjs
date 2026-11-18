#!/usr/bin/env node
/**
 * Probe development Aurora for industrial training / LMS tables.
 * Usage: node scripts/audit-dev-training-schema.mjs
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

const tables = [
  "industrial_training_sources",
  "industrial_training_questions",
  "industrial_training_assignments",
  "industrial_training_assignment_assignees",
  "industrial_training_attempts",
  "industrial_training_portal_sessions",
  "industrial_training_access_links",
  "industrial_training_course_versions",
  "industrial_training_course_sections",
  "industrial_training_progress",
  "industrial_training_completions",
  "industrial_positions",
];

const script = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import { createDatabase } from "@forge/database";
const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const rows = (r) => r.rows ?? r;
const checks = await db.execute(sql.raw(\`
  select
    ${tables.map((t) => `to_regclass('public.${t}')::text as "${t}"`).join(",\n    ")}
\`));
console.info("AUDIT_JSON_START");
console.info(JSON.stringify({ tables: rows(checks)[0] ?? {} }));
console.info("AUDIT_JSON_END");
process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "audit-dev-training-schema",
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
  console.error("Could not parse audit output.\n" + text);
  process.exit(1);
}

const audit = JSON.parse(match[1]);
console.log(JSON.stringify(audit, null, 2));

const missing = tables.filter((t) => !audit.tables[t]);
const present = tables.filter((t) => audit.tables[t]);
console.log(`\npresent (${present.length}): ${present.join(", ") || "(none)"}`);
console.log(`missing (${missing.length}): ${missing.join(", ") || "(none)"}`);
