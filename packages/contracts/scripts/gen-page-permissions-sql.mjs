import fs from "node:fs";

/** Keep in sync with packages/contracts/src/industrial-module-pages.ts */
const CATALOGS = [
  [
    "SANITATION",
    "industrial.sanitation",
    [
      "dashboard",
      "analytics",
      "heatmap",
      "inspections",
      "start",
      "preop",
      "run",
      "mss",
      "cleaning",
      "dust",
      "environmental",
      "spills",
      "zones",
      "pest",
      "chemicals",
      "compressed-air",
      "findings",
      "verification",
      "concerns",
      "reports",
      "regulatory",
      "profile",
      "templates",
      "settings",
    ],
  ],
  [
    "WORKERS_COMP",
    "industrial.workers_comp",
    [
      "dashboard",
      "cases",
      "employees",
      "return-to-work",
      "medical",
      "claims",
      "costs",
      "osha",
      "documents",
      "reports",
      "settings",
    ],
  ],
  [
    "INCIDENTS",
    "industrial.incidents",
    [
      "injuries",
      "near-misses",
      "medical-refusals",
      "property-damage",
      "automotive",
      "incident-workflow",
      "evaluation-checklist",
      "root-cause-analysis",
      "body-map",
    ],
  ],
  [
    "DOCUMENTS",
    "industrial.documents",
    ["library", "document", "approvals", "acknowledgments", "reviews"],
  ],
  [
    "DOT_COMPLIANCE",
    "industrial.dot",
    [
      "dashboard",
      "drivers",
      "vehicles",
      "dvirs",
      "roadside",
      "accidents",
      "drug-alcohol",
      "company",
      "other",
      "reports",
    ],
  ],
  ["FORMS", "industrial.forms", ["library", "fill", "submissions"]],
  [
    "INSPECTIONS",
    "industrial.inspections",
    ["list", "start", "run", "report", "open-items", "contacts"],
  ],
  ["LOCKOUT_TAGOUT", "industrial.loto", ["procedures", "lockouts", "reports"]],
  [
    "EMERGENCY_ALERTS",
    "industrial.emergency_alerts",
    ["dashboard", "compose", "active", "history", "templates", "groups"],
  ],
  ["QR_LINKS", "industrial.qr_links", ["registry", "create", "detail"]],
  [
    "PRINT_MANAGER",
    "industrial.printer",
    [
      "dashboard",
      "queue",
      "printers",
      "bridges",
      "groups",
      "routing",
      "templates",
      "batches",
      "supplies",
      "analytics",
      "history",
    ],
  ],
  [
    "FLEET",
    "industrial.fleet",
    [
      "dashboard",
      "assets",
      "drivers",
      "renewals",
      "compliance",
      "maintenance",
      "inspections",
      "documents",
      "removed",
      "reports",
      "settings",
    ],
  ],
  [
    "SAFETY_SUPPLIES",
    "industrial.supplies",
    [
      "dashboard",
      "inventory",
      "items",
      "locations",
      "receive",
      "issue",
      "ppe",
      "transfers",
      "requests",
      "qr-stations",
      "vendors",
      "purchase-orders",
      "reorder",
      "expiring",
      "kits",
      "transactions",
      "reports",
      "categories",
      "settings",
    ],
  ],
];

const rows = [];
for (const [moduleCode, domain, pages] of CATALOGS) {
  for (const id of pages) {
    rows.push({
      code: `${domain}.page.${id}`,
      name: `View ${moduleCode.replace(/_/g, " ")} page ${id}`.replace(/'/g, "''"),
      description: `Open the ${id} page in module ${moduleCode}`.replace(/'/g, "''"),
    });
  }
}

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

fs.writeFileSync(
  new URL("../../database/drizzle/0101_industrial_module_page_permissions_s1.sql", import.meta.url),
  sql,
);
console.log("wrote", rows.length);
