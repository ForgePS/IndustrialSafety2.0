-- MODULE-CATALOG-S2: platform-aware module metadata
ALTER TABLE "platform_modules"
  ADD COLUMN IF NOT EXISTS "category" varchar(128) NOT NULL DEFAULT 'General';
--> statement-breakpoint
ALTER TABLE "platform_modules"
  ADD COLUMN IF NOT EXISTS "classification" varchar(64) NOT NULL DEFAULT 'CUSTOMER_MODULE';
--> statement-breakpoint
ALTER TABLE "platform_modules"
  ADD COLUMN IF NOT EXISTS "implementation_status" varchar(64) NOT NULL DEFAULT 'READY';
--> statement-breakpoint
ALTER TABLE "platform_modules"
  ADD COLUMN IF NOT EXISTS "customer_assignable" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "platform_modules"
  ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 100;
--> statement-breakpoint
UPDATE "platform_modules"
SET
  "classification" = 'PLATFORM_CORE',
  "customer_assignable" = false,
  "category" = 'Platform'
WHERE "is_core" = true OR "code" = 'CORE';
--> statement-breakpoint
UPDATE "platform_modules" pm
SET
  "classification" = 'INTERNAL_TOOL',
  "customer_assignable" = false,
  "category" = 'Internal'
FROM "platform_products" pp
WHERE pm."product_id" = pp."id"
  AND pp."code" = 'FORGE_CREATOR'
  AND pm."code" = 'TENANT_ADMIN';
