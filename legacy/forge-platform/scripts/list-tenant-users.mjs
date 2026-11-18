/**
 * READ-ONLY: list platform users and memberships for a tenant.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/list-tenant-users.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();

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
  const tenant = await sql`
    select id::text as id, tenant_key, display_name
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant[0].id;

  const memberships = await sql`
    select
      m.id::text as membership_id,
      m.status as membership_status,
      u.id::text as user_id,
      u.primary_email,
      u.username,
      u.status as user_status,
      u.last_login_at,
      p.display_name,
      p.first_name,
      p.last_name,
      coalesce(
        (
          select string_agg(r.name, ', ' order by r.name)
          from membership_role_assignments a
          join roles r on r.id = a.role_id
          where a.membership_id = m.id
            and a.status in ('ACTIVE', 'PENDING')
        ),
        ''
      ) as roles
    from user_tenant_memberships m
    join users u on u.id = m.user_id
    left join persons p on p.id = u.person_id
    where m.tenant_id = ${tenantId}::uuid
    order by u.primary_email
  `;

  const homeUsers = await sql`
    select
      id::text as user_id,
      primary_email,
      username,
      status,
      person_id::text as person_id
    from users
    where tenant_id = ${tenantId}::uuid
    order by primary_email
  `;

  console.log(
    JSON.stringify(
      {
        tenant: tenant[0],
        membershipCount: memberships.length,
        homeUserCount: homeUsers.length,
        memberships,
        homeUsers,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
