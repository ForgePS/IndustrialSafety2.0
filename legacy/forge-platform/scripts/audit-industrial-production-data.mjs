#!/usr/bin/env node
/**
 * READ-ONLY production/dev audit of Industrial Model A vs deprecated Model B.
 * Quantifies normalized row counts and detects industrial_ops_records.
 *
 * Usage: node scripts/audit-industrial-production-data.mjs --env <development|production>
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const forgeEnvironment = envIndex === -1 ? null : args[envIndex + 1];
if (!forgeEnvironment || !["development", "production"].includes(forgeEnvironment)) {
  console.error(
    "Usage: node scripts/audit-industrial-production-data.mjs --env <development|production>",
  );
  process.exit(1);
}

process.env.FORGE_ENV = forgeEnvironment;

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

const tables = [
  "industrial_sites","industrial_departments","industrial_personnel","industrial_positions",
  "industrial_employment_types","industrial_equipment","industrial_incidents","industrial_inspections",
  "industrial_observations","industrial_jsas","industrial_training_records","industrial_form_definitions",
  "industrial_form_submissions","industrial_loto_procedures","industrial_loto_records",
  "industrial_corrective_actions","industrial_workers_comp_cases","industrial_fleet_vehicles",
  "industrial_fleet_drivers","qr_links","industrial_scan_qr_codes","platform_documents",
  "industrial_attachments","industrial_migration_id_map","industrial_history_records",
  "industrial_ops_records"
];

const presence = {};
const counts = {};
for (const t of tables) {
  const reg = await db.execute(sql.raw(\`select to_regclass('public.\${t}')::text as reg\`));
  const name = rows(reg)[0]?.reg ?? null;
  presence[t] = name;
  if (!name) { counts[t] = null; continue; }
  const c = await db.execute(sql.raw(\`select count(*)::text as n from "\${t}"\`));
  counts[t] = Number(rows(c)[0]?.n ?? 0);
}

let opsTypes = [];
if (presence.industrial_ops_records) {
  const t = await db.execute(sql\`
    select module::text as module, count(*)::text as n
    from industrial_ops_records
    group by module
    order by module
  \`);
  opsTypes = rows(t);
}

const classification =
  !presence.industrial_ops_records ? "ABSENT" :
  Number(counts.industrial_ops_records) === 0 ? "DORMANT_DATA" :
  "ACTIVE_OR_UNKNOWN";

console.info("AUDIT_JSON_START");
console.info(JSON.stringify({
  environment: process.env.FORGE_ENV ?? null,
  presence,
  counts,
  opsModuleBreakdown: opsTypes,
  industrialOpsRecordsClassification: classification,
}));
console.info("AUDIT_JSON_END");
process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  `audit-industrial-data-${forgeEnvironment}`,
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
  console.error("Could not parse audit output. Raw logs:\n" + text);
  process.exit(1);
}

const audit = JSON.parse(match[1]);
const out = `diag-industrial-data-audit-${forgeEnvironment}.json`;
writeFileSync(out, JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
console.log(`\nwrote ${out}`);
