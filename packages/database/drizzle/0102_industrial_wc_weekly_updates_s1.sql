-- 0102_industrial_wc_weekly_updates_s1
-- Thursday weekly status notes for open workers' compensation cases.

CREATE TABLE IF NOT EXISTS "industrial_workers_comp_weekly_updates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "case_id" uuid NOT NULL REFERENCES "industrial_workers_comp_cases"("id"),
  "week_of" date NOT NULL,
  "notes" text NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_wc_weekly_updates_case_week_uidx"
  ON "industrial_workers_comp_weekly_updates" ("tenant_id", "case_id", "week_of");

CREATE INDEX IF NOT EXISTS "industrial_wc_weekly_updates_week_idx"
  ON "industrial_workers_comp_weekly_updates" ("tenant_id", "week_of");

CREATE INDEX IF NOT EXISTS "industrial_wc_weekly_updates_case_idx"
  ON "industrial_workers_comp_weekly_updates" ("tenant_id", "case_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_workers_comp_weekly_updates" TO forge_app;
ALTER TABLE "industrial_workers_comp_weekly_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_workers_comp_weekly_updates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_wc_weekly_updates_tenant_isolation"
  ON "industrial_workers_comp_weekly_updates";
CREATE POLICY "industrial_wc_weekly_updates_tenant_isolation"
  ON "industrial_workers_comp_weekly_updates"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Page permission for Weekly updates tab
INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(),
  'industrial.workers_comp.page.weekly-updates',
  'View WORKERS COMP page weekly-updates',
  'Open the Weekly updates page in module WORKERS_COMP',
  'TENANT', 'NORMAL', false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" p WHERE p.code = 'industrial.workers_comp.page.weekly-updates'
);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" = 'industrial.workers_comp.page.weekly-updates'
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);

INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT DISTINCT rtp."role_template_id", p."id"
FROM "role_template_permissions" rtp
JOIN "permissions" admin_p ON admin_p."id" = rtp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" = 'industrial.workers_comp.page.weekly-updates'
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id" AND existing."permission_id" = p."id"
);

-- Also grant to roles that already have workers_comp.view (same set that can open WC)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" view_p ON view_p."id" = rp."permission_id" AND view_p."code" = 'industrial.workers_comp.view'
JOIN "permissions" p ON p."code" = 'industrial.workers_comp.page.weekly-updates'
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);
