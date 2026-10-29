-- 0093_industrial_printer_bridge_tenant_lookup
-- forge_app is subject to FORCE RLS on printer-bridge tables, so public bridge
-- pairing/auth resolves tenant via narrow SECURITY DEFINER helpers (same pattern
-- as DVIR / QR / training public tokens).

CREATE OR REPLACE FUNCTION forge_industrial_printer_bridge_tenant_for_pairing_code(p_code_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_code_hash IS NULL OR length(p_code_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_bridge_pairing_codes
  WHERE code_hash = p_code_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_printer_bridge_tenant_for_pairing_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_printer_bridge_tenant_for_pairing_code(text) TO forge_app;

CREATE OR REPLACE FUNCTION forge_industrial_printer_bridge_tenant_for_device_token(
  p_device_id text,
  p_token_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_device_id IS NULL OR length(trim(p_device_id)) < 1 THEN
    RETURN NULL;
  END IF;
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_printer_bridges
  WHERE device_id = p_device_id
    AND access_token_hash = p_token_hash
    AND enabled = true
    AND status <> 'DISABLED'
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_printer_bridge_tenant_for_device_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_printer_bridge_tenant_for_device_token(text, text) TO forge_app;
