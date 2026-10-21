-- INDUSTRIAL CALENDAR WAVE 2: categories + recurrence columns on events.
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_calendar_categories" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(120) NOT NULL,
  "color" varchar(16) NOT NULL DEFAULT '#696cff',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_calendar_categories_tenant_name_uidx"
  ON "industrial_calendar_categories" ("tenant_id", "name")
  WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_calendar_categories_tenant_idx"
  ON "industrial_calendar_categories" ("tenant_id", "sort_order");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_calendar_categories" TO forge_app;
ALTER TABLE "industrial_calendar_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_calendar_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_calendar_categories_tenant_isolation" ON "industrial_calendar_categories";
CREATE POLICY "industrial_calendar_categories_tenant_isolation" ON "industrial_calendar_categories"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_calendar_events"
  ADD COLUMN IF NOT EXISTS "category_id" uuid REFERENCES "industrial_calendar_categories"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_rule" varchar(120),
  ADD COLUMN IF NOT EXISTS "recurrence_until" timestamptz,
  ADD COLUMN IF NOT EXISTS "recurrence_count" integer,
  ADD COLUMN IF NOT EXISTS "series_id" uuid;

CREATE INDEX IF NOT EXISTS "industrial_calendar_events_tenant_category_idx"
  ON "industrial_calendar_events" ("tenant_id", "category_id");
CREATE INDEX IF NOT EXISTS "industrial_calendar_events_tenant_series_idx"
  ON "industrial_calendar_events" ("tenant_id", "series_id");
