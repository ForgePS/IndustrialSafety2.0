-- NERIS Phase 4D: CAD unit/personnel mappings and unknown-entity queues.

CREATE TABLE IF NOT EXISTS "cad_unit_mappings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "source_unit_id" varchar(120) NOT NULL,
  "source_unit_callsign" varchar(120),
  "forge_apparatus_id" uuid REFERENCES "rms_apparatus"("id"),
  "forge_unit_id" uuid REFERENCES "rms_units"("id"),
  "mapping_type" varchar(40) NOT NULL DEFAULT 'APPARATUS',
  "external_agency" boolean NOT NULL DEFAULT false,
  "confidence" numeric(5, 2),
  "notes" text,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_unit_mappings_type_chk" CHECK ("mapping_type" IN (
    'APPARATUS', 'UNIT', 'INCIDENT_ONLY', 'EXTERNAL'
  )),
  CONSTRAINT "cad_unit_mappings_status_chk" CHECK ("status" IN (
    'ACTIVE', 'DEPRECATED', 'IGNORED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_unit_mappings_uidx"
  ON "cad_unit_mappings" ("tenant_id", "cad_connection_id", "source_unit_id");
CREATE INDEX IF NOT EXISTS "cad_unit_mappings_tenant_idx"
  ON "cad_unit_mappings" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "cad_unknown_units" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "source_unit_id" varchar(120) NOT NULL,
  "source_unit_callsign" varchar(120),
  "occurrence_count" integer NOT NULL DEFAULT 1,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_raw_message_id" uuid REFERENCES "cad_raw_messages"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'OPEN',
  "assigned_reviewer_user_id" uuid,
  "resolved_mapping_id" uuid REFERENCES "cad_unit_mappings"("id"),
  "resolution_reason" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_unknown_units_status_chk" CHECK ("status" IN (
    'OPEN', 'MAPPED', 'IGNORED_WITH_REASON', 'ESCALATED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_unknown_units_uidx"
  ON "cad_unknown_units" ("tenant_id", "cad_connection_id", "source_unit_id");
CREATE INDEX IF NOT EXISTS "cad_unknown_units_status_idx"
  ON "cad_unknown_units" ("tenant_id", "status", "last_seen_at" DESC);

CREATE TABLE IF NOT EXISTS "cad_personnel_mappings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "source_personnel_id" varchar(120) NOT NULL,
  "source_name" varchar(300),
  "forge_person_id" uuid,
  "forge_personnel_id" uuid REFERENCES "rms_personnel"("id"),
  "mapping_type" varchar(40) NOT NULL DEFAULT 'PERSONNEL',
  "external_agency" boolean NOT NULL DEFAULT false,
  "confidence" numeric(5, 2),
  "notes" text,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_personnel_mappings_type_chk" CHECK ("mapping_type" IN (
    'PERSONNEL', 'PERSON', 'INCIDENT_ONLY', 'EXTERNAL'
  )),
  CONSTRAINT "cad_personnel_mappings_status_chk" CHECK ("status" IN (
    'ACTIVE', 'DEPRECATED', 'IGNORED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_personnel_mappings_uidx"
  ON "cad_personnel_mappings" ("tenant_id", "cad_connection_id", "source_personnel_id");

CREATE TABLE IF NOT EXISTS "cad_unknown_personnel" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "source_personnel_id" varchar(120) NOT NULL,
  "source_name" varchar(300),
  "occurrence_count" integer NOT NULL DEFAULT 1,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_raw_message_id" uuid REFERENCES "cad_raw_messages"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'OPEN',
  "assigned_reviewer_user_id" uuid,
  "resolved_mapping_id" uuid REFERENCES "cad_personnel_mappings"("id"),
  "resolution_reason" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_unknown_personnel_status_chk" CHECK ("status" IN (
    'OPEN', 'MAPPED', 'IGNORED_WITH_REASON', 'ESCALATED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_unknown_personnel_uidx"
  ON "cad_unknown_personnel" ("tenant_id", "cad_connection_id", "source_personnel_id");
CREATE INDEX IF NOT EXISTS "cad_unknown_personnel_status_idx"
  ON "cad_unknown_personnel" ("tenant_id", "status", "last_seen_at" DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "cad_unit_mappings",
  "cad_unknown_units",
  "cad_personnel_mappings",
  "cad_unknown_personnel"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cad_unit_mappings',
    'cad_unknown_units',
    'cad_personnel_mappings',
    'cad_unknown_personnel'
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
