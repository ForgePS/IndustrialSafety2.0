#!/usr/bin/env node
/**
 * Apply forge_lookup_tenant_domain DDL in production (admin secret).
 *
 *   node scripts/run-ecs-apply-tenant-domain-lookup.mjs
 */
import { awsText, runPlatformApiOneOff } from "./ecs-oneoff.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminSecretName =
  process.env.FORGE_ADMIN_DB_SECRET_NAME || "forge-production-secrets-database";

const adminSecretArn = awsText([
  "secretsmanager",
  "describe-secret",
  "--secret-id",
  adminSecretName,
  "--query",
  "ARN",
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ddl = readFileSync(
  path.join(__dirname, "..", "packages", "database", "drizzle", "0047_tenant_domain_lookup.sql"),
  "utf8",
);

const script = `
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import { createDatabase } from "@forge/database";
const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
const db = createDatabase(env.DATABASE_URL);
const before = await db.execute(sql\`select to_regprocedure('public.forge_lookup_tenant_domain(text)')::text as fn\`);
const ddl = ${JSON.stringify(ddl)};
await db.execute(sql.raw(ddl));
const after = await db.execute(sql\`select to_regprocedure('public.forge_lookup_tenant_domain(text)')::text as fn\`);
const domains = await db.execute(sql\`select id::text, tenant_id::text, domain, verification_status from tenant_domains where domain ilike '%producers%' order by domain\`);
console.info(JSON.stringify({ok:true,before:before.rows??before,after:after.rows??after,domains:domains.rows??domains},null,2));
process.exit(0);
`;

const { cluster, taskArn } = runPlatformApiOneOff(
  ["node", "--input-type=module", "-e", script],
  "apply-domain-lookup",
  {
    forgeEnvironment: "production",
    environment: { DATABASE_SECRET_ARN: adminSecretArn },
  },
);
spawnSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", taskArn], {
  encoding: "utf8",
  shell: true,
});
