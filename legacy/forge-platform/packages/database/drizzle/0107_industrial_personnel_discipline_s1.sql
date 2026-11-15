-- 0107_industrial_personnel_discipline_s1
-- Disciplinary actions per employee; active actions deduct from the personal safety score.

CREATE TABLE IF NOT EXISTS "industrial_personnel_disciplinary_actions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "personnel_id" uuid NOT NULL REFERENCES "industrial_personnel"("id"),
  "action_type" varchar(32) NOT NULL,
  "category" varchar(32) NOT NULL DEFAULT 'SAFETY',
  "action_date" date NOT NULL,
  "reason" text NOT NULL,
  "details" text,
  "issued_by_name" varchar(200),
  "points" integer NOT NULL DEFAULT 0,
  "counts_until" date,
  "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
  "rescinded_at" timestamptz,
  "rescinded_reason" text,
  "rescinded_by_user_id" uuid REFERENCES "users"("id"),
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "industrial_personnel_discipline_person_idx"
  ON "industrial_personnel_disciplinary_actions" ("tenant_id", "personnel_id", "action_date");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_personnel_disciplinary_actions" TO forge_app;
ALTER TABLE "industrial_personnel_disciplinary_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_personnel_disciplinary_actions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_personnel_discipline_tenant_isolation"
  ON "industrial_personnel_disciplinary_actions";
CREATE POLICY "industrial_personnel_discipline_tenant_isolation"
  ON "industrial_personnel_disciplinary_actions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, true, now(), now()
FROM (VALUES
  ('industrial.personnel.discipline.view', 'View disciplinary actions', 'View disciplinary action history on personnel files', 'ELEVATED'),
  ('industrial.personnel.discipline.manage', 'Manage disciplinary actions', 'Record, edit, and rescind disciplinary actions on personnel files', 'ELEVATED')
) AS v(code, name, description, risk_level)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.personnel.discipline.view',
  'industrial.personnel.discipline.manage'
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
  'industrial.personnel.discipline.view',
  'industrial.personnel.discipline.manage'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id" AND existing."permission_id" = p."id"
);
