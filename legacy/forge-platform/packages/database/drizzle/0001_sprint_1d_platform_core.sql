-- Sprint 1D platform core schema
-- DEVELOPMENT ONLY: drops Sprint 1B foundation tenants/users proof tables.
DROP TABLE IF EXISTS "users" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "tenants" CASCADE;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_products" (
  "id" uuid PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_products_code_uidx" ON "platform_products" USING btree ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_modules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "platform_products"("id"),
  "code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "is_core" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_modules_product_code_uidx" ON "platform_modules" USING btree ("product_id","code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "code" varchar(128) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "scope_type" varchar(64) DEFAULT 'TENANT' NOT NULL,
  "risk_level" varchar(32) DEFAULT 'NORMAL' NOT NULL,
  "is_sensitive" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_code_uidx" ON "permissions" USING btree ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_templates" (
  "id" uuid PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "role_type" varchar(64) DEFAULT 'TENANT' NOT NULL,
  "is_system" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_templates_code_uidx" ON "role_templates" USING btree ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_template_permissions" (
  "role_template_id" uuid NOT NULL REFERENCES "role_templates"("id"),
  "permission_id" uuid NOT NULL REFERENCES "permissions"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_template_permissions_uidx" ON "role_template_permissions" USING btree ("role_template_id","permission_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_types" (
  "id" uuid PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_types_code_uidx" ON "organization_types" USING btree ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" uuid PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "billing_interval" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "base_price_cents" integer,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "configuration_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_code_uidx" ON "subscription_plans" USING btree ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_definitions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "key" varchar(128) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "value_type" varchar(32) DEFAULT 'BOOLEAN' NOT NULL,
  "default_value_json" jsonb DEFAULT 'false'::jsonb NOT NULL,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feature_definitions_key_uidx" ON "feature_definitions" USING btree ("key");
--> statement-breakpoint
-- citext used for case-insensitive uniqueness (Drizzle schema uses varchar for simplicity)
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_key" citext NOT NULL,
  "slug" citext NOT NULL,
  "legal_name" varchar(300) NOT NULL,
  "display_name" varchar(300) NOT NULL,
  "tenant_type" varchar(64) DEFAULT 'CUSTOMER' NOT NULL,
  "status" varchar(32) DEFAULT 'PROVISIONING' NOT NULL,
  "timezone" varchar(64) DEFAULT 'America/Chicago' NOT NULL,
  "default_locale" varchar(16) DEFAULT 'en-US' NOT NULL,
  "data_region" varchar(32) DEFAULT 'us-east-1' NOT NULL,
  "suspension_reason" text,
  "suspended_at" timestamptz,
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_tenant_key_uidx" ON "tenants" USING btree ("tenant_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_uidx" ON "tenants" USING btree ("slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_domains" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "domain" citext NOT NULL,
  "domain_type" varchar(64) DEFAULT 'CUSTOM' NOT NULL,
  "verification_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "verification_token_hash" varchar(128),
  "verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_domains_domain_uidx" ON "tenant_domains" USING btree ("domain");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_settings" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "namespace" varchar(64) NOT NULL,
  "setting_key" varchar(128) NOT NULL,
  "value_json" jsonb NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "is_sensitive" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by_user_id" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_settings_tenant_ns_key_uidx" ON "tenant_settings" USING btree ("tenant_id","namespace","setting_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_branding" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "logo_document_id" uuid,
  "icon_document_id" uuid,
  "primary_color" varchar(32),
  "secondary_color" varchar(32),
  "accent_color" varchar(32),
  "email_sender_name" varchar(200),
  "support_email" citext,
  "custom_css_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_branding_tenant_uidx" ON "tenant_branding" USING btree ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "organization_type_id" uuid NOT NULL REFERENCES "organization_types"("id"),
  "parent_organization_id" uuid REFERENCES "organizations"("id"),
  "external_key" varchar(128),
  "slug" citext NOT NULL,
  "legal_name" varchar(300) NOT NULL,
  "display_name" varchar(300) NOT NULL,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "timezone" varchar(64),
  "phone" varchar(40),
  "email" citext,
  "website" varchar(500),
  "address_line_1" varchar(300),
  "address_line_2" varchar(300),
  "city" varchar(120),
  "state_province" varchar(120),
  "postal_code" varchar(32),
  "country_code" varchar(2),
  "latitude" numeric(10, 7),
  "longitude" numeric(10, 7),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "archived_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_tenant_slug_uidx" ON "organizations" USING btree ("tenant_id","slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_identifiers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "identifier_type" varchar(64) NOT NULL,
  "identifier_value" varchar(255) NOT NULL,
  "issuing_authority" varchar(200),
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_identifiers_org_type_value_uidx" ON "organization_identifiers" USING btree ("organization_id","identifier_type","identifier_value");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "persons" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "forge_person_number" varchar(64) NOT NULL,
  "first_name" varchar(100) NOT NULL,
  "middle_name" varchar(100),
  "last_name" varchar(100) NOT NULL,
  "suffix" varchar(40),
  "preferred_name" varchar(100),
  "display_name" varchar(300) NOT NULL,
  "date_of_birth" date,
  "email" citext,
  "phone" varchar(40),
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "record_source" varchar(64) DEFAULT 'MANUAL' NOT NULL,
  "merged_into_person_id" uuid REFERENCES "persons"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "archived_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "persons_tenant_forge_number_uidx" ON "persons" USING btree ("tenant_id","forge_person_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "persons_tenant_name_trgm_idx" ON "persons" USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_sensitive_data" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "data_type" varchar(64) NOT NULL,
  "encrypted_value" text NOT NULL,
  "value_fingerprint" varchar(128) NOT NULL,
  "key_version" varchar(64) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "last_accessed_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "person_sensitive_data_person_type_uidx" ON "person_sensitive_data" USING btree ("person_id","data_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_identifiers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "identifier_type" varchar(64) NOT NULL,
  "identifier_value" varchar(255) NOT NULL,
  "normalized_value" varchar(255) NOT NULL,
  "issuing_authority" varchar(200),
  "state_province" varchar(120),
  "country_code" varchar(2),
  "is_verified" boolean DEFAULT false NOT NULL,
  "verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "person_identifiers_tenant_type_norm_uidx" ON "person_identifiers" USING btree ("tenant_id","identifier_type","normalized_value");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_contacts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "contact_type" varchar(64) NOT NULL,
  "label" varchar(100),
  "value" varchar(320) NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_addresses" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "address_type" varchar(64) DEFAULT 'HOME' NOT NULL,
  "address_line_1" varchar(300),
  "address_line_2" varchar(300),
  "city" varchar(120),
  "state_province" varchar(120),
  "postal_code" varchar(32),
  "country_code" varchar(2),
  "latitude" numeric(10, 7),
  "longitude" numeric(10, 7),
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "person_id" uuid REFERENCES "persons"("id"),
  "username" varchar(100),
  "primary_email" citext NOT NULL,
  "status" varchar(32) DEFAULT 'INVITED' NOT NULL,
  "last_login_at" timestamptz,
  "invited_at" timestamptz,
  "activated_at" timestamptz,
  "disabled_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_email_uidx" ON "users" USING btree ("tenant_id","primary_email");
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_updated_by_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_merge_history" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "target_person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "reason" text,
  "field_resolution_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "merged_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "merged_at" timestamptz NOT NULL,
  "reversed_at" timestamptz,
  "reversed_by_user_id" uuid REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_duplicate_candidates" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "person_a_id" uuid NOT NULL REFERENCES "persons"("id"),
  "person_b_id" uuid NOT NULL REFERENCES "persons"("id"),
  "score" numeric(5, 4) NOT NULL,
  "matching_signals_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(32) DEFAULT 'OPEN' NOT NULL,
  "reviewed_by_user_id" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "person_duplicate_candidates_pair_uidx" ON "person_duplicate_candidates" USING btree ("tenant_id","person_a_id","person_b_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "authentication_identities" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "provider" varchar(64) NOT NULL,
  "provider_subject" varchar(255) NOT NULL,
  "provider_tenant" varchar(255),
  "email_at_link_time" citext,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "last_authenticated_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "authentication_identities_provider_subject_uidx" ON "authentication_identities" USING btree ("provider","provider_subject");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_invitations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "email" citext NOT NULL,
  "person_id" uuid REFERENCES "persons"("id"),
  "invitation_token_hash" varchar(128) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "invited_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "accepted_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "accepted_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_invitations_token_hash_uidx" ON "user_invitations" USING btree ("invitation_token_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_memberships" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "membership_type" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "start_date" date,
  "end_date" date,
  "is_primary" boolean DEFAULT false NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_memberships_org_person_type_uidx" ON "organization_memberships" USING btree ("organization_id","person_id","membership_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_tenant_access" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "is_default_tenant" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_tenant_access_tenant_user_uidx" ON "user_tenant_access" USING btree ("tenant_id","user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "organization_id" uuid REFERENCES "organizations"("id"),
  "role_template_id" uuid REFERENCES "role_templates"("id"),
  "code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "is_system_managed" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_tenant_org_code_uidx" ON "roles" ("tenant_id", "organization_id", "code") NULLS NOT DISTINCT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" uuid NOT NULL REFERENCES "roles"("id"),
  "permission_id" uuid NOT NULL REFERENCES "permissions"("id"),
  "effect" varchar(16) DEFAULT 'ALLOW' NOT NULL,
  "conditions_json" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_perm_effect_uidx" ON "role_permissions" USING btree ("role_id","permission_id","effect");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_role_assignments" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role_id" uuid NOT NULL REFERENCES "roles"("id"),
  "organization_id" uuid REFERENCES "organizations"("id"),
  "starts_at" timestamptz,
  "expires_at" timestamptz,
  "granted_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  "revoked_by_user_id" uuid REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "authorization_decision_log" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "permission_code" varchar(128) NOT NULL,
  "resource_type" varchar(128) NOT NULL,
  "resource_id" uuid,
  "decision" varchar(32) NOT NULL,
  "reason_code" varchar(128) NOT NULL,
  "context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "correlation_id" varchar(128) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_products" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product_id" uuid NOT NULL REFERENCES "platform_products"("id"),
  "status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
  "enabled_at" timestamptz NOT NULL,
  "disabled_at" timestamptz,
  "configuration_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_products_tenant_product_uidx" ON "tenant_products" USING btree ("tenant_id","product_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_module_entitlements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "module_id" uuid NOT NULL REFERENCES "platform_modules"("id"),
  "status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "source_type" varchar(64) DEFAULT 'MANUAL' NOT NULL,
  "source_id" uuid,
  "quantity_limit" integer,
  "usage_period" varchar(32),
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz,
  "grace_ends_at" timestamptz,
  "configuration_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_module_entitlements_tenant_module_uidx" ON "tenant_module_entitlements" USING btree ("tenant_id","module_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "plan_id" uuid NOT NULL REFERENCES "subscription_plans"("id"),
  "status" varchar(32) DEFAULT 'TRIAL' NOT NULL,
  "billing_provider" varchar(64) DEFAULT 'NONE' NOT NULL,
  "external_subscription_id" varchar(255),
  "starts_at" timestamptz NOT NULL,
  "current_period_start" timestamptz NOT NULL,
  "current_period_end" timestamptz NOT NULL,
  "grace_ends_at" timestamptz,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "canceled_at" timestamptz,
  "suspended_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id"),
  "event_type" varchar(128) NOT NULL,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_overrides" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "organization_id" uuid REFERENCES "organizations"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "feature_definition_id" uuid NOT NULL REFERENCES "feature_definitions"("id"),
  "value_json" jsonb NOT NULL,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "reason" text,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "actor_user_id" uuid REFERENCES "users"("id"),
  "actor_person_id" uuid REFERENCES "persons"("id"),
  "actor_type" varchar(64) NOT NULL,
  "action" varchar(128) NOT NULL,
  "resource_type" varchar(128) NOT NULL,
  "resource_id" uuid,
  "organization_id" uuid REFERENCES "organizations"("id"),
  "result" varchar(32) NOT NULL,
  "risk_level" varchar(32) DEFAULT 'NORMAL' NOT NULL,
  "ip_address" varchar(64),
  "user_agent" text,
  "correlation_id" varchar(128) NOT NULL,
  "request_id" varchar(128) NOT NULL,
  "before_json" jsonb,
  "after_json" jsonb,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_tenant_occurred_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "aggregate_type" varchar(128) NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "event_type" varchar(200) NOT NULL,
  "event_version" integer DEFAULT 1 NOT NULL,
  "payload_json" jsonb NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "correlation_id" varchar(128) NOT NULL,
  "causation_id" varchar(128),
  "status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "available_at" timestamptz NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamptz,
  "published_at" timestamptz,
  "failed_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_pending_poll_idx" ON "outbox_events" USING btree ("status","available_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_delivery_log" (
  "id" uuid PRIMARY KEY NOT NULL,
  "outbox_event_id" uuid NOT NULL REFERENCES "outbox_events"("id"),
  "destination" varchar(255) NOT NULL,
  "attempt_number" integer NOT NULL,
  "status" varchar(32) NOT NULL,
  "response_metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "idempotency_key" varchar(255) NOT NULL,
  "route" varchar(512) NOT NULL,
  "request_fingerprint" varchar(128) NOT NULL,
  "response_status" integer,
  "response_body_json" jsonb,
  "response_reference" varchar(255),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_tenant_key_route_uidx" ON "idempotency_keys" USING btree ("tenant_id","idempotency_key","route");
--> statement-breakpoint
-- RLS: missing tenant context denies (nullif + cast fails closed when setting empty)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'tenant_domains','tenant_settings','tenant_branding','organizations','organization_identifiers',
    'persons','person_sensitive_data','person_identifiers','person_contacts','person_addresses',
    'person_merge_history','person_duplicate_candidates','users','authentication_identities',
    'user_invitations','organization_memberships','user_tenant_access','roles',
    'user_role_assignments','authorization_decision_log','tenant_products','tenant_module_entitlements',
    'subscriptions','subscription_events','idempotency_keys'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenants_tenant_isolation" ON "tenants";
--> statement-breakpoint
CREATE POLICY "tenants_tenant_isolation" ON "tenants"
  USING (
    id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "role_permissions_tenant_isolation" ON "role_permissions";
--> statement-breakpoint
CREATE POLICY "role_permissions_tenant_isolation" ON "role_permissions"
  USING (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_id
        AND r.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = role_id
        AND r.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );
--> statement-breakpoint
ALTER TABLE "feature_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "feature_overrides" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "feature_overrides_tenant_isolation" ON "feature_overrides";
--> statement-breakpoint
CREATE POLICY "feature_overrides_tenant_isolation" ON "feature_overrides"
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
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "audit_events_tenant_isolation" ON "audit_events";
--> statement-breakpoint
CREATE POLICY "audit_events_tenant_isolation" ON "audit_events"
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
--> statement-breakpoint
CREATE POLICY "audit_events_insert" ON "audit_events"
  FOR INSERT
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "outbox_events_tenant_isolation" ON "outbox_events";
--> statement-breakpoint
CREATE POLICY "outbox_events_tenant_isolation" ON "outbox_events"
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
--> statement-breakpoint
ALTER TABLE "event_delivery_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "event_delivery_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "event_delivery_log_tenant_isolation" ON "event_delivery_log";
--> statement-breakpoint
CREATE POLICY "event_delivery_log_tenant_isolation" ON "event_delivery_log"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM outbox_events o
      WHERE o.id = outbox_event_id
        AND (
          o.tenant_id IS NULL
          OR o.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
        )
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM outbox_events o
      WHERE o.id = outbox_event_id
        AND (
          o.tenant_id IS NULL
          OR o.tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
        )
    )
  );
