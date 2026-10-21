/**
 * Grant industrial printer bridge permissions to tenant admin-like roles.
 * APPLY=1 to write; default dry-run.
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

const TENANT_KEY = process.env.TENANT_KEY?.trim() || "producers-rice-mill";
const APPLY = process.env.APPLY === "1";

const PERMS = [
  "industrial.printer.view",
  "industrial.printer.print",
  "industrial.printer.quick_print",
  "industrial.printer.reprint",
  "industrial.printer.cancel",
  "industrial.printer.manage",
  "industrial.printer.manage_defaults",
  "industrial.printer.manage_media",
  "industrial.printer.manage_templates",
  "industrial.printer.manage_bridge",
  "industrial.printer.pair_bluetooth",
  "industrial.printer.view_logs",
  "industrial.printer.run_diagnostics",
];

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
      select id::text as id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const roles = await sql`
      select id::text, code, name
      from roles
      where tenant_id = ${tenant.id}::uuid
      order by code
    `;

    // Prefer industrial.admin holders; else tenant admin / owner-like codes.
    const industrialAdminRoles = await sql`
      select distinct r.id::text, r.code, r.name
      from roles r
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where r.tenant_id = ${tenant.id}::uuid
        and p.code = 'industrial.admin'
      order by r.code
    `;

    const targetRoles =
      industrialAdminRoles.length > 0
        ? industrialAdminRoles
        : roles.filter((r) =>
            /admin|owner|super|manager|safety/i.test(`${r.code} ${r.name}`),
          );

    const permRows = await sql`
      select id::text, code from permissions where code = any(${PERMS})
    `;

    const existing = await sql`
      select r.code as role_code, p.code as permission_code
      from roles r
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where r.tenant_id = ${tenant.id}::uuid
        and p.code = any(${PERMS})
      order by r.code, p.code
    `;

    if (!APPLY) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            tenant,
            allRoles: roles,
            targetRoles,
            permissionCount: permRows.length,
            existingGrants: existing,
            note: "Set APPLY=1 to grant printer permissions to targetRoles",
          },
          null,
          2,
        ),
      );
      return;
    }

    if (targetRoles.length === 0) throw new Error("No target roles found to grant");
    if (permRows.length === 0) throw new Error("Printer permissions missing from catalog");

    let inserted = 0;
    for (const role of targetRoles) {
      for (const perm of permRows) {
        const [hit] = await sql`
          select 1 as ok from role_permissions
          where role_id = ${role.id}::uuid and permission_id = ${perm.id}::uuid
          limit 1
        `;
        if (hit) continue;
        await sql`
          insert into role_permissions (role_id, permission_id)
          values (${role.id}::uuid, ${perm.id}::uuid)
        `;
        inserted += 1;
      }
    }

    const after = await sql`
      select r.code as role_code, p.code as permission_code
      from roles r
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where r.tenant_id = ${tenant.id}::uuid
        and p.code = any(${PERMS})
      order by r.code, p.code
    `;

    console.log(
      JSON.stringify(
        {
          applied: true,
          tenant,
          targetRoles,
          inserted,
          after,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
