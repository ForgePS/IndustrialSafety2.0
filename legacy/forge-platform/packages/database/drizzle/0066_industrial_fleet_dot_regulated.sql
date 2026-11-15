-- 0066_industrial_fleet_dot_regulated
-- Assets can be marked DOT-regulated (requires DVIR). Non-commercial units stay off.

ALTER TABLE "industrial_fleet_vehicles"
  ADD COLUMN IF NOT EXISTS "dot_regulated" boolean NOT NULL DEFAULT false;

-- Preserve existing DVIR workflow for units that already have a public QR sticker.
UPDATE "industrial_fleet_vehicles"
SET "dot_regulated" = true
WHERE "dvir_public_token_hash" IS NOT NULL
  AND "dot_regulated" = false;
