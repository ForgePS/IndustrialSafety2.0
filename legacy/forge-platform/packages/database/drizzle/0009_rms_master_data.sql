CREATE TABLE IF NOT EXISTS "rms_stations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "station_number" varchar(32) NOT NULL,
  "name" varchar(200) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "address_line1" varchar(300),
  "address_line2" varchar(300),
  "city" varchar(120),
  "state" varchar(64),
  "postal_code" varchar(32),
  "timezone" varchar(64) NOT NULL DEFAULT 'America/Chicago',
  "default_response_district" varchar(120),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_stations_tenant_number_uidx" ON "rms_stations" ("tenant_id", "station_number");
CREATE INDEX IF NOT EXISTS "rms_stations_tenant_status_idx" ON "rms_stations" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "rms_shifts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(120) NOT NULL,
  "code" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "schedule_reference" varchar(200),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_shifts_tenant_code_uidx" ON "rms_shifts" ("tenant_id", "code");

CREATE TABLE IF NOT EXISTS "rms_apparatus" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "apparatus_number" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "apparatus_type" varchar(64) NOT NULL,
  "station_id" uuid REFERENCES "rms_stations"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "neris_classification" varchar(120),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_apparatus_tenant_number_uidx" ON "rms_apparatus" ("tenant_id", "apparatus_number");
CREATE INDEX IF NOT EXISTS "rms_apparatus_station_idx" ON "rms_apparatus" ("station_id");

CREATE TABLE IF NOT EXISTS "rms_units" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "unit_number" varchar(64) NOT NULL,
  "call_sign" varchar(64) NOT NULL,
  "unit_type" varchar(64) NOT NULL,
  "apparatus_id" uuid REFERENCES "rms_apparatus"("id"),
  "station_id" uuid REFERENCES "rms_stations"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_units_tenant_number_uidx" ON "rms_units" ("tenant_id", "unit_number");
CREATE INDEX IF NOT EXISTS "rms_units_station_idx" ON "rms_units" ("station_id");

CREATE TABLE IF NOT EXISTS "rms_personnel" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "rank" varchar(80),
  "qualification_summary" text,
  "station_id" uuid REFERENCES "rms_stations"("id"),
  "shift_id" uuid REFERENCES "rms_shifts"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "incident_eligible" boolean NOT NULL DEFAULT true,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_personnel_tenant_person_uidx" ON "rms_personnel" ("tenant_id", "person_id");
CREATE INDEX IF NOT EXISTS "rms_personnel_station_idx" ON "rms_personnel" ("station_id");

CREATE TABLE IF NOT EXISTS "rms_daily_rosters" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "roster_date" date NOT NULL,
  "shift_id" uuid NOT NULL REFERENCES "rms_shifts"("id"),
  "station_id" uuid NOT NULL REFERENCES "rms_stations"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_daily_rosters_tenant_date_shift_station_uidx"
  ON "rms_daily_rosters" ("tenant_id", "roster_date", "shift_id", "station_id");

CREATE TABLE IF NOT EXISTS "rms_roster_assignments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "roster_id" uuid NOT NULL REFERENCES "rms_daily_rosters"("id"),
  "unit_id" uuid REFERENCES "rms_units"("id"),
  "personnel_id" uuid NOT NULL REFERENCES "rms_personnel"("id"),
  "assignment_role" varchar(80) NOT NULL DEFAULT 'MEMBER',
  "is_officer" boolean NOT NULL DEFAULT false,
  "incident_commander_eligible" boolean NOT NULL DEFAULT false,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_roster_assignments_roster_personnel_uidx"
  ON "rms_roster_assignments" ("roster_id", "personnel_id");
CREATE INDEX IF NOT EXISTS "rms_roster_assignments_unit_idx" ON "rms_roster_assignments" ("unit_id");

CREATE TABLE IF NOT EXISTS "rms_occupancies" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(300) NOT NULL,
  "address_line1" varchar(300),
  "city" varchar(120),
  "state" varchar(64),
  "postal_code" varchar(32),
  "latitude" double precision,
  "longitude" double precision,
  "primary_contact" varchar(200),
  "occupancy_type" varchar(120),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "preplan_id" uuid,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);
CREATE INDEX IF NOT EXISTS "rms_occupancies_tenant_name_idx" ON "rms_occupancies" ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "rms_occupancies_tenant_status_idx" ON "rms_occupancies" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "rms_preplans" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "occupancy_id" uuid NOT NULL REFERENCES "rms_occupancies"("id"),
  "version_label" varchar(64) NOT NULL DEFAULT '1',
  "approval_status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "tactical_summary" text,
  "hazards" text,
  "access_notes" text,
  "utility_notes" text,
  "primary_station_id" uuid REFERENCES "rms_stations"("id"),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "rms_preplans_occupancy_version_uidx"
  ON "rms_preplans" ("occupancy_id", "version_label");
CREATE INDEX IF NOT EXISTS "rms_preplans_tenant_status_idx" ON "rms_preplans" ("tenant_id", "approval_status");

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "rms_stations",
  "rms_shifts",
  "rms_apparatus",
  "rms_units",
  "rms_personnel",
  "rms_daily_rosters",
  "rms_roster_assignments",
  "rms_occupancies",
  "rms_preplans"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rms_stations',
    'rms_shifts',
    'rms_apparatus',
    'rms_units',
    'rms_personnel',
    'rms_daily_rosters',
    'rms_roster_assignments',
    'rms_occupancies',
    'rms_preplans'
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
