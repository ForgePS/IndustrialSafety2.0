-- FORGE-SAAS MK-S9: provider-neutral billing domain (additive).
-- Does not apply a live PSP. Provider webhooks must not bypass entitlements.

-- Extend subscriptions with optional customer / billing type / seats
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_customer_id" uuid,
  ADD COLUMN IF NOT EXISTS "billing_type" varchar(64) NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "seat_quantity" integer;

CREATE TABLE IF NOT EXISTS "billing_customers" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "display_name" varchar(300) NOT NULL,
  "billing_email" varchar(320),
  "billing_provider" varchar(64) NOT NULL DEFAULT 'NONE',
  "external_customer_id" varchar(255),
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "billing_customers_tenant_uidx_unique" UNIQUE ("tenant_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_customers_provider_external_uidx"
  ON "billing_customers" ("billing_provider", "external_customer_id")
  WHERE "external_customer_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "prices" (
  "id" uuid PRIMARY KEY,
  "plan_id" uuid NOT NULL REFERENCES "subscription_plans"("id"),
  "code" varchar(64) NOT NULL,
  "nickname" varchar(200) NOT NULL,
  "interval" varchar(32) NOT NULL,
  "amount_cents" integer,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "billing_type" varchar(64) NOT NULL DEFAULT 'MONTHLY',
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "configuration_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "prices_plan_code_uidx" ON "prices" ("plan_id", "code");

CREATE TABLE IF NOT EXISTS "subscription_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id"),
  "price_id" uuid REFERENCES "prices"("id"),
  "module_code" varchar(64),
  "quantity" integer NOT NULL DEFAULT 1,
  "billing_type" varchar(64) NOT NULL DEFAULT 'MONTHLY',
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscription_items_subscription_idx"
  ON "subscription_items" ("subscription_id");

CREATE TABLE IF NOT EXISTS "billing_contracts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "billing_customer_id" uuid REFERENCES "billing_customers"("id"),
  "name" varchar(300) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "billing_type" varchar(64) NOT NULL DEFAULT 'MANUAL_ENTERPRISE_CONTRACT',
  "starts_on" date,
  "ends_on" date,
  "renewal_on" date,
  "setup_fee_cents" integer,
  "notes" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "billing_contracts_tenant_idx"
  ON "billing_contracts" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "billing_orders" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "billing_customer_id" uuid REFERENCES "billing_customers"("id"),
  "contract_id" uuid REFERENCES "billing_contracts"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "total_cents" integer NOT NULL DEFAULT 0,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "billing_order_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "order_id" uuid NOT NULL REFERENCES "billing_orders"("id"),
  "description" varchar(500) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_amount_cents" integer NOT NULL DEFAULT 0,
  "billing_type" varchar(64) NOT NULL DEFAULT 'ONE_TIME',
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "billing_invoices" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "billing_customer_id" uuid REFERENCES "billing_customers"("id"),
  "subscription_id" uuid REFERENCES "subscriptions"("id"),
  "order_id" uuid REFERENCES "billing_orders"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "amount_due_cents" integer NOT NULL DEFAULT 0,
  "amount_paid_cents" integer NOT NULL DEFAULT 0,
  "external_invoice_id" varchar(255),
  "hosted_invoice_url" text,
  "period_start" timestamptz,
  "period_end" timestamptz,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_external_uidx"
  ON "billing_invoices" ("external_invoice_id")
  WHERE "external_invoice_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "billing_fee_lines" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "contract_id" uuid REFERENCES "billing_contracts"("id"),
  "order_id" uuid REFERENCES "billing_orders"("id"),
  "fee_type" varchar(64) NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "description" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "billing_provider_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "provider" varchar(64) NOT NULL,
  "external_event_id" varchar(255) NOT NULL,
  "event_type" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'RECEIVED',
  "signature_valid" boolean NOT NULL DEFAULT false,
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "processing_error" text,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_provider_events_provider_event_uidx"
  ON "billing_provider_events" ("provider", "external_event_id");

-- FK from subscriptions to billing_customers (after table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billing_customer_fk'
  ) THEN
    ALTER TABLE "subscriptions"
      ADD CONSTRAINT "subscriptions_billing_customer_fk"
      FOREIGN KEY ("billing_customer_id") REFERENCES "billing_customers"("id");
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "billing_customers",
  "prices",
  "subscription_items",
  "billing_contracts",
  "billing_orders",
  "billing_order_items",
  "billing_invoices",
  "billing_fee_lines",
  "billing_provider_events"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_customers',
    'subscription_items',
    'billing_contracts',
    'billing_orders',
    'billing_order_items',
    'billing_invoices',
    'billing_fee_lines'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      $policy$
        CREATE POLICY %I ON %I
          USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
      $policy$,
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END $$;

-- Provider events: tenant may be null at ingest; allow platform processing then attach tenant
ALTER TABLE "billing_provider_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_provider_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_provider_events_tenant_isolation ON billing_provider_events;
CREATE POLICY billing_provider_events_tenant_isolation ON billing_provider_events
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

-- prices are platform catalog (no tenant RLS)
