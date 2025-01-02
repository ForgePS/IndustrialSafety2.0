CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
declare claims jsonb;
user_roles varchar [];
user_permissions text [];
auth_user_id uuid;
begin -- Get user_id from the event
auth_user_id := (event->>'user_id')::uuid;
-- Get the existing claims
claims := event->'claims';
-- Get user's roles
select array_agg(r.role)
from public.users u
  join public.user_roles ur on u.id = ur.user_id
  join public.roles r on ur.role_id = r.id
where u.user_id = auth_user_id into user_roles;
-- Get user permissions
select array_agg(distinct p.permission)
from public.users u
  join public.user_roles ur on u.id = ur.user_id
  join public.role_permissions rp on ur.role_id = rp.role_id
  join public.permissions p on rp.permission_id = p.id
where u.user_id = auth_user_id into user_permissions;
-- Set default values if null
user_roles := coalesce(user_roles, array []::varchar []);
user_permissions := coalesce(user_permissions, array []::text []);
-- Set the claims
claims := claims || jsonb_build_object(
  'roles',
  user_roles,
  'permissions',
  user_permissions
);
-- Return the modified event
return jsonb_set(event, '{claims}', claims);
end;
$function$;
-- Grant necessary permissions
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
create policy "Allow auth admin to read permissions" on "public"."permissions" as permissive for
select to supabase_auth_admin using (true);
create policy "Allow auth admin to read role permissions" on "public"."role_permissions" as permissive for
select to supabase_auth_admin using (true);
create policy "Allow auth admin to read roles" on "public"."roles" as permissive for
select to supabase_auth_admin using (true);
create policy "Allow auth admin to read user roles" on "public"."user_roles" as permissive for
select to supabase_auth_admin using (true);
create policy "Allow auth admin to read all tables" on "public"."users" as permissive for
select to supabase_auth_admin using (true);
