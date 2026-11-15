/**
 * Enable seasonal pre-hire lifecycle for producers-rice-mill.
 *
 * - feature_definitions row for industrial.personnel.seasonalLifecycle.enabled
 * - tenant feature_overrides value true
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/enable-seasonal-lifecycle-flag.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);
const FLAG_KEY = "industrial.personnel.seasonalLifecycle.enabled";

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

async function resolveDatabaseUrl(secretArn) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

function isTrueJson(value) {
  return value === true || value === "true" || JSON.stringify(value) === "true";
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const [tenant] = await sql`
      select id::text as id, tenant_key, display_name
      from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const report = {
      tenantKey: TENANT_KEY,
      tenantId: tenant.id,
      flagKey: FLAG_KEY,
      apply: APPLY,
      actions: [],
    };

    let [flagDef] = await sql`
      select id::text as id, default_value_json
      from feature_definitions
      where key = ${FLAG_KEY}
      limit 1
    `;
    if (!flagDef) {
      report.actions.push({ step: "feature_definition", action: "insert" });
      if (APPLY) {
        const id = randomUUID();
        await sql`
          insert into feature_definitions (
            id, key, name, description, value_type, default_value_json, status, created_at, updated_at
          ) values (
            ${id}::uuid, ${FLAG_KEY}, 'Personnel seasonal lifecycle',
            'Enables pre-hire seasonal workforce intake, orientation, and activation in Personnel',
            'BOOLEAN', 'false'::jsonb, 'ACTIVE', now(), now()
          )
        `;
        flagDef = { id, default_value_json: false };
      }
    } else {
      report.actions.push({ step: "feature_definition", action: "unchanged" });
    }

    const [actor] = await sql`
      select u.id::text as id
      from users u
      join user_tenant_memberships m on m.user_id = u.id
      where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
      order by m.is_default_tenant desc, u.activated_at nulls last
      limit 1
    `;

    if (!flagDef) {
      report.actions.push({ step: "feature_override", action: "skipped_dry_run_no_definition" });
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (!actor) {
      report.actions.push({ step: "feature_override", action: "skipped_no_actor_user" });
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const [override] = await sql`
      select id::text as id, value_json
      from feature_overrides
      where tenant_id = ${tenant.id}::uuid
        and feature_definition_id = ${flagDef.id}::uuid
        and organization_id is null
        and user_id is null
      limit 1
    `;

    if (!override) {
      report.actions.push({ step: "feature_override", action: "insert_enabled" });
      if (APPLY) {
        await sql`
          insert into feature_overrides (
            id, tenant_id, feature_definition_id, value_json, reason, created_by_user_id, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${flagDef.id}::uuid,
            'true'::jsonb, 'Enable seasonal workforce lifecycle for Producers Rice Mill',
            ${actor.id}::uuid, now(), now()
          )
        `;
      }
    } else if (!isTrueJson(override.value_json)) {
      report.actions.push({ step: "feature_override", action: "enable" });
      if (APPLY) {
        await sql`
          update feature_overrides
          set value_json = 'true'::jsonb,
              reason = 'Enable seasonal workforce lifecycle for Producers Rice Mill',
              updated_at = now()
          where id = ${override.id}::uuid
        `;
      }
    } else {
      report.actions.push({ step: "feature_override", action: "unchanged_already_enabled" });
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
