-- 0108_helpdesk_foundation_s1
-- Forge Help Desk foundation: tickets, messages, attachments, timeline events, tags,
-- watchers, configurable categories, ticket numbering, and helpdesk permissions.
-- Tickets live in the customer tenant. Forge support staff list across tenants via
-- app.bypass_rls (platform admins only, enforced in the API).

CREATE TABLE IF NOT EXISTS "support_ticket_sequences" (
  "year" integer PRIMARY KEY,
  "last_value" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON "support_ticket_sequences" TO forge_app;

CREATE TABLE IF NOT EXISTS "support_categories" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "product_code" varchar(64),
  "kind" varchar(32) NOT NULL,
  "code" varchar(80) NOT NULL,
  "label" varchar(200) NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_categories_kind_idx" ON "support_categories" ("kind", "product_code");
CREATE UNIQUE INDEX IF NOT EXISTS "support_categories_scope_code_uidx" ON "support_categories" (
  "kind",
  "code",
  coalesce("product_code", ''),
  coalesce("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product_code" varchar(64) NOT NULL DEFAULT 'FORGE_INDUSTRIAL',
  "module_code" varchar(80),
  "ticket_number" varchar(32) NOT NULL,
  "requester_user_id" uuid REFERENCES "users"("id"),
  "requester_name" varchar(200) NOT NULL,
  "requester_email" varchar(320),
  "request_type" varchar(64) NOT NULL,
  "product_area" varchar(80),
  "category_id" uuid,
  "subject" varchar(300) NOT NULL,
  "description" text NOT NULL,
  "customer_reported_severity" varchar(16),
  "priority" varchar(16) NOT NULL DEFAULT 'P3_NORMAL',
  "status" varchar(32) NOT NULL DEFAULT 'NEW',
  "disposition" varchar(40),
  "assigned_team" varchar(80),
  "assigned_user_id" uuid REFERENCES "users"("id"),
  "assigned_user_name" varchar(200),
  "source" varchar(32) NOT NULL DEFAULT 'WEB',
  "location_id" uuid,
  "division_id" uuid,
  "related_entity_type" varchar(80),
  "related_entity_id" uuid,
  "technical_context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ask_forge_context" jsonb,
  "client_request_id" varchar(120),
  "merged_into_ticket_id" uuid REFERENCES "support_tickets"("id"),
  "first_response_at" timestamptz,
  "last_customer_activity_at" timestamptz,
  "last_support_activity_at" timestamptz,
  "resolved_at" timestamptz,
  "closed_at" timestamptz,
  "reopened_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "support_tickets_status_chk" CHECK ("status" IN (
    'NEW', 'TRIAGE', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER',
    'WAITING_ON_FORGE', 'RESOLVED', 'CLOSED', 'REOPENED'
  )),
  CONSTRAINT "support_tickets_priority_chk" CHECK ("priority" IN ('P1_CRITICAL', 'P2_HIGH', 'P3_NORMAL', 'P4_LOW'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_number_uidx" ON "support_tickets" ("ticket_number");
CREATE INDEX IF NOT EXISTS "support_tickets_tenant_status_idx" ON "support_tickets" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "support_tickets_requester_idx"
  ON "support_tickets" ("tenant_id", "requester_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "support_tickets_status_priority_idx" ON "support_tickets" ("status", "priority");
CREATE INDEX IF NOT EXISTS "support_tickets_assignee_idx" ON "support_tickets" ("assigned_user_id", "status");
CREATE INDEX IF NOT EXISTS "support_tickets_created_idx" ON "support_tickets" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_client_request_uidx"
  ON "support_tickets" ("tenant_id", "requester_user_id", "client_request_id")
  WHERE "client_request_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "support_tickets_search_idx" ON "support_tickets"
  USING gin (to_tsvector('simple', coalesce("subject", '') || ' ' || coalesce("description", '')));

CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id"),
  "author_user_id" uuid REFERENCES "users"("id"),
  "author_name" varchar(200) NOT NULL,
  "author_type" varchar(16) NOT NULL,
  "message_type" varchar(32) NOT NULL,
  "body" text NOT NULL,
  "is_internal" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  CONSTRAINT "support_ticket_messages_internal_chk" CHECK (
    ("message_type" IN ('INTERNAL_NOTE', 'AI_DRAFT') AND "is_internal")
    OR ("message_type" = 'CUSTOMER_MESSAGE' AND NOT "is_internal")
    OR "message_type" IN ('SUPPORT_REPLY', 'SYSTEM_EVENT')
  ),
  CONSTRAINT "support_ticket_messages_support_reply_chk" CHECK (
    "message_type" <> 'SUPPORT_REPLY' OR NOT "is_internal"
  )
);
CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_idx"
  ON "support_ticket_messages" ("ticket_id", "created_at");

CREATE TABLE IF NOT EXISTS "support_ticket_attachments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id"),
  "message_id" uuid REFERENCES "support_ticket_messages"("id"),
  "document_id" uuid NOT NULL REFERENCES "forge_documents"("id"),
  "original_filename" varchar(500) NOT NULL,
  "mime_type" varchar(255) NOT NULL,
  "size_bytes" integer NOT NULL,
  "is_internal" boolean NOT NULL DEFAULT false,
  "status" varchar(16) NOT NULL DEFAULT 'PENDING',
  "uploaded_by_user_id" uuid REFERENCES "users"("id"),
  "uploaded_by_name" varchar(200),
  "uploaded_by_type" varchar(16) NOT NULL DEFAULT 'CUSTOMER',
  "uploaded_at" timestamptz,
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_ticket_attachments_ticket_idx" ON "support_ticket_attachments" ("ticket_id");

CREATE TABLE IF NOT EXISTS "support_ticket_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id"),
  "event_type" varchar(48) NOT NULL,
  "from_value" varchar(200),
  "to_value" varchar(200),
  "is_internal" boolean NOT NULL DEFAULT false,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "actor_name" varchar(200),
  "actor_type" varchar(16) NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_ticket_events_ticket_idx" ON "support_ticket_events" ("ticket_id", "created_at");

CREATE TABLE IF NOT EXISTS "support_tags" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "slug" varchar(80) NOT NULL,
  "label" varchar(80) NOT NULL,
  "description" text,
  "color" varchar(16),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "support_tags_slug_idx" ON "support_tags" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "support_tags_scope_slug_uidx" ON "support_tags" (
  "slug",
  coalesce("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE TABLE IF NOT EXISTS "support_ticket_tags" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id"),
  "tag_id" uuid NOT NULL REFERENCES "support_tags"("id"),
  "added_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("ticket_id", "tag_id")
);
CREATE INDEX IF NOT EXISTS "support_ticket_tags_tag_idx" ON "support_ticket_tags" ("tag_id");

CREATE TABLE IF NOT EXISTS "support_ticket_watchers" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "support_tickets"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "user_name" varchar(200) NOT NULL,
  "added_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("ticket_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "support_ticket_watchers_user_idx" ON "support_ticket_watchers" ("user_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "support_categories" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "support_tickets" TO forge_app;
GRANT SELECT, INSERT, UPDATE ON "support_ticket_messages" TO forge_app;
GRANT SELECT, INSERT, UPDATE ON "support_ticket_attachments" TO forge_app;
GRANT SELECT, INSERT ON "support_ticket_events" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "support_tags" TO forge_app;
GRANT SELECT, INSERT, DELETE ON "support_ticket_tags" TO forge_app;
GRANT SELECT, INSERT, DELETE ON "support_ticket_watchers" TO forge_app;

-- Tenant-owned rows: own tenant, or platform bypass for Forge support listing.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'support_tickets',
    'support_ticket_messages',
    'support_ticket_attachments',
    'support_ticket_events',
    'support_ticket_tags',
    'support_ticket_watchers'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ('
      || 'tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid '
      || 'OR current_setting(''app.bypass_rls'', true) = ''on'') '
      || 'WITH CHECK ('
      || 'tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid '
      || 'OR current_setting(''app.bypass_rls'', true) = ''on'')',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

-- Global (tenant_id NULL) plus tenant-specific configuration rows.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_categories', 'support_tags'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ('
      || 'tenant_id IS NULL '
      || 'OR tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid '
      || 'OR current_setting(''app.bypass_rls'', true) = ''on'') '
      || 'WITH CHECK ('
      || 'tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid '
      || 'OR current_setting(''app.bypass_rls'', true) = ''on'')',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

-- Starter request types (all products) and Forge Industrial Safety product areas.
INSERT INTO "support_categories" ("id", "tenant_id", "product_code", "kind", "code", "label", "sort_order")
SELECT gen_random_uuid(), NULL, v.product_code, v.kind, v.code, v.label, v.sort_order
FROM (VALUES
  (NULL, 'REQUEST_TYPE', 'TECHNICAL_ISSUE', 'Technical Issue', 10),
  (NULL, 'REQUEST_TYPE', 'HOW_DO_I', 'How Do I...?', 20),
  (NULL, 'REQUEST_TYPE', 'ACCOUNT_LOGIN', 'Account / Login', 30),
  (NULL, 'REQUEST_TYPE', 'PERMISSIONS', 'Permissions', 40),
  (NULL, 'REQUEST_TYPE', 'FEATURE_REQUEST', 'Feature Request', 50),
  (NULL, 'REQUEST_TYPE', 'DATA_ISSUE', 'Data Issue', 60),
  (NULL, 'REQUEST_TYPE', 'INTEGRATION_ISSUE', 'Integration Issue', 70),
  (NULL, 'REQUEST_TYPE', 'MOBILE_APP_ISSUE', 'Mobile App Issue', 80),
  (NULL, 'REQUEST_TYPE', 'BILLING_SUBSCRIPTION', 'Billing / Subscription', 90),
  (NULL, 'REQUEST_TYPE', 'TRAINING_REQUEST', 'Training Request', 100),
  (NULL, 'REQUEST_TYPE', 'REPORT_PROBLEM', 'Report Problem', 110),
  (NULL, 'REQUEST_TYPE', 'OTHER', 'Other', 120),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'DASHBOARD', 'Dashboard', 10),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'PERSONNEL', 'Personnel', 20),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'TRAINING', 'Training', 30),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'INCIDENTS', 'Incidents', 40),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'CLAIMS', 'Claims', 50),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'INSPECTIONS', 'Inspections', 60),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'CORRECTIVE_ACTIONS', 'Corrective Actions', 70),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'OBSERVATIONS', 'Observations', 80),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'RISK_REGISTER', 'Risk Register', 90),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'JSA_JHA', 'JSA / JHA', 100),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'LOTO', 'LOTO', 110),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'PERMITS', 'Permits', 120),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'EQUIPMENT_ASSETS', 'Equipment / Assets', 130),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'QR_CODES', 'QR Codes', 140),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'CONTRACTORS', 'Contractors', 150),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'EMERGENCY_MANAGEMENT', 'Emergency Management', 160),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'DOT_COMPLIANCE', 'DOT Compliance', 170),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'OSHA_REPORTING', 'OSHA Reporting', 180),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'REPORTS_ANALYTICS', 'Reports / Analytics', 190),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'ASK_FORGE', 'Ask Forge', 200),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'ADMINISTRATION', 'Administration', 210),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'INTEGRATIONS', 'Integrations', 220),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'MOBILE_FIELD', 'Mobile / Field Version', 230),
  ('FORGE_INDUSTRIAL', 'PRODUCT_AREA', 'OTHER', 'Other', 240)
) AS v(product_code, kind, code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "support_categories" c
  WHERE c."tenant_id" IS NULL AND c."kind" = v.kind AND c."code" = v.code
    AND coalesce(c."product_code", '') = coalesce(v.product_code, '')
);

