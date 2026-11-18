-- NERIS Phase 4E: CAD outage/health logs and retention run audit.

CREATE TABLE IF NOT EXISTS "cad_connection_outages" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "reason" text NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "started_by_user_id" uuid,
  "ended_by_user_id" uuid,
  "source" varchar(40) NOT NULL DEFAULT 'MANUAL',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_connection_outages_status_chk" CHECK ("status" IN ('ACTIVE', 'ENDED')),
  CONSTRAINT "cad_connection_outages_source_chk" CHECK ("source" IN (
    'MANUAL', 'SIMULATOR', 'HEALTH_CHECK', 'SYSTEM'
  ))
);

CREATE INDEX IF NOT EXISTS "cad_connection_outages_tenant_idx"
  ON "cad_connection_outages" ("tenant_id", "status", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "cad_connection_outages_connection_idx"
  ON "cad_connection_outages" ("cad_connection_id", "status");

CREATE TABLE IF NOT EXISTS "cad_connection_health_logs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "checked_at" timestamptz NOT NULL DEFAULT now(),
  "health_status" varchar(32) NOT NULL,
  "latency_ms" integer,
  "detail" text,
  "source" varchar(40) NOT NULL DEFAULT 'SYSTEM',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_connection_health_logs_status_chk" CHECK ("health_status" IN (
    'UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY'
  )),
  CONSTRAINT "cad_connection_health_logs_source_chk" CHECK ("source" IN (
    'TEST', 'POLL', 'WEBHOOK', 'SIMULATOR', 'SYSTEM'
  ))
);

CREATE INDEX IF NOT EXISTS "cad_connection_health_logs_tenant_idx"
  ON "cad_connection_health_logs" ("tenant_id", "cad_connection_id", "checked_at" DESC);

CREATE TABLE IF NOT EXISTS "cad_retention_runs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "status" varchar(32) NOT NULL DEFAULT 'RUNNING',
  "scope" varchar(64) NOT NULL DEFAULT 'RAW_AND_REPLAY',
  "replay_cache_purged" integer NOT NULL DEFAULT 0,
  "raw_payloads_purged" integer NOT NULL DEFAULT 0,
  "caller_fields_redacted" integer NOT NULL DEFAULT 0,
  "error_summary" text,
  "correlation_id" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_retention_runs_status_chk" CHECK ("status" IN (
    'RUNNING', 'COMPLETED', 'FAILED'
  ))
);

CREATE INDEX IF NOT EXISTS "cad_retention_runs_started_idx"
  ON "cad_retention_runs" ("started_at" DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "cad_connection_outages",
  "cad_connection_health_logs",
  "cad_retention_runs"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cad_connection_outages',
    'cad_connection_health_logs'
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

-- Retention runs may be platform-scoped (tenant_id NULL) or tenant-scoped.
ALTER TABLE "cad_retention_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cad_retention_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cad_retention_runs_tenant_isolation" ON "cad_retention_runs";
CREATE POLICY "cad_retention_runs_tenant_isolation" ON "cad_retention_runs"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
