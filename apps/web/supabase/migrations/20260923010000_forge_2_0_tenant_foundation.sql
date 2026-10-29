-- Forge Industrial Safety 2.0 multi-tenant foundation.
-- This migration is intentionally independent from the original Forge Industrial Safety database.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'manager', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  division_id uuid references public.divisions(id) on delete set null,
  name text not null,
  code text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  country_code text not null default 'US',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships(user_id);

create index if not exists divisions_organization_id_idx
  on public.divisions(organization_id);

create index if not exists locations_organization_id_idx
  on public.locations(organization_id);

create index if not exists locations_division_id_idx
  on public.locations(division_id);

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.handle_new_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active
  )
  values (
    new.id,
    new.created_by,
    'owner',
    true
  )
  on conflict (organization_id, user_id)
  do update set
    role = 'owner',
    is_active = true,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
after insert on public.organizations
for each row execute function public.handle_new_organization_owner();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.divisions enable row level security;
alter table public.locations enable row level security;

drop policy if exists organizations_select_policy on public.organizations;
create policy organizations_select_policy
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists organizations_insert_policy on public.organizations;
create policy organizations_insert_policy
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists organizations_update_policy on public.organizations;
create policy organizations_update_policy
on public.organizations
for update
to authenticated
using (public.has_org_role(id, array['owner', 'admin']))
with check (public.has_org_role(id, array['owner', 'admin']));

drop policy if exists organizations_delete_policy on public.organizations;
create policy organizations_delete_policy
on public.organizations
for delete
to authenticated
using (public.has_org_role(id, array['owner']));

drop policy if exists organization_memberships_select_policy on public.organization_memberships;
create policy organization_memberships_select_policy
on public.organization_memberships
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists organization_memberships_insert_policy on public.organization_memberships;
create policy organization_memberships_insert_policy
on public.organization_memberships
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists organization_memberships_update_policy on public.organization_memberships;
create policy organization_memberships_update_policy
on public.organization_memberships
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']))
with check (public.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists organization_memberships_delete_policy on public.organization_memberships;
create policy organization_memberships_delete_policy
on public.organization_memberships
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists divisions_select_policy on public.divisions;
create policy divisions_select_policy
on public.divisions
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists divisions_insert_policy on public.divisions;
create policy divisions_insert_policy
on public.divisions
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager']));

drop policy if exists divisions_update_policy on public.divisions;
create policy divisions_update_policy
on public.divisions
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin', 'manager']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager']));

drop policy if exists divisions_delete_policy on public.divisions;
create policy divisions_delete_policy
on public.divisions
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists locations_select_policy on public.locations;
create policy locations_select_policy
on public.locations
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists locations_insert_policy on public.locations;
create policy locations_insert_policy
on public.locations
for insert
to authenticated
with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager']));

drop policy if exists locations_update_policy on public.locations;
create policy locations_update_policy
on public.locations
for update
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin', 'manager']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager']));

drop policy if exists locations_delete_policy on public.locations;
create policy locations_delete_policy
on public.locations
for delete
to authenticated
using (public.has_org_role(organization_id, array['owner', 'admin']));

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.divisions to authenticated;
grant select, insert, update, delete on public.locations to authenticated;

grant all on public.organizations to service_role;
grant all on public.organization_memberships to service_role;
grant all on public.divisions to service_role;
grant all on public.locations to service_role;

grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.has_org_role(uuid, text[]) to authenticated, service_role;
