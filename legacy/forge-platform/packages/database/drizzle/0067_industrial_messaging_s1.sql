-- INDUSTRIAL MESSAGING S1: Teams-like tenant-scoped conversations with attachments.
-- Additive. Tenant RLS. File storage via forge_documents + S3 presigned URLs.

CREATE TABLE IF NOT EXISTS "industrial_messaging_threads" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "thread_type" varchar(32) NOT NULL DEFAULT 'DIRECT',
  "title" varchar(300),
  "description" text,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "last_message_at" timestamptz,
  "last_message_preview" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_messaging_threads_tenant_last_msg_idx"
  ON "industrial_messaging_threads" ("tenant_id", "last_message_at");
CREATE INDEX IF NOT EXISTS "industrial_messaging_threads_tenant_type_idx"
  ON "industrial_messaging_threads" ("tenant_id", "thread_type");

CREATE TABLE IF NOT EXISTS "industrial_messaging_thread_members" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "thread_id" uuid NOT NULL REFERENCES "industrial_messaging_threads"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" varchar(32) NOT NULL DEFAULT 'MEMBER',
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "last_read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_messaging_thread_members_thread_idx"
  ON "industrial_messaging_thread_members" ("thread_id");
CREATE INDEX IF NOT EXISTS "industrial_messaging_thread_members_user_idx"
  ON "industrial_messaging_thread_members" ("tenant_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_messaging_thread_members_uidx"
  ON "industrial_messaging_thread_members" ("thread_id", "user_id");

CREATE TABLE IF NOT EXISTS "industrial_messaging_messages" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "thread_id" uuid NOT NULL REFERENCES "industrial_messaging_threads"("id"),
  "sender_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL DEFAULT '',
  "message_type" varchar(32) NOT NULL DEFAULT 'TEXT',
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "edited_at" timestamptz,
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_messaging_messages_thread_created_idx"
  ON "industrial_messaging_messages" ("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "industrial_messaging_messages_tenant_idx"
  ON "industrial_messaging_messages" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "industrial_messaging_attachments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "message_id" uuid REFERENCES "industrial_messaging_messages"("id"),
  "thread_id" uuid NOT NULL REFERENCES "industrial_messaging_threads"("id"),
  "attachment_type" varchar(32) NOT NULL,
  "document_id" uuid REFERENCES "forge_documents"("id"),
  "link_url" varchar(2000),
  "link_title" varchar(500),
  "link_description" text,
  "original_filename" varchar(500),
  "mime_type" varchar(255),
  "file_size_bytes" integer NOT NULL DEFAULT 0,
  "upload_status" varchar(32) NOT NULL DEFAULT 'COMPLETE',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_messaging_attachments_message_idx"
  ON "industrial_messaging_attachments" ("message_id");
CREATE INDEX IF NOT EXISTS "industrial_messaging_attachments_thread_idx"
  ON "industrial_messaging_attachments" ("thread_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_messaging_threads" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_messaging_thread_members" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_messaging_messages" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_messaging_attachments" TO forge_app;

ALTER TABLE "industrial_messaging_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_messaging_threads" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_messaging_threads_tenant_isolation" ON "industrial_messaging_threads";
CREATE POLICY "industrial_messaging_threads_tenant_isolation" ON "industrial_messaging_threads"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_messaging_thread_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_messaging_thread_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_messaging_thread_members_tenant_isolation" ON "industrial_messaging_thread_members";
CREATE POLICY "industrial_messaging_thread_members_tenant_isolation" ON "industrial_messaging_thread_members"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_messaging_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_messaging_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_messaging_messages_tenant_isolation" ON "industrial_messaging_messages";
CREATE POLICY "industrial_messaging_messages_tenant_isolation" ON "industrial_messaging_messages"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_messaging_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_messaging_attachments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_messaging_attachments_tenant_isolation" ON "industrial_messaging_attachments";
CREATE POLICY "industrial_messaging_attachments_tenant_isolation" ON "industrial_messaging_attachments"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
