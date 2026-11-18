-- Phase 4B: tenant-agnostic CAD connection public_id lookup (ADR-029 pattern).
-- Used only to resolve tenant context for signed webhook intake.

GRANT SELECT ON "cad_connections" TO forge_identity_lookup;

DROP POLICY IF EXISTS "cad_connections_identity_lookup" ON "cad_connections";
CREATE POLICY "cad_connections_identity_lookup" ON "cad_connections"
  FOR SELECT TO forge_identity_lookup
  USING (true);

CREATE OR REPLACE FUNCTION forge_lookup_cad_connection(p_public_id text)
RETURNS TABLE (
  connection_id uuid,
  tenant_id uuid,
  adapter_key text,
  adapter_version text,
  environment text,
  transport_type text,
  status text,
  intake_mode text,
  configuration_json jsonb,
  mapping_profile_id uuid,
  credentials_secret_arn text,
  webhook_secret_arn text,
  webhook_key_id text,
  health_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.tenant_id,
    c.adapter_key,
    c.adapter_version,
    c.environment,
    c.transport_type,
    c.status,
    c.intake_mode,
    c.configuration_json,
    c.mapping_profile_id,
    c.credentials_secret_arn,
    c.webhook_secret_arn,
    c.webhook_key_id,
    c.health_status
  FROM cad_connections c
  WHERE c.public_id = p_public_id
    AND c.archived_at IS NULL
  LIMIT 1;
$$;

ALTER FUNCTION forge_lookup_cad_connection(text) OWNER TO forge_identity_lookup;
GRANT EXECUTE ON FUNCTION forge_lookup_cad_connection(text) TO forge_app;
