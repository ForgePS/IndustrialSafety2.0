-- =============================================================================
-- Credit the seeded plant records to the plant's own manager.
-- Module seed files may only use real logins in user columns, so approvals, reviews and
-- "created by" on demo records were recorded as the local admin account ("Forge 2.0 Local
-- Admin"). In a demo those should read as Denise Carter (Plant Manager, the sales-demo login
-- from 15_sales_demo_owner.sql).
--
-- Scope: only rows of the demo tenant whose id is in the demo-plant id namespaces
-- (6x000000-0000-4000-8000-...), and only columns that reference auth.users. Rows from
-- seed.sql that tests rely on are untouched. Triggers are disabled for this pass so
-- closed-record locks and audit triggers do not fire on a seed-only correction.
-- =============================================================================

set session_replication_role = replica;

do $$
declare
  c record;
  v_admin constant uuid := '20000000-0000-4000-8000-000000000001';
  v_denise constant uuid := '61000000-0000-4000-8000-000000000001';
  v_org constant uuid := '20000000-0000-4000-8000-000000000100';
  v_rows bigint;
  v_total bigint := 0;
begin
  for c in
    -- pg_catalog, not information_schema: auth.users belongs to another role, so its
    -- constraint usage is hidden from information_schema.
    select rel.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.connamespace = 'public'::regnamespace
      and con.confrelid = 'auth.users'::regclass
      and array_length(con.conkey, 1) = 1
      -- Only tenant tables with a uuid id we can scope to the demo namespaces.
      and exists (select 1 from pg_attribute a where a.attrelid = rel.oid and a.attname = 'organization_id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid = rel.oid and a.attname = 'id' and a.atttypid = 'uuid'::regtype and not a.attisdropped)
      -- Membership/role/access rows define who can log in; never rewrite those.
      and rel.relname not in ('organization_memberships', 'forge_tenant_user_roles', 'forge_tenant_user_location_access',
                              'forge_platform_users', 'forge_support_team_members')
  loop
    execute format(
      'update public.%I set %I = $1 where %I = $2 and organization_id = $3 and id::text ~ ''^6[0-9]000000-0000-4000-8000-''',
      c.table_name, c.column_name, c.column_name
    ) using v_denise, v_admin, v_org;
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  raise notice 'Demo attribution: % user references moved from the local admin to Denise Carter', v_total;
end $$;

set session_replication_role = origin;
