-- Close direct client access to public-schema functions.
--
-- Supabase's default privileges grant EXECUTE on every new function in `public` to `anon` and
-- `authenticated` (and PostgreSQL grants it to PUBLIC). Most Forge migrations only revoked from
-- PUBLIC, or nothing, so ~90 SECURITY DEFINER RPCs with no auth.uid()/role guard - Help Desk
-- analytics, CAPA/risk/JSA lifecycle transitions, support ticket writes that trust a
-- caller-supplied p_actor_user_id - were callable by anyone holding the public anon key through
-- PostgREST /rest/v1/rpc/*. The app calls all of these through createServiceRoleClient() and does
-- authorization in app code, so no client needs them.
--
-- After this migration:
--   * RLS helper functions referenced by `to authenticated` policies stay executable by
--     `authenticated` (and service_role); anon and PUBLIC lose them. Revoking them from
--     `authenticated` would turn RLS-filtered reads into permission errors.
--   * custom_access_token_hook is executable by supabase_auth_admin (the Auth server) only.
--     It previously ran through the PUBLIC grant.
--   * Every other function in `public` is executable by its owner and service_role only.
--   * New functions created by `postgres` start closed: a migration that adds a function a
--     client must call has to grant it explicitly.
--
-- Not touched here: match_forge_ai_knowledge / search_forge_ai_knowledge_text (owned by the AI
-- knowledge migrations) and functions that belong to an extension.

do $$
declare
  v_policy_helpers constant text[] := array[
    'admin_only',
    'can_manage_role',
    'can_perform_user_action',
    'can_update_permission',
    'can_update_user',
    'can_view_user',
    'get_user_hierarchy',
    'get_user_id_from_auth',
    'has_org_role',
    'has_permission',
    'is_org_member'
  ];
  v_auth_hooks constant text[] := array['custom_access_token_hook'];
  v_untouched constant text[] := array['match_forge_ai_knowledge', 'search_forge_ai_knowledge_text'];
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as signature, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind in ('f', 'p')
      and not (p.proname = any (v_untouched))
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    if v_fn.proname = any (v_policy_helpers) then
      execute format('revoke execute on function %s from public, anon', v_fn.signature);
      execute format('grant execute on function %s to authenticated, service_role', v_fn.signature);
    elsif v_fn.proname = any (v_auth_hooks) then
      execute format('revoke execute on function %s from public, anon, authenticated', v_fn.signature);
      execute format('grant execute on function %s to supabase_auth_admin, service_role', v_fn.signature);
    else
      execute format('revoke execute on function %s from public, anon, authenticated', v_fn.signature);
      execute format('grant execute on function %s to service_role', v_fn.signature);
    end if;
  end loop;
end
$$;

-- Future functions created by postgres (the migration role) start closed. Per-schema default
-- privileges can only add to the global ones, so the PUBLIC grant is revoked globally for postgres;
-- the anon/authenticated grants come from Supabase's per-schema entry for `public`.
-- service_role keeps its per-schema default grant. supabase_admin's defaults are left alone.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
