create type "public"."billing_provider_enum" as enum ('stripe', 'lemon_squeezy');
create type "public"."payment_status_enum" as enum ('pending', 'success');
drop policy "Allow authenticated to add (insert) settings" on "public"."settings_configuration";
drop policy "Allow authenticated to read (select) settings" on "public"."settings_configuration";
drop policy "Allow authenticated to update settings" on "public"."settings_configuration";
create table "public"."billing" (
  "user_id" uuid not null,
  "email" character varying not null default ''::character varying,
  "billing_provider" billing_provider_enum not null,
  "order_id" character varying,
  "payment_email" character varying,
  "cost" character varying,
  "order_type" character varying not null,
  "status" payment_status_enum not null,
  "id" uuid not null default gen_random_uuid()
);
alter table "public"."billing" enable row level security;
CREATE UNIQUE INDEX billing_id_key ON public.billing USING btree (id);
CREATE UNIQUE INDEX billing_pkey ON public.billing USING btree (id);
alter table "public"."billing"
add constraint "billing_pkey" PRIMARY KEY using index "billing_pkey";
alter table "public"."billing"
add constraint "billing_email_fkey" FOREIGN KEY (email) REFERENCES users(email) not valid;
alter table "public"."billing" validate constraint "billing_email_fkey";
alter table "public"."billing"
add constraint "billing_id_key" UNIQUE using index "billing_id_key";
alter table "public"."billing"
add constraint "billing_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(user_id) not valid;
alter table "public"."billing" validate constraint "billing_user_id_fkey";
grant delete on table "public"."billing" to "anon";
grant insert on table "public"."billing" to "anon";
grant references on table "public"."billing" to "anon";
grant select on table "public"."billing" to "anon";
grant trigger on table "public"."billing" to "anon";
grant truncate on table "public"."billing" to "anon";
grant update on table "public"."billing" to "anon";
grant delete on table "public"."billing" to "authenticated";
grant insert on table "public"."billing" to "authenticated";
grant references on table "public"."billing" to "authenticated";
grant select on table "public"."billing" to "authenticated";
grant trigger on table "public"."billing" to "authenticated";
grant truncate on table "public"."billing" to "authenticated";
grant update on table "public"."billing" to "authenticated";
grant delete on table "public"."billing" to "service_role";
grant insert on table "public"."billing" to "service_role";
grant references on table "public"."billing" to "service_role";
grant select on table "public"."billing" to "service_role";
grant trigger on table "public"."billing" to "service_role";
grant truncate on table "public"."billing" to "service_role";
grant update on table "public"."billing" to "service_role";
create policy "Allow authenticated to add (insert) users" on "public"."billing" as permissive for
insert to public with check (true);
create policy "Allow authenticated to read (select) users" on "public"."billing" as permissive for
select to public using (true);
create policy "Allow authenticated to update users" on "public"."billing" as permissive for
update to anon using (true);
create policy "Allow authenticated to insert setting configurations" on "public"."settings_configuration" as permissive for
insert to public with check (true);
create policy "Allow authenticated to read (select) setting configurations" on "public"."settings_configuration" as permissive for
select to authenticated,
  anon using (true);
create policy "Allow authenticated to update setting configurations" on "public"."settings_configuration" as permissive for
update to authenticated using (true);
