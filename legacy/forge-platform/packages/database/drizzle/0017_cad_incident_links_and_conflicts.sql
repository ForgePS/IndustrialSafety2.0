-- NERIS Phase 4C: CAD incident links, conflicts, field provenance, duplicate review queue.
-- FORCE RLS on all new tenant-scoped tables. Does not touch app DB secret or Aurora.

CREATE TABLE IF NOT EXISTS "cad_incident_links" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "source_incident_id" varchar(200) NOT NULL,
  "source_incident_number" varchar(120),
  "source_event_id" varchar(200),
  "link_status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "link_method" varchar(32) NOT NULL DEFAULT 'AUTOMATIC',
  "match_score" integer,
  "match_details_json" jsonb,
  "linked_at" timestamptz NOT NULL DEFAULT now(),
  "linked_by_user_id" uuid,
  "last_cad_sequence" bigint,
  "last_cad_update_at" timestamptz,
  "cad_update_cutoff_policy" varchar(64) NOT NULL DEFAULT 'UNTIL_FINALIZED',
  "cad_update_cutoff_at" timestamptz,
  "manual_override_status" varchar(40),
  "manual_override_reason" text,
  "suspended_at" timestamptz,
  "suspended_by_user_id" uuid,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_incident_links_status_chk" CHECK ("link_status" IN (
    'ACTIVE', 'SUSPENDED', 'UNLINKED', 'CLOSED', 'CONFLICT'
  )),
  CONSTRAINT "cad_incident_links_method_chk" CHECK ("link_method" IN (
    'AUTOMATIC', 'MANUAL', 'HYBRID_MATCH', 'IMPORT'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_incident_links_source_uidx"
  ON "cad_incident_links" ("tenant_id", "cad_connection_id", "source_incident_id")
  WHERE "link_status" IN ('ACTIVE', 'SUSPENDED', 'CONFLICT');
CREATE INDEX IF NOT EXISTS "cad_incident_links_incident_idx"
  ON "cad_incident_links" ("tenant_id", "incident_id");
CREATE INDEX IF NOT EXISTS "cad_incident_links_connection_idx"
  ON "cad_incident_links" ("tenant_id", "cad_connection_id", "link_status");

CREATE TABLE IF NOT EXISTS "cad_conflicts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid REFERENCES "neris_incidents"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "cad_raw_message_id" uuid REFERENCES "cad_raw_messages"("id"),
  "cad_normalized_event_id" uuid REFERENCES "cad_normalized_events"("id"),
  "conflict_type" varchar(64) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'OPEN',
  "field_identifier" varchar(200),
  "cad_value_json" jsonb,
  "forge_value_json" jsonb,
  "source_timestamp" timestamptz,
  "forge_updated_at" timestamptz,
  "ownership_policy" varchar(64),
  "recommended_resolution" varchar(64),
  "resolution_action" varchar(64),
  "resolution_reason" text,
  "resolved_at" timestamptz,
  "resolved_by_user_id" uuid,
  "escalated_at" timestamptz,
  "escalated_to_user_id" uuid,
  "severity" varchar(32) NOT NULL DEFAULT 'MEDIUM',
  "match_score" integer,
  "candidate_incident_ids_json" jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_conflicts_type_chk" CHECK ("conflict_type" IN (
    'VALUE_CONFLICT', 'TIME_CONFLICT', 'LOCATION_CONFLICT', 'UNIT_CONFLICT',
    'PERSONNEL_CONFLICT', 'INCIDENT_TYPE_CONFLICT', 'PRIORITY_CONFLICT',
    'FINALIZED_RECORD_CONFLICT', 'DUPLICATE_INCIDENT', 'OUT_OF_ORDER_EVENT',
    'UNMAPPED_VALUE', 'UNKNOWN_UNIT', 'UNKNOWN_PERSONNEL', 'INVALID_MAPPING',
    'MANUAL_OVERRIDE_CONFLICT', 'AMBIGUOUS_MATCH'
  )),
  CONSTRAINT "cad_conflicts_status_chk" CHECK ("status" IN (
    'OPEN', 'AUTO_RESOLVED', 'MANUALLY_RESOLVED', 'IGNORED_WITH_REASON', 'ESCALATED'
  )),
  CONSTRAINT "cad_conflicts_resolution_chk" CHECK (
    "resolution_action" IS NULL OR "resolution_action" IN (
      'USE_CAD', 'KEEP_FORGE', 'MERGE', 'LINK', 'UNLINK', 'CREATE_NEW',
      'IGNORE', 'ESCALATE', 'CORRECT_MAPPING'
    )
  )
);

