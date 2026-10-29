-- 0054_industrial_fleet_dvir_public_token
-- Reusable public DVIR QR tokens are scoped to a fleet vehicle (sticker on the unit).
-- forge_app is subject to FORCE RLS, so tenant lookup goes through a narrow SECURITY DEFINER helper.

ALTER TABLE "industrial_fleet_vehicles"
  ADD COLUMN IF NOT EXISTS "dvir_public_token_hash" varchar(128),
  ADD COLUMN IF NOT EXISTS "dvir_public_token_issued_at" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_fleet_vehicles_dvir_token_uidx"
  ON "industrial_fleet_vehicles" ("dvir_public_token_hash")
  WHERE "dvir_public_token_hash" IS NOT NULL;

CREATE OR REPLACE FUNCTION forge_industrial_dvir_tenant_for_token(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_fleet_vehicles
  WHERE dvir_public_token_hash = p_token_hash
    AND archived_at IS NULL
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_dvir_tenant_for_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_dvir_tenant_for_token(text) TO forge_app;
