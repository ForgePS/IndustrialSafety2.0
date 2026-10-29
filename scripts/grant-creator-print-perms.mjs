/**
 * Grant industrial printer permissions to Creator/platform (and tenant admin) roles + templates.
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

const APPLY = process.env.APPLY === "1";
const ROLE_CODES = (
  process.env.ROLE_CODES ||
  "CREATOR_ADMIN,PLATFORM_SUPER_ADMIN,PLATFORM_SUPPORT,TENANT_ADMIN,TENANT_OWNER"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
    const roles = await sql`
      select r.id::text, r.code, r.name, t.tenant_key
      from roles r
      join tenants t on t.id = r.tenant_id
      where r.code = any(${ROLE_CODES})
      order by t.tenant_key, r.code
    `;
    const templates = await sql`
      select id::text, code, name
      from role_templates
      where code = any(${ROLE_CODES})
      order by code
    `;
    const permRows = await sql`
      select id::text, code from permissions where code = any(${PERMS})
    `;

    if (!APPLY) {
      console.log(
        JSON.stringify(
          { dryRun: true, roles, templates, permissionCount: permRows.length },
          null,
          2,
        ),
      );
      return;
    }

    let roleInserts = 0;
    let templateInserts = 0;
    for (const role of roles) {
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
        roleInserts += 1;
      }
    }
    for (const tpl of templates) {
      for (const perm of permRows) {
        const [hit] = await sql`
          select 1 as ok from role_template_permissions
          where role_template_id = ${tpl.id}::uuid and permission_id = ${perm.id}::uuid
          limit 1
        `;
        if (hit) continue;
        await sql`
          insert into role_template_permissions (role_template_id, permission_id)
          values (${tpl.id}::uuid, ${perm.id}::uuid)
        `;
        templateInserts += 1;
      }
    }

    const after = await sql`
      select t.tenant_key, r.code as role_code, count(*)::int as printer_perm_count
      from roles r
      join tenants t on t.id = r.tenant_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where r.code = any(${ROLE_CODES}) and p.code = any(${PERMS})
      group by t.tenant_key, r.code
      order by t.tenant_key, r.code
    `;

    console.log(JSON.stringify({ applied: true, roleInserts, templateInserts, after }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
