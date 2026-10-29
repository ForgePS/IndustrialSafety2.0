/**
 * READ-ONLY: broaden user lookup when exact primary_email miss.
 * Searches users, people, and auth identities for email fragments.
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

const NEEDLE = (process.env.TARGET_NEEDLE || "tbogy").trim().toLowerCase();
const DOMAIN = (process.env.TARGET_DOMAIN || "producersricemill").trim().toLowerCase();

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
    const likeNeedle = `%${NEEDLE}%`;
    const likeDomain = `%${DOMAIN}%`;

    const usersByEmail = await sql`
      select id::text as id, tenant_id::text as tenant_id, primary_email, status
      from users
      where lower(primary_email) like ${likeNeedle}
         or lower(primary_email) like ${likeDomain}
      order by primary_email
      limit 50
    `;

    let personsByEmail = [];
    try {
      personsByEmail = await sql`
        select id::text as id, tenant_id::text as tenant_id, status,
               display_name, email
        from persons
        where lower(coalesce(email, '')) like ${likeNeedle}
           or lower(coalesce(email, '')) like ${likeDomain}
           or lower(coalesce(display_name, '')) like ${likeNeedle}
        order by email
        limit 50
      `;
    } catch (e) {
      personsByEmail = [{ error: String(e.message || e) }];
    }

    // auth identities table name may vary — try common shapes
    let identities = [];
    try {
      identities = await sql`
        select ai.id::text as id, ai.user_id::text as user_id, ai.provider,
               ai.provider_subject, ai.status, u.primary_email
        from authentication_identities ai
        left join users u on u.id = ai.user_id
        where lower(coalesce(ai.provider_subject, '')) like ${likeNeedle}
           or lower(coalesce(ai.provider_subject, '')) like ${likeDomain}
           or lower(coalesce(u.primary_email, '')) like ${likeNeedle}
           or lower(coalesce(u.primary_email, '')) like ${likeDomain}
        limit 50
      `;
    } catch (e) {
      identities = [{ error: String(e.message || e) }];
    }

    const producersTenants = await sql`
      select id::text as id, tenant_key, slug, status, display_name
      from tenants
      where lower(tenant_key) like '%producer%'
         or lower(slug) like '%producer%'
         or lower(display_name) like '%producer%'
    `;

    const tenantMemberships = [];
    for (const t of producersTenants) {
      const members = await sql`
        select u.primary_email, u.status as user_status, m.status as membership_status,
               m.id::text as membership_id, m.is_default_tenant
        from user_tenant_memberships m
        join users u on u.id = m.user_id
        where m.tenant_id = ${t.id}::uuid
        order by u.primary_email
        limit 100
      `;
      const moduleEntCount = await sql`
        select count(*)::int as n from tenant_module_entitlements
        where tenant_id = ${t.id}::uuid and status in ('ACTIVE','GRACE')
      `;
      const flagCount = await sql`
        select count(*)::int as n
        from feature_overrides fo
        join feature_definitions fd on fd.id = fo.feature_definition_id
        where fo.tenant_id = ${t.id}::uuid and fd.key like 'industrial.%'
      `;
      tenantMemberships.push({
        tenantKey: t.tenant_key,
        tenantId: t.id,
        status: t.status,
        activeModuleEntitlements: moduleEntCount[0]?.n ?? 0,
        industrialFlagOverrides: flagCount[0]?.n ?? 0,
        memberCount: members.length,
        members: members.map((m) => ({
          email: m.primary_email,
          userStatus: m.user_status,
          membershipStatus: m.membership_status,
          membershipId: m.membership_id,
        })),
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: "DIAG-USER-LOOKUP-BROAD",
          needle: NEEDLE,
          domain: DOMAIN,
          usersByEmail,
          personsByEmail,
          identities,
          producersTenants,
          tenantMemberships,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
