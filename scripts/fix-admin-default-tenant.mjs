/**
 * Fix dual is_default_tenant for admin and report forge-platform tenant status.
 * APPLY=1 to write.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const USER_ID = "ba491113-ba27-4ee6-8989-2eec1fe285d2";
const KEEP_DEFAULT_MEMBERSHIP = "7c0b78c0-0060-4578-b225-2c8a46a99baf"; // forge-platform
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
  const tenants = await sql`
    select t.id::text, t.tenant_key, t.status, t.display_name
    from tenants t
    where t.tenant_key in ('forge-platform', 'import-acceptance-tenant-a', 'producers-rice-mill', 'producers-rice-mill-staging')
    order by t.tenant_key
  `;

  const before = await sql`
    select m.id::text, t.tenant_key, m.is_default_tenant, m.status
    from user_tenant_memberships m
    join tenants t on t.id = m.tenant_id
    where m.user_id = ${USER_ID}::uuid
    order by t.tenant_key
  `;

  const actions = [];
  if (APPLY) {
    const updated = await sql`
      update user_tenant_memberships
      set is_default_tenant = false, updated_at = now()
      where user_id = ${USER_ID}::uuid
        and id <> ${KEEP_DEFAULT_MEMBERSHIP}::uuid
        and is_default_tenant = true
      returning id::text
    `;
    actions.push({ clearedDefaults: updated.map((r) => r.id) });
    await sql`
      update user_tenant_memberships
      set is_default_tenant = true, updated_at = now()
      where id = ${KEEP_DEFAULT_MEMBERSHIP}::uuid
    `;
    actions.push({ ensuredDefault: KEEP_DEFAULT_MEMBERSHIP });
  } else {
    actions.push({ wouldClearDefaultsExcept: KEEP_DEFAULT_MEMBERSHIP });
  }

  const after = await sql`
    select m.id::text, t.tenant_key, m.is_default_tenant, m.status
    from user_tenant_memberships m
    join tenants t on t.id = m.tenant_id
    where m.user_id = ${USER_ID}::uuid
    order by t.tenant_key
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "FIX-ADMIN-DEFAULT-TENANT",
        apply: APPLY,
        tenants,
        before,
        actions,
        after,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
