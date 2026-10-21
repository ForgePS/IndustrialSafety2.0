/**
 * Upsert industrial_emergency_alert_settings SMS config for a tenant.
 * Runs inside platform-api ECS (uses DATABASE_SECRET_ARN).
 *
 * Env:
 *   TENANT_KEY=producers-rice-mill (required; allowlisted)
 *   ORIGINATION_IDENTITY=+17165719731 | phone-...
 *   SMS_ENABLED=1 (default 1)
 *   DRY_RUN=0 (default 0 — real SendTextMessage after production access)
 *   CONFIGURATION_SET_NAME= (optional)
 *   APPLY=1 to write; otherwise dry-run report only
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
const ORIGINATION_IDENTITY = (process.env.ORIGINATION_IDENTITY || "").trim();
const SMS_ENABLED = !(process.env.SMS_ENABLED === "0" || process.env.SMS_ENABLED === "false");
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const CONFIGURATION_SET_NAME = (process.env.CONFIGURATION_SET_NAME || "").trim();
const PROVIDER = "AWS_END_USER_MESSAGING";

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}
if (!ORIGINATION_IDENTITY) {
  throw new Error("ORIGINATION_IDENTITY required (+E164 or phone-number-id)");
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

    const [existing] = await sql`
      select
        id::text as id,
        sms_provider,
        sms_enabled,
        settings_json
      from industrial_emergency_alert_settings
      where tenant_id = ${tenant.id}::uuid
      limit 1
    `;

    const prevBag =
      existing?.settings_json && typeof existing.settings_json === "object"
        ? { ...existing.settings_json }
        : {};
    const nextBag = {
      ...prevBag,
      originationIdentity: ORIGINATION_IDENTITY,
      messageType: "TRANSACTIONAL",
      dryRun: DRY_RUN,
    };
    if (CONFIGURATION_SET_NAME) {
      nextBag.configurationSetName = CONFIGURATION_SET_NAME;
    } else {
      delete nextBag.configurationSetName;
    }

    const report = {
      tenantKey: TENANT_KEY,
      tenantId: tenant.id,
      displayName: tenant.display_name,
      apply: APPLY,
      before: existing
        ? {
            smsProvider: existing.sms_provider,
            smsEnabled: existing.sms_enabled,
            settingsJson: existing.settings_json,
          }
        : null,
      after: {
        smsProvider: PROVIDER,
        smsEnabled: SMS_ENABLED,
        settingsJson: nextBag,
      },
    };

    if (APPLY) {
      if (existing) {
        await sql`
          update industrial_emergency_alert_settings
          set
            sms_provider = ${PROVIDER},
            sms_enabled = ${SMS_ENABLED},
            settings_json = ${sql.json(nextBag)},
            updated_at = now()
          where id = ${existing.id}::uuid
        `;
        report.action = "updated";
      } else {
        const id = randomUUID();
        await sql`
          insert into industrial_emergency_alert_settings (
            id,
            tenant_id,
            sms_provider,
            sms_enabled,
            mvix_enabled,
            in_app_enabled,
            require_send_confirmation,
            default_channels_json,
            settings_json,
            created_at,
            updated_at
          ) values (
            ${id}::uuid,
            ${tenant.id}::uuid,
            ${PROVIDER},
            ${SMS_ENABLED},
            true,
            true,
            true,
            ${sql.json(["SMS", "IN_APP", "MVIX"])},
            ${sql.json(nextBag)},
            now(),
            now()
          )
        `;
        report.action = "inserted";
      }
    } else {
      report.action = "dry_run_no_write";
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
