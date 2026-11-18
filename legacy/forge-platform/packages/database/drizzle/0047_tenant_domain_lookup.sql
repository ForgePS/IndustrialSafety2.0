-- Public login branding: resolve tenant by verified vanity host (ADR-029).
-- Anonymous pre-auth requests cannot set tenant GUC; lookup is SECURITY DEFINER.

GRANT SELECT ON "tenant_domains" TO forge_identity_lookup;

DROP POLICY IF EXISTS "tenant_domains_identity_lookup" ON "tenant_domains";
CREATE POLICY "tenant_domains_identity_lookup" ON "tenant_domains"
  FOR SELECT TO forge_identity_lookup
  USING (true);

CREATE OR REPLACE FUNCTION forge_lookup_tenant_domain(p_domain text)
RETURNS TABLE (
  domain_id uuid,
  tenant_id uuid,
  domain text,
  domain_type text,
  verification_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id,
    d.tenant_id,
    d.domain,
    d.domain_type,
    d.verification_status
  FROM tenant_domains d
  WHERE lower(d.domain) = lower(p_domain)
    AND d.verification_status = 'VERIFIED'
  LIMIT 1;
$$;

ALTER FUNCTION forge_lookup_tenant_domain(text) OWNER TO forge_identity_lookup;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['forge_app', 'forge_admin']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION forge_lookup_tenant_domain(text) TO %I', r);
    END IF;
  END LOOP;
END
$$;
