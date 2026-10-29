-- INDUSTRIAL CALENDAR + REMINDERS S1: events linked to tasks; reminders fire via notifications.
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_calendar_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "title" varchar(500) NOT NULL,
  "description" text,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "all_day" boolean NOT NULL DEFAULT false,
  "status" varchar(64) NOT NULL DEFAULT 'SCHEDULED',
  "task_id" uuid REFERENCES "industrial_tasks"("id") ON DELETE SET NULL,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "industrial_calendar_events_tenant_range_idx"
  ON "industrial_calendar_events" ("tenant_id", "starts_at", "ends_at");
CREATE INDEX IF NOT EXISTS "industrial_calendar_events_tenant_task_idx"
  ON "industrial_calendar_events" ("tenant_id", "task_id");
CREATE INDEX IF NOT EXISTS "industrial_calendar_events_tenant_status_idx"
  ON "industrial_calendar_events" ("tenant_id", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_calendar_events" TO forge_app;
ALTER TABLE "industrial_calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_calendar_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_calendar_events_tenant_isolation" ON "industrial_calendar_events";
CREATE POLICY "industrial_calendar_events_tenant_isolation" ON "industrial_calendar_events"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_reminders" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "event_id" uuid REFERENCES "industrial_calendar_events"("id") ON DELETE CASCADE,
  "task_id" uuid REFERENCES "industrial_tasks"("id") ON DELETE SET NULL,
  "title" varchar(500),
  "remind_at" timestamptz NOT NULL,
  "channel" varchar(32) NOT NULL DEFAULT 'IN_APP',
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "recipient_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz,
  CONSTRAINT "industrial_reminders_link_chk"
    CHECK ("event_id" IS NOT NULL OR "task_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "industrial_reminders_due_idx"
  ON "industrial_reminders" ("tenant_id", "status", "remind_at");
CREATE INDEX IF NOT EXISTS "industrial_reminders_event_idx"
  ON "industrial_reminders" ("tenant_id", "event_id");
CREATE INDEX IF NOT EXISTS "industrial_reminders_task_idx"
  ON "industrial_reminders" ("tenant_id", "task_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_reminders" TO forge_app;
ALTER TABLE "industrial_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_reminders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_reminders_tenant_isolation" ON "industrial_reminders";
CREATE POLICY "industrial_reminders_tenant_isolation" ON "industrial_reminders"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
