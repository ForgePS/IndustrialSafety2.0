-- Connect an incident to one or more equipment records without copying or rewriting asset history.
-- Composite foreign keys make cross-tenant links impossible even through service-role writes.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.forge_incidents'::regclass and conname = 'forge_incidents_org_id_unique'
  ) then
    alter table public.forge_incidents
      add constraint forge_incidents_org_id_unique unique (organization_id, id);
  end if;
  -- The QR hardening migration already creates this on forge_assets.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.forge_assets'::regclass and conname = 'forge_assets_org_id_unique'
  ) then
    alter table public.forge_assets
      add constraint forge_assets_org_id_unique unique (organization_id, id);
  end if;
end;
$$;

create table public.forge_incident_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null,
  asset_id uuid not null,
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  unique (organization_id, incident_id, asset_id),
  foreign key (organization_id, incident_id)
    references public.forge_incidents (organization_id, id) on delete cascade,
  foreign key (organization_id, asset_id)
    references public.forge_assets (organization_id, id) on delete restrict
);

create index forge_incident_assets_asset_idx
  on public.forge_incident_assets (organization_id, asset_id, linked_at desc);

alter table public.forge_incident_assets enable row level security;
-- This ledger is exposed only by server actions after both record-level checks.
revoke all on public.forge_incident_assets from anon, authenticated;
grant all on public.forge_incident_assets to service_role;

create or replace function public.guard_forge_incident_asset_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_incident_id uuid := case when tg_op = 'DELETE' then old.incident_id else new.incident_id end;
  v_organization_id uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  select status into v_status
  from public.forge_incidents
  where organization_id = v_organization_id and id = v_incident_id
  for update;

  if v_status not in ('draft', 'returned') or v_status is null then
    raise exception 'Equipment links may only change while the incident is Draft or Returned';
  end if;

  if tg_op = 'INSERT' and (
    select count(*) from public.forge_incident_assets
    where organization_id = v_organization_id and incident_id = v_incident_id
  ) >= 25 then
    raise exception 'An incident may have at most 25 linked assets';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger forge_incident_asset_link_guard
before insert or delete on public.forge_incident_assets
for each row execute function public.guard_forge_incident_asset_link();

revoke all on function public.guard_forge_incident_asset_link() from public;
