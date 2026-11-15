#!/usr/bin/env node
/**
 * Diagnose + fix walkthrough voice for one or more tenants (runs in platform-api ECS).
 *
 *   TENANT_KEYS=forge-platform,producers-rice-mill VOICE_ID=Stephen APPLY=1 node scripts/diag-fix-walkthrough-voice.mjs
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

const TENANT_KEYS = String(process.env.TENANT_KEYS || process.env.TENANT_KEY || "forge-platform")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const VOICE_ID = (process.env.VOICE_ID || "Stephen").trim();
const PROFILE_ID = (process.env.VOICE_PROFILE_ID || "forge-male-conversational").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

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

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const results = [];
  for (const key of TENANT_KEYS) {
    const tenants = await sql`
      select id::text as id, tenant_key, display_name
      from tenants
      where tenant_key = ${key}
         or slug = ${key}
         or lower(display_name) = lower(${key})
      limit 5
    `;
    if (!tenants.length) {
      // fuzzy
      const fuzzy = await sql`
        select id::text as id, tenant_key, display_name
        from tenants
        where tenant_key ilike ${"%" + key + "%"}
           or display_name ilike ${"%" + key + "%"}
        order by tenant_key
        limit 10
      `;
      results.push({ key, ok: false, error: "tenant_not_found", fuzzy });
      continue;
    }
    const tenant = tenants[0];
    const settings = await sql`
      select id::text as id, voice_id, enabled, updated_at
      from industrial_executive_walkthrough_settings
      where tenant_id = ${tenant.id}::uuid
      limit 1
    `;
    const walkthroughs = await sql`
      select id::text as id, code, default_voice_profile_id, name, status
      from walkthroughs
      where tenant_id = ${tenant.id}::uuid
      order by created_at desc
      limit 10
    `;
    const narrationCount = await sql`
      select count(*)::int as n, count(distinct voice_id)::int as voices
      from industrial_executive_walkthrough_narration
      where tenant_id = ${tenant.id}::uuid
    `;
    const before = {
      tenant,
      settings: settings[0] ?? null,
      walkthroughs,
      narration: narrationCount[0] ?? null,
    };

    if (!APPLY) {
      results.push({ key, ok: true, apply: false, before });
      continue;
    }

    let settingsAfter = settings[0] ?? null;
    if (!settings.length) {
      const id = randomUUID();
      const inserted = await sql`
        insert into industrial_executive_walkthrough_settings (
          id, tenant_id, enabled, voice_id, narration_speed, captions_default,
          include_intro, include_outro, export_resolution, scene_overrides, metadata,
          created_at, updated_at
        ) values (
          ${id}::uuid, ${tenant.id}::uuid, true, ${VOICE_ID}, 100, true,
          true, true, '1080p', '{}'::jsonb, '{}'::jsonb, now(), now()
        )
        returning id::text as id, voice_id, enabled, updated_at
      `;
      settingsAfter = inserted[0];
    } else {
      const updated = await sql`
        update industrial_executive_walkthrough_settings
        set voice_id = ${VOICE_ID}, enabled = true, updated_at = now()
        where tenant_id = ${tenant.id}::uuid
        returning id::text as id, voice_id, enabled, updated_at
      `;
      settingsAfter = updated[0];
    }

    const wtUpdated = await sql`
      update walkthroughs
      set default_voice_profile_id = ${PROFILE_ID}, updated_at = now()
      where tenant_id = ${tenant.id}::uuid
        and (
          code = 'forge-industrial-safety-complete-platform-overview'
          or default_voice_profile_id is null
          or default_voice_profile_id = ''
          or default_voice_profile_id = ${VOICE_ID}
        )
      returning id::text as id, code, default_voice_profile_id
    `;

    results.push({
      key,
      ok: true,
      apply: true,
      before,
      after: { settings: settingsAfter, walkthroughs: wtUpdated },
    });
  }
  console.log(
    JSON.stringify(
      { ok: true, apply: APPLY, voiceId: VOICE_ID, profileId: PROFILE_ID, results },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
