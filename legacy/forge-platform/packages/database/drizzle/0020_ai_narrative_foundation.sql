-- AI Narrative Assistant foundation (disabled by default via feature flags).
-- Shared platform tables; FORCE RLS on all tenant-scoped rows.

CREATE TABLE IF NOT EXISTS "ai_provider_configurations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "product" varchar(32) NOT NULL,
  "provider_key" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DISABLED',
  "secret_arn" text,
  "region" varchar(32),
  "configuration_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_provider_configurations_tenant_idx"
  ON "ai_provider_configurations" ("tenant_id", "product");

CREATE TABLE IF NOT EXISTS "ai_model_policies" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "product" varchar(32) NOT NULL,
  "name" varchar(200) NOT NULL,
  "provider_key" varchar(64) NOT NULL,
  "model_id" varchar(200) NOT NULL,
  "max_input_tokens" integer NOT NULL DEFAULT 8000,
  "max_output_tokens" integer NOT NULL DEFAULT 2000,
  "allow_confidential" boolean NOT NULL DEFAULT false,
  "allow_restricted" boolean NOT NULL DEFAULT false,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_model_policies_tenant_idx"
  ON "ai_model_policies" ("tenant_id", "product", "status");

CREATE TABLE IF NOT EXISTS "ai_narrative_policies" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "product" varchar(32) NOT NULL,
  "require_accepted_terms" boolean NOT NULL DEFAULT true,
  "terms_accepted_at" timestamptz,
  "terms_accepted_by_user_id" uuid REFERENCES "users"("id"),
  "monthly_request_quota" integer NOT NULL DEFAULT 100,
  "daily_user_quota" integer NOT NULL DEFAULT 20,
  "per_record_limit" integer NOT NULL DEFAULT 10,
  "cost_ceiling_usd" numeric(12, 4),
  "status" varchar(32) NOT NULL DEFAULT 'DISABLED',
  "policy_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_narrative_policies_tenant_product_uidx"
  ON "ai_narrative_policies" ("tenant_id", "product");

CREATE TABLE IF NOT EXISTS "ai_narrative_templates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "product" varchar(32) NOT NULL,
  "module" varchar(64) NOT NULL,
  "record_type" varchar(120) NOT NULL,
  "key" varchar(120) NOT NULL,
  "name" varchar(200) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "is_system" boolean NOT NULL DEFAULT false,
  "current_version" integer NOT NULL DEFAULT 1,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_narrative_templates_key_uidx"
  ON "ai_narrative_templates" ("tenant_id", "product", "key");

CREATE TABLE IF NOT EXISTS "ai_narrative_template_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "template_id" uuid NOT NULL REFERENCES "ai_narrative_templates"("id"),
  "version" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "system_prompt" text NOT NULL,
  "user_prompt_template" text NOT NULL,
  "safety_rules_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "published_at" timestamptz,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_narrative_template_versions_uidx"
  ON "ai_narrative_template_versions" ("template_id", "version");

CREATE TABLE IF NOT EXISTS "ai_narrative_requests" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product" varchar(32) NOT NULL,
  "module" varchar(64) NOT NULL,
  "record_type" varchar(120) NOT NULL,
  "record_id" uuid NOT NULL,
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "request_type" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "provider" varchar(64),
  "model_policy_id" uuid REFERENCES "ai_model_policies"("id"),
  "template_version_id" uuid REFERENCES "ai_narrative_template_versions"("id"),
  "source_hash" varchar(128),
  "correlation_id" varchar(128) NOT NULL,
  "idempotency_key" varchar(128),
  "failure_code" varchar(64),
  "failure_summary" text,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "failed_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_narrative_requests_tenant_record_idx"
  ON "ai_narrative_requests" ("tenant_id", "record_type", "record_id");
CREATE INDEX IF NOT EXISTS "ai_narrative_requests_status_idx"
  ON "ai_narrative_requests" ("tenant_id", "status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_narrative_requests_idempotency_uidx"
  ON "ai_narrative_requests" ("tenant_id", "idempotency_key");

CREATE TABLE IF NOT EXISTS "ai_narrative_sources" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL REFERENCES "ai_narrative_requests"("id"),
  "manifest_json" jsonb NOT NULL,
  "redaction_summary_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_narrative_sources_request_idx"
  ON "ai_narrative_sources" ("request_id");

CREATE TABLE IF NOT EXISTS "ai_narrative_drafts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL REFERENCES "ai_narrative_requests"("id"),
  "draft_text" text NOT NULL,
  "structured_response_json" jsonb NOT NULL,
  "confidence_summary" text,
  "warnings_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "missing_information_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "unsupported_claims_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_mapping_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "label" varchar(64) NOT NULL DEFAULT 'AI DRAFT — NOT REVIEWED',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "accepted_at" timestamptz,
  "accepted_by_user_id" uuid REFERENCES "users"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_narrative_drafts_request_idx"
  ON "ai_narrative_drafts" ("request_id", "version");

CREATE TABLE IF NOT EXISTS "ai_narrative_revisions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL REFERENCES "ai_narrative_requests"("id"),
  "draft_id" uuid NOT NULL REFERENCES "ai_narrative_drafts"("id"),
  "action" varchar(64) NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "snapshot_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_narrative_revisions_request_idx"
  ON "ai_narrative_revisions" ("request_id", "created_at");

CREATE TABLE IF NOT EXISTS "ai_narrative_feedback" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL REFERENCES "ai_narrative_requests"("id"),
  "draft_id" uuid REFERENCES "ai_narrative_drafts"("id"),
  "rating" integer,
  "body" text,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_narrative_feedback_request_idx"
  ON "ai_narrative_feedback" ("request_id");

CREATE TABLE IF NOT EXISTS "ai_narrative_usage" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product" varchar(32) NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "request_id" uuid REFERENCES "ai_narrative_requests"("id"),
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "estimated_cost_usd" numeric(12, 6),
  "latency_ms" integer,
  "outcome" varchar(32) NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_narrative_usage_tenant_time_idx"
  ON "ai_narrative_usage" ("tenant_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "ai_narrative_audit_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "product" varchar(32) NOT NULL,
  "module" varchar(64),
  "record_type" varchar(120),
  "record_id" uuid,
  "request_id" uuid REFERENCES "ai_narrative_requests"("id"),
  "provider" varchar(64),
  "model_policy_id" uuid,
  "template_version_id" uuid,
  "source_hash" varchar(128),
  "action" varchar(80) NOT NULL,
  "correlation_id" varchar(128) NOT NULL,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_narrative_audit_events_tenant_time_idx"
  ON "ai_narrative_audit_events" ("tenant_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "ai_narrative_audit_events_request_idx"
  ON "ai_narrative_audit_events" ("request_id");

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_provider_configurations',
    'ai_model_policies',
    'ai_narrative_policies',
    'ai_narrative_templates',
    'ai_narrative_template_versions',
    'ai_narrative_requests',
    'ai_narrative_sources',
    'ai_narrative_drafts',
    'ai_narrative_revisions',
    'ai_narrative_feedback',
    'ai_narrative_usage',
    'ai_narrative_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (
         tenant_id IS NULL
         OR tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid
       ) WITH CHECK (
         tenant_id IS NULL
         OR tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid
       )',
      t, t
    );
  END LOOP;
END $$;
