/**
 * Disable Industrial legal acknowledgment login gate (stops /legal/acknowledge redirect).
 * Does not delete documents or acknowledgment evidence.
 *
 * Env:
 *   DATABASE_SECRET_ARN (required)
 *   APPLY=1 to mutate (default dry-run)
 *   FORGE_ENV=production|development
 *   TENANT_KEY optional — also write tenant override false (default producers-rice-mill)
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const TENANT_KEY = process.env.TENANT_KEY?.trim() || "producers-rice-mill";
const FLAG_KEY = "industrial.legalAcknowledgments.loginGate.enabled";

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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");

  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  const report = { apply: APPLY, flagKey: FLAG_KEY, tenantKey: TENANT_KEY, actions: [] };

  try {
    const [def] = await sql`
      select id::text as id, key, default_value_json
      from feature_definitions
      where key = ${FLAG_KEY}
      limit 1
    `;
    if (!def) throw new Error(`Feature definition not found: ${FLAG_KEY}`);
    report.beforeDefinition = def;

    const [tenant] = await sql`
      select id::text as id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
    report.tenant = tenant;

    const [overrideBefore] = await sql`
      select id::text as id, value_json
      from feature_overrides
      where tenant_id = ${tenant.id}::uuid
        and feature_definition_id = ${def.id}::uuid
        and user_id is null
        and organization_id is null
      limit 1
    `;
    report.beforeOverride = overrideBefore ?? null;

    if (!APPLY) {
      report.actions.push({ step: "dry_run", action: "would_set_default_and_tenant_override_false" });
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const [updatedDef] = await sql`
      update feature_definitions
      set default_value_json = 'false'::jsonb,
          updated_at = now()
      where id = ${def.id}::uuid
      returning id::text as id, key, default_value_json
    `;
    report.actions.push({ step: "feature_definition", action: "default_false", after: updatedDef });

    if (overrideBefore) {
      const [updatedOv] = await sql`
        update feature_overrides
        set value_json = 'false'::jsonb,
            reason = 'Disable legal acknowledgment login gate (draft docs)',
            record_version = record_version + 1,
            updated_at = now()
        where id = ${overrideBefore.id}::uuid
        returning id::text as id, value_json
      `;
      report.actions.push({ step: "feature_override", action: "update_false", after: updatedOv });
    } else {
      const [systemUser] = await sql`
        select id::text as id from users order by created_at asc limit 1
      `;
      if (!systemUser?.id) throw new Error("No users row available for created_by_user_id");
      const [inserted] = await sql`
        insert into feature_overrides (
          id, tenant_id, organization_id, user_id, feature_definition_id,
          value_json, reason, created_by_user_id, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenant.id}::uuid, null, null, ${def.id}::uuid,
          'false'::jsonb, 'Disable legal acknowledgment login gate (draft docs)',
          ${systemUser.id}::uuid, now(), now()
        )
        returning id::text as id, value_json
      `;
      report.actions.push({
        step: "feature_override",
        action: "insert_false",
        after: inserted,
        createdByUserId: systemUser.id,
      });
    }

    const [verify] = await sql`
      select fd.key, fd.default_value_json, fo.value_json as override_value
      from feature_definitions fd
      left join feature_overrides fo
        on fo.feature_definition_id = fd.id
       and fo.tenant_id = ${tenant.id}::uuid
       and fo.user_id is null
       and fo.organization_id is null
      where fd.key = ${FLAG_KEY}
      limit 1
    `;
    report.verify = verify;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
