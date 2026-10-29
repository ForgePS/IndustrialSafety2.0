#!/usr/bin/env node
/**
 * Read-only audit of the Drizzle migration ledger for an environment.
 * Adapted for master Model A lineage (FORGE-INDUSTRIAL-MODEL-RECONCILIATION-S1).
 *
 * Usage: node scripts/audit-migration-state.mjs --env <development|production>
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const forgeEnvironment = envIndex === -1 ? null : args[envIndex + 1];
if (!forgeEnvironment || !["development", "production"].includes(forgeEnvironment)) {
  console.error("Usage: node scripts/audit-migration-state.mjs --env <development|production>");
  process.exit(1);
}

process.env.FORGE_ENV = forgeEnvironment;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const journal = JSON.parse(
  readFileSync(
    path.join(__dirname, "..", "packages", "database", "drizzle", "meta", "_journal.json"),
    "utf8",
  ),
);

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
const ledger = await db.execute(sql\`
  select id::text as id, hash, created_at::text as created_at
  from drizzle.__drizzle_migrations
  order by created_at
\`);
const objects = await db.execute(sql\`
  select
    to_regclass('public.tenant_domains')::text as "tenant_domains",
    to_regclass('public.facilities')::text as "facilities (0028_mk)",
    to_regclass('public.industrial_sites')::text as "industrial_sites (0040)",
    to_regclass('public.industrial_personnel')::text as "industrial_personnel (0040)",
    to_regclass('public.industrial_incidents')::text as "industrial_incidents (0040)",
    to_regclass('public.industrial_loto_procedures')::text as "industrial_loto_procedures (0040)",
    to_regclass('public.industrial_workers_comp_cases')::text as "industrial_workers_comp_cases (0040)",
    to_regclass('public.industrial_ops_records')::text as "industrial_ops_records (DEPRECATED)",
    to_regclass('public.industrial_positions')::text as "industrial_positions (0041)"
\`);
console.info("AUDIT_JSON_START");
console.info(JSON.stringify({ ledger: rows(ledger), objects: rows(objects) }));
console.info("AUDIT_JSON_END");
process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  `audit-migrations-${forgeEnvironment}`,
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
const appliedWhen = new Set(audit.ledger.map((r) => String(r.created_at)));
const rawPath = `diag-migration-audit-${forgeEnvironment}.json`;
writeFileSync(rawPath, JSON.stringify(audit, null, 2));

const highWater = audit.ledger.reduce(
  (max, r) => (Number(r.created_at) > max ? Number(r.created_at) : max),
  0,
);
const blocked = journal.entries.filter(
  (e) => !appliedWhen.has(String(e.when)) && e.when <= highWater,
);

console.log(`\nraw audit written to ${rawPath}`);
console.log(`ledger high-water created_at: ${highWater}`);
console.log(
  `unapplied but BLOCKED by high-water: ${
    blocked.length ? blocked.map((e) => e.tag).join(", ") : "(none)"
  }`,
);
console.log(`\n=== ${forgeEnvironment}: migration ledger ===`);
console.log(`ledger rows: ${audit.ledger.length} | journal entries: ${journal.entries.length}`);

const missing = [];
for (const entry of journal.entries) {
  const applied = appliedWhen.has(String(entry.when));
  if (!applied) missing.push(entry.tag);
  console.log(
    `  ${applied ? "APPLIED " : "MISSING "} ${String(entry.idx).padStart(4)} ${entry.tag}`,
  );
}

console.log(`\nmissing tags: ${missing.length ? missing.join(", ") : "(none)"}`);
console.log(`schema objects: ${JSON.stringify(audit.objects, null, 2)}`);
