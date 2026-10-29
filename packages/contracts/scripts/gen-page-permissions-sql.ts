import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDUSTRIAL_MODULE_PAGE_CATALOGS } from "../src/industrial-module-pages.js";

const rows = INDUSTRIAL_MODULE_PAGE_CATALOGS.flatMap((c) =>
  c.pages.map((p) => ({
    code: `${c.domain}.page.${p.id}`,
    name: `View ${c.moduleCode.replace(/_/g, " ")} · ${p.label}`.replace(/'/g, "''"),
    description: `Open the ${p.label} page in module ${c.moduleCode}`.replace(/'/g, "''"),
  })),
);

const values = rows
  .map((r) => `  ('${r.code}', '${r.name}', '${r.description}', 'NORMAL', false)`)
  .join(",\n");
const codes = rows.map((r) => `  '${r.code}'`).join(",\n");

const sql = `-- 0101_industrial_module_page_permissions_s1
-- Per-role module page (tab) visibility permissions.

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
${values}
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

-- Grant page permissions to roles that already have industrial.admin
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
${codes}
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);

-- Grant to role templates that already include industrial.admin
INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT DISTINCT rtp."role_template_id", p."id"
FROM "role_template_permissions" rtp
JOIN "permissions" admin_p ON admin_p."id" = rtp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
${codes}
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id" AND existing."permission_id" = p."id"
);
`;

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../database/drizzle/0101_industrial_module_page_permissions_s1.sql",
);
fs.writeFileSync(out, sql);
console.log(`wrote ${rows.length} permissions to ${out}`);
