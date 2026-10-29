-- INDUSTRIAL TRAINING SOURCE GROUPS S1: tag courses with training groups for catalog filters.
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_training_source_groups" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "industrial_training_groups"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_source_groups_uidx"
  ON "industrial_training_source_groups" ("source_id", "group_id");
CREATE INDEX IF NOT EXISTS "industrial_training_source_groups_tenant_idx"
  ON "industrial_training_source_groups" ("tenant_id", "group_id");
CREATE INDEX IF NOT EXISTS "industrial_training_source_groups_source_idx"
  ON "industrial_training_source_groups" ("tenant_id", "source_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_source_groups" TO forge_app;
ALTER TABLE "industrial_training_source_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_source_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_source_groups_tenant_isolation" ON "industrial_training_source_groups";
CREATE POLICY "industrial_training_source_groups_tenant_isolation" ON "industrial_training_source_groups"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
