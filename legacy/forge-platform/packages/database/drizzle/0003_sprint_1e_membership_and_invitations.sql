-- Sprint 1E: tenant membership aggregate (ADR-021) and full invitation
-- lifecycle (ADR-020), plus authentication-failure and session tracking.
-- All new tenant-owned tables enable and FORCE row level security.

-- ---------------------------------------------------------------------------
-- users: session revocation and authentication failure tracking
-- ---------------------------------------------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "failed_login_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_failed_login_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_auth_failure_reason" varchar(64),
  ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- user_tenant_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user_tenant_memberships" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "is_default_tenant" boolean NOT NULL DEFAULT false,
  "invitation_id" uuid,
  "activated_at" timestamptz,
  "suspended_at" timestamptz,
  "suspension_reason" text,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "archived_at" timestamptz,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_tenant_memberships_status_chk" CHECK (
    "status" IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'ARCHIVED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_tenant_memberships_tenant_user_uidx"
  ON "user_tenant_memberships" ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "user_tenant_memberships_user_status_idx"
  ON "user_tenant_memberships" ("user_id", "status");

-- ---------------------------------------------------------------------------
-- membership_role_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "membership_role_assignments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "membership_id" uuid NOT NULL REFERENCES "user_tenant_memberships"("id"),
  "role_id" uuid NOT NULL REFERENCES "roles"("id"),
  "organization_id" uuid REFERENCES "organizations"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "granted_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "granted_at" timestamptz,
  "revoked_at" timestamptz,
  "revoked_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "membership_role_assignments_status_chk" CHECK (
    "status" IN ('PENDING', 'ACTIVE', 'REVOKED')
  )
);

-- NULLS NOT DISTINCT so a tenant-wide grant (null organization) is also unique.
CREATE UNIQUE INDEX IF NOT EXISTS "membership_role_assignments_membership_role_org_uidx"
  ON "membership_role_assignments" ("membership_id", "role_id", "organization_id")
  NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- membership_product_access / membership_module_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "membership_product_access" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "membership_id" uuid NOT NULL REFERENCES "user_tenant_memberships"("id"),
  "product_id" uuid NOT NULL REFERENCES "platform_products"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "granted_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "membership_product_access_membership_product_uidx"
  ON "membership_product_access" ("membership_id", "product_id");

CREATE TABLE IF NOT EXISTS "membership_module_access" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "membership_id" uuid NOT NULL REFERENCES "user_tenant_memberships"("id"),
  "module_id" uuid NOT NULL REFERENCES "platform_modules"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "granted_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "membership_module_access_membership_module_uidx"
  ON "membership_module_access" ("membership_id", "module_id");

-- ---------------------------------------------------------------------------
-- membership_history (append only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "membership_history" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "membership_id" uuid NOT NULL REFERENCES "user_tenant_memberships"("id"),
  "action" varchar(64) NOT NULL,
  "from_status" varchar(32),
  "to_status" varchar(32) NOT NULL,
  "reason" text,
  "changed_by_user_id" uuid REFERENCES "users"("id"),
  "correlation_id" varchar(128) NOT NULL,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "membership_history_membership_created_idx"
  ON "membership_history" ("membership_id", "created_at");

-- ---------------------------------------------------------------------------
-- user_invitations: full lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE "user_invitations"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id"),
  ADD COLUMN IF NOT EXISTS "first_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "last_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "role_codes_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "product_codes_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "module_codes_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "cognito_username" varchar(255),
  ADD COLUMN IF NOT EXISTS "cognito_subject" varchar(255),
  ADD COLUMN IF NOT EXISTS "membership_id" uuid,
  ADD COLUMN IF NOT EXISTS "revoked_by_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "sent_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "resend_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_resent_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "failure_reason" text,
  ADD COLUMN IF NOT EXISTS "record_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "user_invitations" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "user_invitations"
  DROP CONSTRAINT IF EXISTS "user_invitations_status_chk";
ALTER TABLE "user_invitations"
  ADD CONSTRAINT "user_invitations_status_chk" CHECK (
    "status" IN ('DRAFT', 'PENDING', 'SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'FAILED')
  );

-- At most one non-terminal invitation per tenant and email.
CREATE UNIQUE INDEX IF NOT EXISTS "user_invitations_tenant_email_active_uidx"
  ON "user_invitations" ("tenant_id", "email")
  WHERE "status" IN ('DRAFT', 'PENDING', 'SENT');

CREATE INDEX IF NOT EXISTS "user_invitations_tenant_status_idx"
  ON "user_invitations" ("tenant_id", "status");

-- Deferred cross-references between invitations and memberships.
ALTER TABLE "user_tenant_memberships"
  DROP CONSTRAINT IF EXISTS "user_tenant_memberships_invitation_id_fk";
ALTER TABLE "user_tenant_memberships"
  ADD CONSTRAINT "user_tenant_memberships_invitation_id_fk"
  FOREIGN KEY ("invitation_id") REFERENCES "user_invitations"("id");

ALTER TABLE "user_invitations"
  DROP CONSTRAINT IF EXISTS "user_invitations_membership_id_fk";
ALTER TABLE "user_invitations"
  ADD CONSTRAINT "user_invitations_membership_id_fk"
  FOREIGN KEY ("membership_id") REFERENCES "user_tenant_memberships"("id");

-- ---------------------------------------------------------------------------
-- Backfill memberships from the Sprint 1D user_tenant_access projection
-- ---------------------------------------------------------------------------
INSERT INTO "user_tenant_memberships" (
  "id", "tenant_id", "user_id", "status", "is_default_tenant",
  "activated_at", "created_at", "updated_at"
)
SELECT
  a."id",
  a."tenant_id",
  a."user_id",
  CASE WHEN a."status" = 'ACTIVE' THEN 'ACTIVE' ELSE 'SUSPENDED' END,
  a."is_default_tenant",
  CASE WHEN a."status" = 'ACTIVE' THEN a."created_at" ELSE NULL END,
  a."created_at",
  a."updated_at"
FROM "user_tenant_access" a
ON CONFLICT ("tenant_id", "user_id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_tenant_memberships',
    'membership_role_assignments',
    'membership_product_access',
    'membership_module_access',
    'membership_history'
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

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "user_tenant_memberships",
  "membership_role_assignments",
  "membership_product_access",
  "membership_module_access"
  TO forge_app;

-- membership_history is append only: ALTER DEFAULT PRIVILEGES would otherwise
-- have granted UPDATE and DELETE along with the rest.
GRANT SELECT, INSERT ON "membership_history" TO forge_app;
REVOKE UPDATE, DELETE ON "membership_history" FROM forge_app;
