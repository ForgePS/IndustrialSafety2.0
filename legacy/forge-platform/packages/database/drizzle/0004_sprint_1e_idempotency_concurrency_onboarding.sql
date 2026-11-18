-- Sprint 1E: durable idempotency (ADR-022), optimistic concurrency (ADR-023),
-- inbound event processing idempotency (ADR-024), and resumable customer
-- onboarding (ADR-027).

-- ---------------------------------------------------------------------------
-- Optimistic concurrency counters
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "tenant_products" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "tenant_module_entitlements" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "feature_overrides" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "tenant_branding" ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- idempotency_records (supersedes the unused Sprint 1D idempotency_keys)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "idempotency_keys";

CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "method" varchar(10) NOT NULL,
  "route" varchar(512) NOT NULL,
  "idempotency_key" varchar(255) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'PROCESSING',
  "response_status" integer,
  "response_body" jsonb,
  "resource_type" varchar(128),
  "resource_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  CONSTRAINT "idempotency_records_status_chk" CHECK (
    "status" IN ('PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_scope_key_uidx"
  ON "idempotency_records" ("tenant_id", "user_id", "method", "route", "idempotency_key");
CREATE INDEX IF NOT EXISTS "idempotency_records_expires_idx"
  ON "idempotency_records" ("expires_at");

-- ---------------------------------------------------------------------------
-- event_processing_records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "event_processing_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "event_id" uuid NOT NULL,
  "event_type" varchar(200) NOT NULL,
  "handler_name" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'PROCESSING',
  "attempt_count" integer NOT NULL DEFAULT 1,
  "correlation_id" varchar(128),
  "duration_ms" integer,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "event_processing_records_status_chk" CHECK (
    "status" IN ('PROCESSING', 'COMPLETED', 'FAILED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_processing_records_event_handler_uidx"
  ON "event_processing_records" ("event_id", "handler_name");
CREATE INDEX IF NOT EXISTS "event_processing_records_status_idx"
  ON "event_processing_records" ("status", "created_at");

-- ---------------------------------------------------------------------------
-- customer onboarding
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "customer_onboarding_sessions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "customer_type" varchar(32) NOT NULL,
  "template_code" varchar(64),
  "status" varchar(32) NOT NULL DEFAULT 'IN_PROGRESS',
  "current_step" integer NOT NULL DEFAULT 1,
  "session_data_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "activation_errors_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "started_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "completed_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "customer_onboarding_sessions_type_chk" CHECK (
    "customer_type" IN ('INDUSTRIAL', 'FIRE_DEPARTMENT', 'FIRE_ACADEMY', 'OTHER')
  ),
  CONSTRAINT "customer_onboarding_sessions_status_chk" CHECK (
    "status" IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'FAILED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_onboarding_sessions_tenant_uidx"
  ON "customer_onboarding_sessions" ("tenant_id");

CREATE TABLE IF NOT EXISTS "customer_onboarding_steps" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "session_id" uuid NOT NULL REFERENCES "customer_onboarding_sessions"("id"),
  "step_number" integer NOT NULL,
  "step_key" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "validation_errors_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "completed_by_user_id" uuid REFERENCES "users"("id"),
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "customer_onboarding_steps_status_chk" CHECK (
    "status" IN ('PENDING', 'COMPLETED', 'SKIPPED', 'FAILED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_onboarding_steps_session_number_uidx"
  ON "customer_onboarding_steps" ("session_id", "step_number");

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'idempotency_records',
    'customer_onboarding_sessions',
    'customer_onboarding_steps'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;

-- Inbound events may be platform scoped, so tenant_id is nullable here.
ALTER TABLE "event_processing_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_processing_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_processing_records_tenant_isolation" ON "event_processing_records";
CREATE POLICY "event_processing_records_tenant_isolation" ON "event_processing_records"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "idempotency_records",
  "event_processing_records",
  "customer_onboarding_sessions",
  "customer_onboarding_steps"
  TO forge_app;

-- ---------------------------------------------------------------------------
-- Enforce the append-only audit guarantee documented in Sprint 1D
-- (docs/security/audit-logging.md). The policy set already omits UPDATE and
-- DELETE, but table privileges still allowed them.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON "audit_events" FROM forge_app;
