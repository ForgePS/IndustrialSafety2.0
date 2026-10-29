-- Allow forge_app SELECT across tenants when bypass GUC is on (reporting schedule sweep).
-- user_tenant_memberships may already honor bypass via 0037; refresh for environments that missed it.
DROP POLICY IF EXISTS report_schedules_tenant_isolation ON report_schedules;
CREATE POLICY report_schedules_tenant_isolation ON report_schedules
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

DROP POLICY IF EXISTS user_tenant_memberships_tenant_isolation ON user_tenant_memberships;
CREATE POLICY user_tenant_memberships_tenant_isolation ON user_tenant_memberships
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
