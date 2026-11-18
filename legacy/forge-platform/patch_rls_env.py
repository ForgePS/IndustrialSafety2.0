import re
from pathlib import Path
p = Path("packages/database/src/import-rls-verify-ecs.ts")
text = p.read_text(encoding="utf-8")
old = """  const tenants = [
    ...(await db.execute(sql`
      select id::text as id, tenant_key from tenants
      where tenant_key in ('import-acceptance-tenant-a','import-acceptance-tenant-b')
    `)),
  ] as Array<{ id: string; tenant_key: string }>;
  out.tenantsFound = tenants.length;
  if (tenants.length < 2) {
    console.info(JSON.stringify({ ...out, error: \"missing acceptance tenants\", cases }));
    process.exit(2);
  }
  const tenantA = tenants.find((t) => t.tenant_key === \"import-acceptance-tenant-a\")!.id;
  const tenantB = tenants.find((t) => t.tenant_key === \"import-acceptance-tenant-b\")!.id;"""
new = """  // forge_app cannot SELECT tenants without tenant context; prefer env IDs from seed output.
  const envTenantA = process.env.IMPORT_ACCEPTANCE_TENANT_A_ID?.trim();
  const envTenantB = process.env.IMPORT_ACCEPTANCE_TENANT_B_ID?.trim();
  let tenantA = envTenantA || \"\";
  let tenantB = envTenantB || \"\";
  if (!tenantA || !tenantB) {
    const tenants = [
      ...(await db.execute(sql`
        select id::text as id, tenant_key from tenants
        where tenant_key in ('import-acceptance-tenant-a','import-acceptance-tenant-b')
      `)),
    ] as Array<{ id: string; tenant_key: string }>;
    out.tenantsFound = tenants.length;
    tenantA = tenants.find((t) => t.tenant_key === \"import-acceptance-tenant-a\")?.id || \"\";
    tenantB = tenants.find((t) => t.tenant_key === \"import-acceptance-tenant-b\")?.id || \"\";
  } else {
    out.tenantsFound = 2;
    out.tenantSource = \"env\";
  }
  out.tenantA = tenantA || null;
  out.tenantB = tenantB || null;
  if (!tenantA || !tenantB) {
    console.info(JSON.stringify({ ...out, error: \"missing acceptance tenants\", cases }));
    process.exit(2);
  }"""
# Fix escapes - write without escaped quotes in Python source
old = old.replace('\\"', '"')
new = new.replace('\\"', '"')
if old not in text:
    raise SystemExit("old block not found")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("patched ts")
Path("scripts/import-rls-verify.mjs").write_text(
"""#!/usr/bin/env node
import { runPlatformApiOneOff } from \"./ecs-oneoff.mjs\";

const tenantA =
  process.env.IMPORT_ACCEPTANCE_TENANT_A_ID ||
  \"019faa15-e558-70b6-adcd-a510c3c995f4\";
const tenantB =
  process.env.IMPORT_ACCEPTANCE_TENANT_B_ID ||
  \"019faa15-e578-76bd-b269-038d23c03b5e\";

runPlatformApiOneOff(
  [\"node\", \"/app/packages/database/dist/import-rls-verify-ecs.js\"],
  \"import-rls-verify\",
  {
    environment: {
      IMPORT_ACCEPTANCE_TENANT_A_ID: tenantA,
      IMPORT_ACCEPTANCE_TENANT_B_ID: tenantB,
    },
  },
);
""".replace('\\"', '"'),
encoding="utf-8",
newline="\n",
)
print("patched mjs")