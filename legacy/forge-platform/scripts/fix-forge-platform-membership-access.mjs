/**
 * Grant FORGE_INDUSTRIAL product + module membership access to all ACTIVE
 * members of a tenant (fixes industrial bootstrap load for Cognito users).
 *
 *   DATABASE_SECRET_ARN=... APPLY=1 TENANT_KEY=forge-platform node scripts/fix-forge-platform-membership-access.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "forge-platform").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

async function resolveDatabaseUrl(secretArn) {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");

async function main() {
  const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });
  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`tenant not found: ${TENANT_KEY}`);

    const [product] = await sql`
      select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
    `;
    if (!product) throw new Error("FORGE_INDUSTRIAL product missing");

    const memberships = await sql`
      select m.id::text as membership_id, u.id::text as user_id, u.primary_email
      from user_tenant_memberships m
      join users u on u.id = m.user_id
      where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
    `;

    const entitledModules = await sql`
      select pm.id::text as module_id, pm.code
      from tenant_module_entitlements tme
      join platform_modules pm on pm.id = tme.module_id
      where tme.tenant_id = ${tenant.id}::uuid and tme.status = 'ACTIVE'
    `;

    const plan = memberships.map((m) => ({
      email: m.primary_email,
      membershipId: m.membership_id,
      modulesToGrant: entitledModules.length,
    }));

    if (!APPLY) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "dry-run",
            tenantKey: TENANT_KEY,
            membershipCount: memberships.length,
            entitledModuleCount: entitledModules.length,
            plan,
            note: "Set APPLY=1 to write",
          },
          null,
          2,
        ),
      );
      return;
    }

    const results = [];
    await sql.begin(async (tx) => {
      await tx`select set_config('app.current_tenant_id', ${tenant.id}, true)`;

      for (const m of memberships) {
        let productGranted = false;
        const existingP = await tx`
          select id::text as id from membership_product_access
          where membership_id = ${m.membership_id}::uuid and product_id = ${product.id}::uuid
          limit 1
        `;
        if (!existingP[0]) {
          await tx`
            insert into membership_product_access (
              id, tenant_id, membership_id, product_id, status, granted_by_user_id, created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${tenant.id}::uuid, ${m.membership_id}::uuid, ${product.id}::uuid,
              'ACTIVE', ${m.user_id}::uuid, now(), now()
            )
          `;
          productGranted = true;
        } else {
          await tx`
            update membership_product_access
            set status = 'ACTIVE', updated_at = now()
            where id = ${existingP[0].id}::uuid
          `;
        }

        let modulesGranted = 0;
        for (const mod of entitledModules) {
          const existingM = await tx`
            select id::text as id from membership_module_access
            where membership_id = ${m.membership_id}::uuid and module_id = ${mod.module_id}::uuid
            limit 1
          `;
          if (!existingM[0]) {
            await tx`
              insert into membership_module_access (
                id, tenant_id, membership_id, module_id, status, granted_by_user_id, created_at, updated_at
              ) values (
                ${randomUUID()}::uuid, ${tenant.id}::uuid, ${m.membership_id}::uuid, ${mod.module_id}::uuid,
                'ACTIVE', ${m.user_id}::uuid, now(), now()
              )
            `;
            modulesGranted += 1;
          } else {
            await tx`
              update membership_module_access
              set status = 'ACTIVE', updated_at = now()
              where id = ${existingM[0].id}::uuid
            `;
          }
        }

        results.push({
          email: m.primary_email,
          productGranted,
          modulesGranted,
        });
      }
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "apply",
          at: new Date().toISOString(),
          tenantKey: TENANT_KEY,
          results,
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
