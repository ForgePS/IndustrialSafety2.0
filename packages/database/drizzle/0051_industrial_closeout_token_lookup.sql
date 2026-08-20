-- 0051_industrial_closeout_token_lookup
-- Public close-out links must resolve a token without an authenticated tenant session.
-- forge_app is subject to FORCE RLS, so lookup goes through a narrow SECURITY DEFINER helper.

CREATE OR REPLACE FUNCTION forge_industrial_closeout_tenant_for_token(p_token_hash text)
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
  FROM industrial_corrective_actions
  WHERE closeout_token_hash = p_token_hash
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_closeout_tenant_for_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_closeout_tenant_for_token(text) TO forge_app;
