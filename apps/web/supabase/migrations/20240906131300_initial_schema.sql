create type "public"."permission_enum" as enum (
  'create reviews',
  'create blog section',
  'create users',
  'create permission',
  'create roles',
  'view reviews',
  'view blog section',
  'view users',
  'view permission',
  'view roles',
  'update reviews',
  'update settings',
  'update blog section',
  'update users',
  'update permission',
  'update roles',
  'delete reviews',
  'delete blog section',
  'delete users',
  'delete permission',
  'delete roles',
  'impersonate users'
);
create type "public"."role_enum" as enum ('admin', 'editor', 'user');
create table "public"."role_permissions" (
  "role" "role_enum" not null,
  "permissions" "permission_enum" not null
);
alter table "public"."role_permissions" enable row level security;
create table "public"."users" (
  "user_id" uuid not null,
  "name" character varying,
  "email" character varying not null,
  "role" "role_enum" not null default 'user'::role_enum
);
alter table "public"."users" enable row level security;
CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role, permissions);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
CREATE UNIQUE INDEX users_pkey ON public.users USING btree (user_id);
alter table "public"."role_permissions"
add constraint "role_permissions_pkey" PRIMARY KEY using index "role_permissions_pkey";
alter table "public"."users"
add constraint "users_pkey" PRIMARY KEY using index "users_pkey";
alter table "public"."users"
add constraint "users_email_key" UNIQUE using index "users_email_key";
alter table "public"."users"
add constraint "users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
alter table "public"."users" validate constraint "users_user_id_fkey";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql
SET search_path TO '' AS $function$ BEGIN
INSERT INTO public.users (user_id, name, email, role)
VALUES (NEW.id, null, NEW.email, 'user');
RAISE NOTICE 'User (%) has been assigned a "user" role.',
NEW.email;
RETURN NEW;
END;
$function$;
grant delete on table "public"."role_permissions" to "anon";
grant insert on table "public"."role_permissions" to "anon";
grant references on table "public"."role_permissions" to "anon";
grant select on table "public"."role_permissions" to "anon";
grant trigger on table "public"."role_permissions" to "anon";
grant truncate on table "public"."role_permissions" to "anon";
grant update on table "public"."role_permissions" to "anon";
grant delete on table "public"."role_permissions" to "authenticated";
grant insert on table "public"."role_permissions" to "authenticated";
grant references on table "public"."role_permissions" to "authenticated";
grant select on table "public"."role_permissions" to "authenticated";
grant trigger on table "public"."role_permissions" to "authenticated";
grant truncate on table "public"."role_permissions" to "authenticated";
grant update on table "public"."role_permissions" to "authenticated";
grant delete on table "public"."role_permissions" to "service_role";
grant insert on table "public"."role_permissions" to "service_role";
grant references on table "public"."role_permissions" to "service_role";
grant select on table "public"."role_permissions" to "service_role";
grant trigger on table "public"."role_permissions" to "service_role";
grant truncate on table "public"."role_permissions" to "service_role";
grant update on table "public"."role_permissions" to "service_role";
grant delete on table "public"."users" to "anon";
grant insert on table "public"."users" to "anon";
grant references on table "public"."users" to "anon";
grant select on table "public"."users" to "anon";
grant trigger on table "public"."users" to "anon";
grant truncate on table "public"."users" to "anon";
grant update on table "public"."users" to "anon";
grant delete on table "public"."users" to "authenticated";
grant insert on table "public"."users" to "authenticated";
grant references on table "public"."users" to "authenticated";
grant select on table "public"."users" to "authenticated";
grant trigger on table "public"."users" to "authenticated";
grant truncate on table "public"."users" to "authenticated";
grant update on table "public"."users" to "authenticated";
grant delete on table "public"."users" to "service_role";
grant insert on table "public"."users" to "service_role";
grant references on table "public"."users" to "service_role";
grant select on table "public"."users" to "service_role";
grant trigger on table "public"."users" to "service_role";
grant truncate on table "public"."users" to "service_role";
grant update on table "public"."users" to "service_role";
grant insert on table "public"."users" to "supabase_auth_admin";
grant select on table "public"."users" to "supabase_auth_admin";
create policy "Allow authenticated to add (insert) users" on "public"."users" as permissive for
insert to authenticated,
  supabase_auth_admin with check (true);
create policy "Allow authenticated to read (select) users" on "public"."users" as permissive for
select to authenticated using (
    (
      user_id = (
        SELECT auth.uid() AS uid
      )
    )
  );
