-- 0082_industrial_supply_request_qr_s1
-- Site-specific Safety Supply Request QR foundation: request fields, events, requestable items.

ALTER TABLE "industrial_supply_items"
  ADD COLUMN IF NOT EXISTS "allow_qr_requests" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "approval_required" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "max_quantity_per_request" numeric(14, 4);

ALTER TABLE "industrial_supply_requests"
  ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "industrial_sites"("id"),
  ADD COLUMN IF NOT EXISTS "qr_link_id" uuid REFERENCES "qr_links"("id"),
  ADD COLUMN IF NOT EXISTS "source" varchar(64) NOT NULL DEFAULT 'ADMIN_CREATED',
  ADD COLUMN IF NOT EXISTS "requestor_type" varchar(64) NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN IF NOT EXISTS "contractor_name" varchar(200),
  ADD COLUMN IF NOT EXISTS "contractor_company" varchar(200),
  ADD COLUMN IF NOT EXISTS "contractor_phone" varchar(64),
  ADD COLUMN IF NOT EXISTS "contractor_email" varchar(320),
  ADD COLUMN IF NOT EXISTS "work_area" varchar(200),
  ADD COLUMN IF NOT EXISTS "priority" varchar(64) NOT NULL DEFAULT 'ROUTINE',
  ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "public_status_token_hash" varchar(128),
  ADD COLUMN IF NOT EXISTS "employee_message" text,
  ADD COLUMN IF NOT EXISTS "internal_notes" text,
  ADD COLUMN IF NOT EXISTS "denial_reason" text,
  ADD COLUMN IF NOT EXISTS "review_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ready_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "fulfilled_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "denied_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamptz;

CREATE INDEX IF NOT EXISTS "industrial_supply_requests_tenant_site_idx"
  ON "industrial_supply_requests" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_requests_tenant_qr_idx"
  ON "industrial_supply_requests" ("tenant_id", "qr_link_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_requests_tenant_priority_idx"
  ON "industrial_supply_requests" ("tenant_id", "priority");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_requests_public_status_uidx"
  ON "industrial_supply_requests" ("public_status_token_hash")
  WHERE "public_status_token_hash" IS NOT NULL;

ALTER TABLE "industrial_supply_request_items"
  ALTER COLUMN "item_id" DROP NOT NULL;

ALTER TABLE "industrial_supply_request_items"
  ADD COLUMN IF NOT EXISTS "status" varchar(64) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "quantity_approved" numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quantity_backordered" numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "custom_item" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "custom_item_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "custom_item_description" text,
  ADD COLUMN IF NOT EXISTS "denial_reason" text,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "backorder_reason" text,
  ADD COLUMN IF NOT EXISTS "expected_availability_date" date,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS "industrial_supply_request_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL REFERENCES "industrial_supply_requests"("id"),
  "event_type" varchar(64) NOT NULL,
  "previous_status" varchar(64),
  "new_status" varchar(64),
  "user_id" uuid,
  "personnel_id" uuid,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "industrial_supply_request_events_request_idx"
  ON "industrial_supply_request_events" ("tenant_id", "request_id", "created_at");
