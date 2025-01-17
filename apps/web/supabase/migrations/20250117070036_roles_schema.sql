CREATE UNIQUE INDEX roles_hierarchy_key ON public.roles USING btree (hierarchy);

CREATE UNIQUE INDEX roles_role_key ON public.roles USING btree (role);

alter table "public"."roles" add constraint "roles_hierarchy_key" UNIQUE using index "roles_hierarchy_key";

alter table "public"."roles" add constraint "roles_role_key" UNIQUE using index "roles_role_key";

create policy "Allow authenticated to add (insert) role_permissions"
on "public"."role_permissions"
as permissive
for insert
to authenticated
with check (true);


create policy "Allow authenticated to delete role_permissions"
on "public"."role_permissions"
as permissive
for delete
to public
using (true);


create policy "Allow authenticated to add (insert) roles"
on "public"."roles"
as permissive
for insert
to authenticated
with check (true);


create policy "Allow authenticated to delete roles"
on "public"."roles"
as permissive
for delete
to authenticated
using (true);


create policy "Allow authenticated to update roles"
on "public"."roles"
as permissive
for update
to authenticated
using (true)
with check (true);



