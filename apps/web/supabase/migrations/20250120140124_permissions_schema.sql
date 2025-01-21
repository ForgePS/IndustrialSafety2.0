CREATE UNIQUE INDEX permissions_permission_key ON public.permissions USING btree (permission);

alter table "public"."permissions" add constraint "permissions_permission_key" UNIQUE using index "permissions_permission_key";

create policy "Allow authenticated to add (insert) permissions"
on "public"."permissions"
as permissive
for insert
to authenticated
with check (true);


create policy "Allow authenticated to delete permissions"
on "public"."permissions"
as permissive
for delete
to authenticated
using (true);


create policy "Allow authenticated to update permissions"
on "public"."permissions"
as permissive
for update
to authenticated
using (true)
with check (true);



