-- NERIS Phase 4A: CAD raw messages + normalized events + CAD comments.
-- Raw payloads are immutable; prefer S3 storage. Never log full payloads.

CREATE TABLE IF NOT EXISTS "cad_raw_messages" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "transport_type" varchar(64) NOT NULL,
  "source_message_id" varchar(200),
  "source_incident_id" varchar(200),
  "source_event_type" varchar(120),
  "source_version" varchar(64),
  "source_sequence" bigint,
  "content_type" varchar(120),
  "content_encoding" varchar(64),
  "payload_storage_type" varchar(32) NOT NULL DEFAULT 'S3',
  "payload_s3_bucket" varchar(255),
  "payload_s3_key" varchar(1000),
  "inline_payload_encrypted" bytea,
  "payload_hash" varchar(64) NOT NULL,
  "payload_size_bytes" bigint,
  "idempotency_key" varchar(500) NOT NULL,
  "authentication_status" varchar(32) NOT NULL DEFAULT 'NOT_EVALUATED',
  "signature_valid" boolean,
  "replay_status" varchar(32),
  "processing_status" varchar(40) NOT NULL DEFAULT 'RECEIVED',
  "processing_attempts" integer NOT NULL DEFAULT 0,
  "current_processing_stage" varchar(64),
  "last_processing_error_code" varchar(80),
  "last_processing_error_summary" text,
  "acknowledgement_status" varchar(40),
  "acknowledged_at" timestamptz,
  "retention_until" timestamptz,
  "quarantined_at" timestamptz,
  "dead_lettered_at" timestamptz,
  "applied_at" timestamptz,
  "correlation_id" varchar(64) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_raw_messages_auth_chk" CHECK ("authentication_status" IN (
    'NOT_EVALUATED', 'VALID', 'INVALID', 'EXPIRED', 'REPLAYED', 'MISSING', 'ERROR'
  )),
  CONSTRAINT "cad_raw_messages_processing_chk" CHECK ("processing_status" IN (
    'RECEIVED', 'AUTHENTICATING', 'REJECTED_AUTHENTICATION', 'VALIDATING',
    'REJECTED_VALIDATION', 'PERSISTED', 'QUEUED', 'NORMALIZING', 'NORMALIZED',
    'MATCHING', 'APPLYING', 'APPLIED', 'DUPLICATE', 'REQUIRES_REVIEW',
    'QUARANTINED', 'FAILED', 'DEAD_LETTER'
  )),
  CONSTRAINT "cad_raw_messages_storage_chk" CHECK ("payload_storage_type" IN (
    'S3', 'INLINE_ENCRYPTED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_raw_messages_idempotency_uidx"
  ON "cad_raw_messages" ("tenant_id", "cad_connection_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "cad_raw_messages_tenant_received_idx"
  ON "cad_raw_messages" ("tenant_id", "received_at" DESC);
CREATE INDEX IF NOT EXISTS "cad_raw_messages_tenant_status_idx"
  ON "cad_raw_messages" ("tenant_id", "processing_status");
CREATE INDEX IF NOT EXISTS "cad_raw_messages_connection_idx"
  ON "cad_raw_messages" ("cad_connection_id", "received_at" DESC);
CREATE INDEX IF NOT EXISTS "cad_raw_messages_source_message_idx"
  ON "cad_raw_messages" ("tenant_id", "cad_connection_id", "source_message_id")
  WHERE "source_message_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "cad_normalized_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "cad_raw_message_id" uuid NOT NULL REFERENCES "cad_raw_messages"("id"),
  "adapter_key" varchar(120) NOT NULL,
  "adapter_version" varchar(64) NOT NULL,
  "mapping_profile_id" uuid REFERENCES "cad_mapping_profiles"("id"),
  "mapping_profile_version" integer,
  "source_message_id" varchar(200),
  "source_incident_id" varchar(200),
  "source_incident_number" varchar(120),
  "source_event_id" varchar(200),
  "source_sequence" bigint,
  "normalized_event_type" varchar(64) NOT NULL,
  "normalized_event_timestamp" timestamptz NOT NULL,
  "original_event_timestamp" text,
  "original_timezone" varchar(64),
  "normalized_payload" jsonb NOT NULL,
  "normalization_warnings" jsonb,
  "normalization_errors" jsonb,
  "mapping_status" varchar(40),
  "incident_application_status" varchar(40),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cad_normalized_events_tenant_ts_idx"
  ON "cad_normalized_events" ("tenant_id", "normalized_event_timestamp" DESC);
CREATE INDEX IF NOT EXISTS "cad_normalized_events_raw_idx"
  ON "cad_normalized_events" ("cad_raw_message_id");
CREATE INDEX IF NOT EXISTS "cad_normalized_events_source_incident_idx"
  ON "cad_normalized_events" ("tenant_id", "cad_connection_id", "source_incident_id")
  WHERE "source_incident_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "cad_normalized_events_type_idx"
  ON "cad_normalized_events" ("tenant_id", "normalized_event_type");

-- CAD comment timeline (separate from official incident narrative)
CREATE TABLE IF NOT EXISTS "cad_comments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "cad_normalized_event_id" uuid REFERENCES "cad_normalized_events"("id"),
  "incident_id" uuid REFERENCES "neris_incidents"("id"),
  "source_comment_id" varchar(200),
  "source_sequence" bigint,
  "source_timestamp" timestamptz,
  "normalized_timestamp" timestamptz,
  "category" varchar(80),
  "author_or_source" varchar(200),
  "comment_text" text NOT NULL,
  "restricted" boolean NOT NULL DEFAULT false,
  "copied_to_narrative_at" timestamptz,
  "copied_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cad_comments_incident_idx"
  ON "cad_comments" ("tenant_id", "incident_id", "normalized_timestamp" DESC);
CREATE INDEX IF NOT EXISTS "cad_comments_connection_idx"
  ON "cad_comments" ("tenant_id", "cad_connection_id", "created_at" DESC);

-- Replay / nonce cache for webhook security (short-lived rows; retention worker purges)
CREATE TABLE IF NOT EXISTS "cad_webhook_replay_cache" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "nonce" varchar(200),
  "message_id" varchar(200),
  "request_hash" varchar(64) NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_webhook_replay_nonce_uidx"
  ON "cad_webhook_replay_cache" ("cad_connection_id", "nonce")
  WHERE "nonce" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "cad_webhook_replay_message_uidx"
  ON "cad_webhook_replay_cache" ("cad_connection_id", "message_id")
  WHERE "message_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "cad_webhook_replay_expires_idx"
  ON "cad_webhook_replay_cache" ("expires_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "cad_raw_messages",
  "cad_normalized_events",
  "cad_comments",
  "cad_webhook_replay_cache"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cad_raw_messages',
    'cad_normalized_events',
    'cad_comments',
    'cad_webhook_replay_cache'
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
