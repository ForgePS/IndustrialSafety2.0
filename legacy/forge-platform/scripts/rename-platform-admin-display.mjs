/**
 * Set platform super-admin display name to "Forge Admin".
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   APPLY=1 node scripts/rename-platform-admin-display.mjs
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

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const DISPLAY_NAME = "Forge Admin";
const FIRST_NAME = "Forge";
const LAST_NAME = "Admin";
const USERNAME = "Forge Admin";

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
    const admins = await sql`
      select distinct
        u.id::text as user_id,
        u.primary_email as email,
        u.username,
        u.person_id::text as person_id,
        p.display_name,
        p.first_name,
        p.last_name,
        r.code as role_code
      from users u
      join user_role_assignments ura on ura.user_id = u.id and ura.revoked_at is null
      join roles r on r.id = ura.role_id
      left join persons p on p.id = u.person_id
      where upper(r.code) in ('PLATFORM_SUPER_ADMIN', 'FORGE_CREATOR', 'CREATOR')
         or upper(r.code) like '%SUPER_ADMIN%'
         or upper(r.code) like '%PLATFORM%ADMIN%'
      order by u.primary_email
    `;

    // Also include users with creator/platform-admin membership roles.
    const membershipAdmins = await sql`
      select distinct
        u.id::text as user_id,
        u.primary_email as email,
        u.username,
        u.person_id::text as person_id,
        p.display_name,
        p.first_name,
        p.last_name,
        r.code as role_code
      from users u
      join user_tenant_memberships m on m.user_id = u.id and m.status = 'ACTIVE'
      join membership_role_assignments mra
        on mra.membership_id = m.id
       and mra.status in ('ACTIVE', 'PENDING')
      join roles r on r.id = mra.role_id
      left join persons p on p.id = u.person_id
      where upper(r.code) in ('PLATFORM_SUPER_ADMIN', 'FORGE_CREATOR', 'CREATOR')
         or upper(r.code) like '%SUPER_ADMIN%'
         or upper(r.code) like '%PLATFORM%ADMIN%'
         or upper(r.code) like '%CREATOR%'
      order by u.primary_email
    `;

    const byUser = new Map();
    for (const row of [...admins, ...membershipAdmins]) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, row);
    }
    // Prefer the live production Creator/super-admin account; skip UAT personas.
    const targets = [...byUser.values()].filter((row) => {
      const email = String(row.email ?? "").toLowerCase();
      return !email.includes("uat") && !email.includes("test");
    });

    const actions = [];
    for (const admin of targets) {
      const userAction = {
        userId: admin.user_id,
        email: admin.email,
        roleCode: admin.role_code,
        before: {
          username: admin.username,
          displayName: admin.display_name,
          firstName: admin.first_name,
          lastName: admin.last_name,
        },
        updates: [],
      };

      if ((admin.username ?? "") !== USERNAME) {
        userAction.updates.push("username");
        if (APPLY) {
          await sql`
            update users
            set username = ${USERNAME}, updated_at = now()
            where id = ${admin.user_id}::uuid
          `;
        }
      }

      if (admin.person_id) {
        const needsPerson =
          (admin.display_name ?? "") !== DISPLAY_NAME ||
          (admin.first_name ?? "") !== FIRST_NAME ||
          (admin.last_name ?? "") !== LAST_NAME;
        if (needsPerson) {
          userAction.updates.push("person");
          if (APPLY) {
            await sql`
              update persons
              set display_name = ${DISPLAY_NAME},
                  first_name = ${FIRST_NAME},
                  last_name = ${LAST_NAME},
                  updated_at = now()
              where id = ${admin.person_id}::uuid
            `;
          }
        }
      } else {
        userAction.updates.push("person_missing");
      }

      actions.push(userAction);
    }

    console.log(JSON.stringify({ apply: APPLY, displayName: DISPLAY_NAME, actions }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