CREATE INDEX IF NOT EXISTS "cad_conflicts_tenant_status_idx"
  ON "cad_conflicts" ("tenant_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "cad_conflicts_incident_idx"
  ON "cad_conflicts" ("tenant_id", "incident_id")
  WHERE "incident_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "cad_conflicts_type_idx"
  ON "cad_conflicts" ("tenant_id", "conflict_type", "status");

CREATE TABLE IF NOT EXISTS "cad_field_provenance" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "field_identifier" varchar(200) NOT NULL,
  "current_value_source" varchar(32) NOT NULL,
  "source_system" varchar(64) NOT NULL DEFAULT 'CAD',
  "cad_connection_id" uuid REFERENCES "cad_connections"("id"),
  "cad_raw_message_id" uuid REFERENCES "cad_raw_messages"("id"),
  "cad_normalized_event_id" uuid REFERENCES "cad_normalized_events"("id"),
  "source_path" varchar(500),
  "source_value_hash" varchar(64),
  "mapping_profile_id" uuid REFERENCES "cad_mapping_profiles"("id"),
  "mapping_version" integer,
  "applied_at" timestamptz NOT NULL DEFAULT now(),
  "applied_by_user_id" uuid,
  "manual_override_at" timestamptz,
  "manual_override_by_user_id" uuid,
  "manual_override_reason" text,
  "ownership_policy" varchar(64) NOT NULL DEFAULT 'CAD_UNTIL_MANUAL_EDIT',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_field_provenance_source_chk" CHECK ("current_value_source" IN (
    'CAD', 'MANUAL', 'MASTER_DATA', 'DERIVED', 'SYSTEM', 'IMPORT'
  )),
  CONSTRAINT "cad_field_provenance_ownership_chk" CHECK ("ownership_policy" IN (
    'CAD_AUTHORITATIVE', 'MANUAL_AUTHORITATIVE', 'CAD_UNTIL_MANUAL_EDIT',
    'CAD_UNTIL_REVIEW', 'LATEST_TIMESTAMP', 'APPEND_ONLY',
    'REQUIRES_RECONCILIATION', 'NEVER_OVERWRITE'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_field_provenance_uidx"
  ON "cad_field_provenance" ("tenant_id", "incident_id", "field_identifier");
CREATE INDEX IF NOT EXISTS "cad_field_provenance_incident_idx"
  ON "cad_field_provenance" ("tenant_id", "incident_id");

CREATE TABLE IF NOT EXISTS "cad_manual_fallback_sessions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid REFERENCES "cad_connections"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "reason" text NOT NULL,
  "declared_by_user_id" uuid NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "ended_by_user_id" uuid,
  "affected_incident_count" integer NOT NULL DEFAULT 0,
  "unresolved_duplicate_count" integer NOT NULL DEFAULT 0,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_manual_fallback_status_chk" CHECK ("status" IN ('ACTIVE', 'ENDED'))
);

CREATE INDEX IF NOT EXISTS "cad_manual_fallback_tenant_idx"
  ON "cad_manual_fallback_sessions" ("tenant_id", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "cad_incident_links",
  "cad_conflicts",
  "cad_field_provenance",
  "cad_manual_fallback_sessions"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cad_incident_links',
    'cad_conflicts',
    'cad_field_provenance',
    'cad_manual_fallback_sessions'
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
