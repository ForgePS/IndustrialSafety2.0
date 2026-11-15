#!/usr/bin/env node
/** Compact S8 persona seed (ECS inject). Synthetic only. */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import postgres from "postgres";

const TENANTS = ["import-acceptance-tenant-a", "import-acceptance-tenant-b"];
const PERSONAS = [
  [
    "operator",
    "s8-import-operator@forge.test",
    "S8_IMPORT_OPERATOR",
    "import.view,import.upload,import.map,import.validate,import.preview,import.profile.manage,import.template.manage",
  ],
  [
    "approver",
    "s8-import-approver@forge.test",
    "S8_IMPORT_APPROVER",
    "import.view,import.approve,import.preview",
  ],
  [
    "executor",
    "s8-import-executor@forge.test",
    "S8_IMPORT_EXECUTOR",
    "import.view,import.execute,import.preview",
  ],
  [
    "full",
    "s8-import-full@forge.test",
    "S8_IMPORT_FULL",
    "import.view,import.upload,import.map,import.validate,import.preview,import.approve,import.execute,import.rollback,import.profile.manage,import.template.manage,import.error.reprocess,import.sensitive",
  ],
  ["viewer", "s8-import-viewer@forge.test", "S8_IMPORT_VIEWER", "import.view"],
  [
    "sensitive",
    "s8-import-sensitive@forge.test",
    "S8_IMPORT_SENSITIVE",
    "import.view,import.sensitive,import.preview",
  ],
  [
    "rollback",
    "s8-import-rollback@forge.test",
    "S8_IMPORT_ROLLBACK",
    "import.view,import.rollback",
  ],
  [
    "reprocess",
    "s8-import-reprocess@forge.test",
    "S8_IMPORT_REPROCESS",
    "import.view,import.error.reprocess",
  ],
  [
    "unauthorized",
    "s8-import-unauthorized@forge.test",
    "S8_IMPORT_UNAUTHORIZED",
    "platform.permission.read",
  ],
];
const id = () => crypto.randomUUID();

async function main() {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const out = {};
  try {
    for (const tenantKey of TENANTS) {
      const [tenant] = await sql`select id::text as id from tenants where tenant_key=${tenantKey}`;
      if (!tenant) throw new Error("missing " + tenantKey);
      const tid = tenant.id;
      const [product] =
        await sql`select id::text as id from platform_products where code='FORGE_RMS'`;
      const [mod] = product
        ? await sql`select id::text as id from platform_modules where product_id=${product.id}::uuid and code='CORE'`
        : [null];
      if (product) {
        const [ex] =
          await sql`select 1 from tenant_products where tenant_id=${tid}::uuid and product_id=${product.id}::uuid`;
        if (!ex)
          await sql`insert into tenant_products (id,tenant_id,product_id,status,enabled_at,created_at,updated_at) values (${id()}::uuid,${tid}::uuid,${product.id}::uuid,'ACTIVE',now(),now(),now())`;
      }
      if (mod) {
        const [ex] =
          await sql`select 1 from tenant_module_entitlements where tenant_id=${tid}::uuid and module_id=${mod.id}::uuid`;
        if (!ex)
          await sql`insert into tenant_module_entitlements (id,tenant_id,module_id,status,starts_at,created_at,updated_at) values (${id()}::uuid,${tid}::uuid,${mod.id}::uuid,'ACTIVE',now(),now(),now())`;
      }
      const personas = {};
      for (const [key, email, roleCode, permCsv] of PERSONAS) {
        let [role] =
          await sql`select id::text as id from roles where tenant_id=${tid}::uuid and code=${roleCode}`;
        if (!role) {
          const rid = id();
          await sql`insert into roles (id,tenant_id,code,name,status,created_at,updated_at) values (${rid}::uuid,${tid}::uuid,${roleCode},${roleCode},'ACTIVE',now(),now())`;
          role = { id: rid };
        }
        for (const code of permCsv.split(",")) {
          const [perm] = await sql`select id::text as id from permissions where code=${code}`;
          if (!perm) continue;
          const [link] =
            await sql`select 1 from role_permissions where role_id=${role.id}::uuid and permission_id=${perm.id}::uuid`;
          if (!link)
            await sql`insert into role_permissions (role_id,permission_id,effect,created_at) values (${role.id}::uuid,${perm.id}::uuid,'ALLOW',now())`;
        }
        let [user] =
          await sql`select id::text as id from users where tenant_id=${tid}::uuid and lower(primary_email)=${email}`;
        if (!user) {
          const uid = id();
          await sql`insert into users (id,tenant_id,primary_email,status,activated_at,created_at,updated_at) values (${uid}::uuid,${tid}::uuid,${email},'ACTIVE',now(),now(),now())`;
          user = { id: uid };
        }
        let [mem] =
          await sql`select id::text as id from user_tenant_memberships where tenant_id=${tid}::uuid and user_id=${user.id}::uuid`;
        if (!mem) {
          const mid = id();
          await sql`insert into user_tenant_memberships (id,tenant_id,user_id,status,is_default_tenant,activated_at,created_at,updated_at) values (${mid}::uuid,${tid}::uuid,${user.id}::uuid,'ACTIVE',true,now(),now(),now())`;
          mem = { id: mid };
        }
        const [asg] =
          await sql`select 1 from membership_role_assignments where membership_id=${mem.id}::uuid and role_id=${role.id}::uuid and status='ACTIVE'`;
        if (!asg)
          await sql`insert into membership_role_assignments (id,tenant_id,membership_id,role_id,status,granted_by_user_id,granted_at,created_at,updated_at) values (${id()}::uuid,${tid}::uuid,${mem.id}::uuid,${role.id}::uuid,'ACTIVE',${user.id}::uuid,now(),now(),now())`;
        if (product) {
          const [ex] =
            await sql`select 1 from membership_product_access where membership_id=${mem.id}::uuid and product_id=${product.id}::uuid`;
          if (!ex)
            await sql`insert into membership_product_access (id,tenant_id,membership_id,product_id,status,granted_by_user_id,created_at,updated_at) values (${id()}::uuid,${tid}::uuid,${mem.id}::uuid,${product.id}::uuid,'ACTIVE',${user.id}::uuid,now(),now())`;
        }
        if (mod) {
          const [ex] =
            await sql`select 1 from membership_module_access where membership_id=${mem.id}::uuid and module_id=${mod.id}::uuid`;
          if (!ex)
            await sql`insert into membership_module_access (id,tenant_id,membership_id,module_id,status,granted_by_user_id,created_at,updated_at) values (${id()}::uuid,${tid}::uuid,${mem.id}::uuid,${mod.id}::uuid,'ACTIVE',${user.id}::uuid,now(),now())`;
        }
        personas[key] = { userId: user.id, email, roleCode };
      }
      out[tenantKey] = { tenantId: tid, personas };
    }
    console.info(JSON.stringify({ ok: true, ...out }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