INSERT INTO "support_tags" ("id", "tenant_id", "slug", "label")
SELECT gen_random_uuid(), NULL, v.slug, v.label
FROM (VALUES
  ('bug', 'bug'),
  ('feature-request', 'feature-request'),
  ('login', 'login'),
  ('permissions', 'permissions'),
  ('inspection', 'inspection'),
  ('mobile', 'mobile'),
  ('data', 'data'),
  ('integration', 'integration'),
  ('critical-client', 'critical-client'),
  ('known-issue', 'known-issue'),
  ('training', 'training'),
  ('billing', 'billing')
) AS v(slug, label)
WHERE NOT EXISTS (SELECT 1 FROM "support_tags" t WHERE t."tenant_id" IS NULL AND t."slug" = v.slug);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('helpdesk.ticket.create', 'Submit support tickets', 'Submit Help Desk tickets to Forge support', 'NORMAL', false),
  ('helpdesk.ticket.view_own', 'View own support tickets', 'View support tickets you submitted', 'NORMAL', false),
  ('helpdesk.ticket.view_location', 'View location support tickets', 'View support tickets for your locations', 'NORMAL', false),
  ('helpdesk.ticket.view_tenant', 'View company support tickets', 'View every support ticket submitted by your company', 'ELEVATED', false),
  ('helpdesk.ticket.comment', 'Reply on support tickets', 'Reply to Forge support on tickets you can view', 'NORMAL', false),
  ('helpdesk.ticket.reopen', 'Reopen support tickets', 'Reopen resolved or closed support tickets', 'NORMAL', false),
  ('helpdesk.ticket.close', 'Close support tickets', 'Close support tickets you can view', 'NORMAL', false),
  ('helpdesk.knowledge.view', 'View help articles', 'Read Help Center knowledge-base articles', 'NORMAL', false),
  ('helpdesk.status.view', 'View service status', 'View Forge service status and announcements', 'NORMAL', false),
  ('helpdesk.support.view', 'Support console', 'View the Forge support console and ticket queues', 'ELEVATED', true),
  ('helpdesk.support.assign', 'Assign support tickets', 'Assign and reassign support tickets', 'ELEVATED', true),
  ('helpdesk.support.respond', 'Respond to customers', 'Send customer-visible support replies', 'ELEVATED', true),
  ('helpdesk.support.internal_note', 'Internal support notes', 'Add internal-only notes to support tickets', 'ELEVATED', true),
  ('helpdesk.support.change_priority', 'Change ticket priority', 'Change Forge priority on support tickets', 'ELEVATED', true),
  ('helpdesk.support.change_status', 'Change ticket status', 'Move support tickets through the workflow', 'ELEVATED', true),
  ('helpdesk.support.merge', 'Merge support tickets', 'Merge duplicate support tickets', 'ELEVATED', true),
  ('helpdesk.support.escalate', 'Escalate support tickets', 'Escalate support tickets', 'ELEVATED', true),
  ('helpdesk.support.link_incident', 'Link platform incidents', 'Link support tickets to platform incidents', 'ELEVATED', true),
  ('helpdesk.support.link_development', 'Link development issues', 'Link support tickets to development issues', 'ELEVATED', true),
  ('helpdesk.support.manage_watchers', 'Manage ticket watchers', 'Add and remove support ticket watchers and tags', 'ELEVATED', true),
  ('helpdesk.admin.manage', 'Manage Help Desk', 'Manage Help Desk configuration', 'ELEVATED', true),
  ('helpdesk.admin.sla', 'Manage support SLAs', 'Configure Help Desk SLA policies', 'ELEVATED', true),
  ('helpdesk.admin.categories', 'Manage support categories', 'Configure request types and product areas', 'ELEVATED', true),
  ('helpdesk.admin.templates', 'Manage saved replies', 'Configure support saved replies', 'ELEVATED', true),
  ('helpdesk.admin.tags', 'Manage support tags', 'Configure support tags', 'ELEVATED', true),
  ('helpdesk.admin.status', 'Manage service status', 'Update service component status', 'ELEVATED', true),
  ('helpdesk.admin.announcements', 'Manage announcements', 'Publish Help Desk announcements', 'ELEVATED', true),
  ('helpdesk.admin.incidents', 'Manage platform incidents', 'Create and manage platform incidents', 'ELEVATED', true),
  ('helpdesk.knowledge.create', 'Create help articles', 'Draft knowledge-base articles', 'ELEVATED', false),
  ('helpdesk.knowledge.edit', 'Edit help articles', 'Edit knowledge-base articles', 'ELEVATED', false),
  ('helpdesk.knowledge.review', 'Review help articles', 'Review knowledge-base articles', 'ELEVATED', false),
  ('helpdesk.knowledge.publish', 'Publish help articles', 'Publish knowledge-base articles', 'ELEVATED', false),
  ('helpdesk.knowledge.archive', 'Archive help articles', 'Archive knowledge-base articles', 'ELEVATED', false),
  ('helpdesk.analytics.view', 'View support analytics', 'View Help Desk analytics', 'ELEVATED', true),
  ('helpdesk.analytics.export', 'Export support analytics', 'Export Help Desk analytics', 'ELEVATED', true)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

-- Every existing role can submit, follow, reply to, reopen, and close its own tickets.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN (
  'helpdesk.ticket.create',
  'helpdesk.ticket.view_own',
  'helpdesk.ticket.comment',
  'helpdesk.ticket.reopen',
  'helpdesk.ticket.close',
  'helpdesk.knowledge.view',
  'helpdesk.status.view'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = r."id" AND existing."permission_id" = p."id"
);

INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT rt."id", p."id"
FROM "role_templates" rt
JOIN "permissions" p ON p."code" IN (
  'helpdesk.ticket.create',
  'helpdesk.ticket.view_own',
  'helpdesk.ticket.comment',
  'helpdesk.ticket.reopen',
  'helpdesk.ticket.close',
  'helpdesk.knowledge.view',
  'helpdesk.status.view'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rt."id" AND existing."permission_id" = p."id"
);

-- Company admins can see every ticket their company submitted.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" = 'helpdesk.ticket.view_tenant'
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);

INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT DISTINCT rtp."role_template_id", p."id"
FROM "role_template_permissions" rtp
JOIN "permissions" admin_p ON admin_p."id" = rtp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" = 'helpdesk.ticket.view_tenant'
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id" AND existing."permission_id" = p."id"
);
