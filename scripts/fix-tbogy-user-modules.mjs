/**
 * Production data repair for tbogy@producersrice.com (Producers Rice Mill):
 * 1) Activate user INVITED -> ACTIVE
 * 2) Grant membership_module_access for JSAS + DOCUMENTS (tenant already entitled)
 *
 * Idempotent. Resolves DB URL from DATABASE_SECRET_ARN inside the container.
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

const TARGET_EMAIL = (process.env.TARGET_EMAIL || "tbogy@producersrice.com").trim().toLowerCase();
const GRANT_MODULES = (process.env.GRANT_MODULES || "JSAS,DOCUMENTS")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
    const users = await sql`
      select id::text as id, tenant_id::text as tenant_id, primary_email, status
      from users where lower(primary_email) = ${TARGET_EMAIL}
    `;
    if (!users[0]) throw new Error(`User not found: ${TARGET_EMAIL}`);
    const user = users[0];

    const memberships = await sql`
      select m.id::text as membership_id, m.tenant_id::text as tenant_id, m.status,
             t.tenant_key
      from user_tenant_memberships m
      join tenants t on t.id = m.tenant_id
      where m.user_id = ${user.id}::uuid
    `;
    if (!memberships[0]) throw new Error(`No memberships for ${TARGET_EMAIL}`);

    let userAction = "unchanged";
    if (user.status !== "ACTIVE") {
      await sql`
        update users
        set status = 'ACTIVE',
            activated_at = coalesce(activated_at, now()),
            updated_at = now()
        where id = ${user.id}::uuid
      `;
      userAction = `status ${user.status} -> ACTIVE`;
    }

    const grants = [];
    for (const m of memberships) {
      for (const code of GRANT_MODULES) {
        // Prefer Industrial catalog row; fall back to any product module the tenant
        // already holds (production has DOCUMENTS under FORGE_RMS only).
        let mod = await sql`
          select pm.id::text as id, pm.code, pp.code as product_code
          from platform_modules pm
          join platform_products pp on pp.id = pm.product_id
          where pp.code = 'FORGE_INDUSTRIAL' and pm.code = ${code}
          limit 1
        `;
        if (!mod[0]) {
          mod = await sql`
            select pm.id::text as id, pm.code, pp.code as product_code
            from tenant_module_entitlements tme
            join platform_modules pm on pm.id = tme.module_id
            join platform_products pp on pp.id = pm.product_id
            where tme.tenant_id = ${m.tenant_id}::uuid
              and pm.code = ${code}
              and tme.status in ('ACTIVE', 'GRACE')
            limit 1
          `;
        }
        if (!mod[0]) {
          grants.push({ membershipId: m.membership_id, code, action: "skipped_missing_module" });
          continue;
        }

        const tenantEnt = await sql`
          select id::text as id, status from tenant_module_entitlements
          where tenant_id = ${m.tenant_id}::uuid and module_id = ${mod[0].id}::uuid
          limit 1
        `;
        if (!tenantEnt[0] || !["ACTIVE", "GRACE"].includes(tenantEnt[0].status)) {
          grants.push({
            membershipId: m.membership_id,
            code,
            action: "skipped_tenant_not_entitled",
            tenantStatus: tenantEnt[0]?.status ?? null,
            productCode: mod[0].product_code,
          });
          continue;
        }

        const existing = await sql`
          select id::text as id, status from membership_module_access
          where membership_id = ${m.membership_id}::uuid and module_id = ${mod[0].id}::uuid
          limit 1
        `;
        if (!existing[0]) {
          const id = randomUUID();
          await sql`
            insert into membership_module_access (
              id, tenant_id, membership_id, module_id, status,
              granted_by_user_id, created_at, updated_at
            ) values (
              ${id}::uuid, ${m.tenant_id}::uuid, ${m.membership_id}::uuid, ${mod[0].id}::uuid,
              'ACTIVE', ${user.id}::uuid, now(), now()
            )
          `;
          grants.push({ membershipId: m.membership_id, code, action: "created" });
        } else if (existing[0].status !== "ACTIVE") {
          await sql`
            update membership_module_access
            set status = 'ACTIVE', updated_at = now()
            where id = ${existing[0].id}::uuid
          `;
          grants.push({
            membershipId: m.membership_id,
            code,
            action: `reactivated from ${existing[0].status}`,
          });
        } else {
          grants.push({ membershipId: m.membership_id, code, action: "already_active" });
        }
      }
    }

    // Post-state: reproduce activeModules intersection
    const post = [];
    for (const m of memberships) {
      const tenantModules = await sql`
        select pm.code from tenant_module_entitlements tme
        join platform_modules pm on pm.id = tme.module_id
        where tme.tenant_id = ${m.tenant_id}::uuid and tme.status in ('ACTIVE','GRACE')
      `;
      const membershipModules = await sql`
        select pm.code from membership_module_access mma
        join platform_modules pm on pm.id = mma.module_id
        where mma.membership_id = ${m.membership_id}::uuid and mma.status = 'ACTIVE'
      `;
      const tenantSet = new Set(tenantModules.map((r) => r.code));
      const effective = membershipModules.map((r) => r.code).filter((c) => tenantSet.has(c));
      const userRow = await sql`select status from users where id = ${user.id}::uuid`;
      post.push({
        membershipId: m.membership_id,
        tenantKey: m.tenant_key,
        userStatus: userRow[0]?.status,
        membershipModules: membershipModules.map((r) => r.code).sort(),
        EFFECTIVE_ACTIVE_MODULES: effective.sort(),
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: "FIX-TBOGY-USER-MODULES",
          targetEmail: TARGET_EMAIL,
          userId: user.id,
          userAction,
          grants,
          post,
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
