drop policy "Allow auth admin to read all tables" on "public"."users";
drop policy "Allow authenticated to add (insert) users" on "public"."users";
drop policy "Allow authenticated to read (select) users" on "public"."users";
drop policy "Allow authenticated to update users" on "public"."users";
alter table "public"."roles"
add column "hierarchy" smallint not null default 999;
alter table "public"."roles"
add constraint "roles_hierarchy_check" CHECK ((hierarchy > 0)) not valid;
alter table "public"."roles" validate constraint "roles_hierarchy_check";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.can_manage_user(auth_uid uuid, target_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
SELECT CASE
    -- Users can always manage themselves
    WHEN auth_uid = target_user_id THEN true -- Otherwise check hierarchy
    ELSE (
      SELECT get_user_higher_hierarchy(auth_uid) < get_user_higher_hierarchy(target_user_id)
    )
  END;
$function$;
CREATE OR REPLACE FUNCTION public.can_perform_user_action(auth_uid uuid, target_user_id bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE requesting_user_id bigint;
requesting_hierarchy smallint;
target_hierarchy smallint;
target_roles text [];
requesting_roles text [];
BEGIN -- Get the requesting user's internal ID
requesting_user_id := get_user_id_from_auth(auth_uid);
-- Users cannot perform actions on themselves
IF requesting_user_id = target_user_id THEN RAISE EXCEPTION 'You cannot perform actions on yourself';
END IF;
-- Get hierarchies
requesting_hierarchy := get_user_hierarchy(requesting_user_id);
target_hierarchy := get_user_hierarchy(target_user_id);
-- Get roles
SELECT ARRAY_AGG(r.role) INTO requesting_roles
FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = requesting_user_id;
SELECT ARRAY_AGG(r.role) INTO target_roles
FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = target_user_id;
-- Check if target has same role as requester
IF requesting_roles && target_roles THEN RAISE EXCEPTION 'You cannot perform actions on users with the same role';
END IF;
-- Check hierarchy levels
IF requesting_hierarchy >= target_hierarchy THEN RAISE EXCEPTION 'You can only perform actions on users with lower hierarchy level';
END IF;
RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION public.can_update_user(auth_uid uuid, target_user_id bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE requesting_user_id bigint;
BEGIN -- Get the requesting user's internal ID
requesting_user_id := get_user_id_from_auth(auth_uid);
-- Users can always update themselves
IF requesting_user_id = target_user_id THEN RETURN true;
END IF;
-- For other users, check hierarchy and role restrictions
RETURN can_perform_user_action(auth_uid, target_user_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.can_view_user(auth_uid uuid, target_user_id bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE requesting_user_id bigint;
requesting_hierarchy smallint;
target_hierarchy smallint;
BEGIN -- Get the requesting user's internal ID
requesting_user_id := get_user_id_from_auth(auth_uid);
-- Get hierarchies
requesting_hierarchy := get_user_hierarchy(requesting_user_id);
target_hierarchy := get_user_hierarchy(target_user_id);
-- Users can:
-- 1. Always view themselves
-- 2. View users with equal or lower hierarchy
RETURN requesting_user_id = target_user_id
OR requesting_hierarchy <= target_hierarchy;
END;
$function$;
CREATE OR REPLACE FUNCTION public.check_role_hierarchy(auth_uid uuid, target_user_id bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE requesting_user_id bigint;
requesting_hierarchy smallint;
target_hierarchy smallint;
BEGIN -- Get the requesting user's internal ID
requesting_user_id := get_user_id_from_auth(auth_uid);
-- Get hierarchies
requesting_hierarchy := get_user_hierarchy(requesting_user_id);
target_hierarchy := get_user_hierarchy(target_user_id);
-- Return true if requesting user has higher or equal hierarchy (lower number)
RETURN requesting_hierarchy <= target_hierarchy;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_user_hierarchy(target_user_id bigint) RETURNS smallint LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE user_hierarchy smallint;
BEGIN
SELECT MIN(r.hierarchy) INTO user_hierarchy
FROM roles r
  JOIN user_roles ur ON r.id = ur.role_id
WHERE ur.user_id = target_user_id;
RETURN COALESCE(user_hierarchy, 999);
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_user_higher_hierarchy(user_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $function$
SELECT COALESCE(MIN(r.hierarchy), 999) -- Return high number if no roles found
FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
WHERE ur.user_id = user_id;
$function$;
CREATE OR REPLACE FUNCTION public.get_user_id_from_auth(auth_uid uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
SELECT id
FROM users
WHERE user_id = auth_uid;
$function$;
CREATE OR REPLACE FUNCTION public.handle_auth_user_deletion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$ BEGIN -- Delete from auth.users which will cascade to public.users
DELETE FROM auth.users
WHERE id = OLD.user_id;
RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.has_permission(user_id uuid, required_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = user_id
      AND p.permission = required_permission
  );
$function$;
create policy "delete_users_policy" on "public"."users" as permissive for delete to authenticated using (
  (
    can_perform_user_action(auth.uid(), id)
    AND has_permission(auth.uid(), 'delete_users'::text)
  )
);
create policy "impersonate_users_policy" on "public"."users" as permissive for
select to authenticated using (
    (
      can_view_user(auth.uid(), id)
      AND has_permission(auth.uid(), 'impersonate_users'::text)
      AND (id <> get_user_id_from_auth(auth.uid()))
    )
  );
create policy "insert_users_policy" on "public"."users" as permissive for
insert to authenticated with check (has_permission(auth.uid(), 'create_users'::text));
create policy "update_users_policy" on "public"."users" as permissive for
update to authenticated using (
    (
      can_update_user(auth.uid(), id)
      AND has_permission(auth.uid(), 'update_users'::text)
    )
  ) with check (
    (
      can_update_user(auth.uid(), id)
      AND has_permission(auth.uid(), 'update_users'::text)
    )
  );
create policy "view_users_policy" on "public"."users" as permissive for
select to authenticated using (
    (
      can_view_user(auth.uid(), id)
      AND has_permission(auth.uid(), 'view_users'::text)
    )
  );
CREATE TRIGGER tr_delete_auth_user
AFTER DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION handle_auth_user_deletion();
