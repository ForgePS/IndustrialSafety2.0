-- 0096_industrial_printer_bridge_s3
-- Forge Printer Bridge Phase 3: batch fields, printer health, profile failover.

ALTER TABLE "industrial_printer_profiles"
  ADD COLUMN IF NOT EXISTS "fallback_printer_id" uuid REFERENCES "industrial_printers"("id") ON DELETE SET NULL;

ALTER TABLE "industrial_print_batches"
  ADD COLUMN IF NOT EXISTS "name" varchar(300),
  ADD COLUMN IF NOT EXISTS "stop_on_fail" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "print_mode" varchar(64) NOT NULL DEFAULT 'BRIDGE',
  ADD COLUMN IF NOT EXISTS "media_profile_id" uuid REFERENCES "industrial_printer_media_profiles"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "copies_per_item" integer NOT NULL DEFAULT 1;

ALTER TABLE "industrial_printers"
  ADD COLUMN IF NOT EXISTS "ribbon_ok" boolean,
  ADD COLUMN IF NOT EXISTS "media_ok" boolean,
  ADD COLUMN IF NOT EXISTS "battery_percent" integer,
  ADD COLUMN IF NOT EXISTS "supply_name" varchar(200),
  ADD COLUMN IF NOT EXISTS "last_health_at" timestamptz;
