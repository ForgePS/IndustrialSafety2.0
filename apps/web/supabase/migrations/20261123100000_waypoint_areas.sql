-- Forge Waypoint, phase 0: Areas and Area Cards.
--
-- An area is a named part of a location (Paint Booth, Bay 3, Chemical Storage). It carries what anyone
-- entering it needs to know: required PPE, hazards, entry restrictions and emergency information, plus the
-- equipment that sits in it. A QR at the entrance (target_type 'area') opens a "Before you enter" brief with
-- a live status light worked out from that equipment: active lockouts, out-of-service equipment and open
-- issues reported from the area. See docs/WAYPOINT.md.

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('waypoint', 'Waypoint', 'Areas within each location, with PPE, hazards, emergency information, equipment and a QR Area Card at the entrance.', 'Operations', 'module', 'enabled', true, true, true, true, false, 246)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'waypoint'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select 'nav.waypoint', f.id, 'menu', 'Waypoint', 'Waypoint', 'Areas, Area Cards and what to know before you enter.', '/waypoint', 'waypoint', 'Facility & Operations Safety', 246, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
  '{"route_live": true, "required_permission": "waypoint.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key = 'waypoint'
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Areas
-- ---------------------------------------------------------------------------

create table if not exists public.forge_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  code text check (code is null or char_length(code) between 1 and 40),
  description text check (description is null or char_length(description) <= 2000),
  -- Option keys of the waypoint.hazard and waypoint.ppe lookups (tenant-configurable lists).
  hazards text[] not null default '{}',
  required_ppe text[] not null default '{}',
  -- Entry restricted (permit, authorized personnel only, confined space): the status light is red.
  restricted_entry boolean not null default false,
  entry_requirements text check (entry_requirements is null or char_length(entry_requirements) <= 1000),
  -- Where to go in an emergency. Free text because it is written for people standing in the area.
  nearest_exit text check (nearest_exit is null or char_length(nearest_exit) <= 300),
  muster_point text check (muster_point is null or char_length(muster_point) <= 300),
  nearest_eyewash text check (nearest_eyewash is null or char_length(nearest_eyewash) <= 300),
  nearest_extinguisher text check (nearest_extinguisher is null or char_length(nearest_extinguisher) <= 300),
  nearest_first_aid text check (nearest_first_aid is null or char_length(nearest_first_aid) <= 300),
  emergency_notes text check (emergency_notes is null or char_length(emergency_notes) <= 1000),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text check (archive_reason is null or char_length(archive_reason) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(hazards) <= 30),
  check (cardinality(required_ppe) <= 30)
);

-- One active area per name per location; archived areas keep their name free for reuse.
create unique index if not exists forge_areas_location_name_active_idx
  on public.forge_areas (organization_id, location_id, lower(btrim(name)))
  where archived_at is null;

create unique index if not exists forge_areas_code_active_idx
  on public.forge_areas (organization_id, lower(code))
  where archived_at is null and code is not null;

create index if not exists forge_areas_org_location_idx
  on public.forge_areas (organization_id, location_id, archived_at);

-- The location must belong to the area's company, and an area never moves to another company.
create or replace function public.forge_guard_area()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'An area cannot move to another company.' using errcode = '23514';
  end if;

  if not exists (select 1 from public.locations where id = new.location_id and organization_id = new.organization_id) then
    raise exception 'Area location does not belong to this company.' using errcode = '23503';
  end if;

  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists forge_areas_guard on public.forge_areas;
create trigger forge_areas_guard
  before insert or update on public.forge_areas
  for each row execute function public.forge_guard_area();

-- Areas with QR codes are archived, never deleted.
create or replace function public.forge_guard_area_qr_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.forge_qr_codes where target_type = 'area' and target_id = old.id) then
    raise exception 'This area has QR codes. Archive it instead of deleting it.' using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists forge_areas_guard_qr_delete on public.forge_areas;
create trigger forge_areas_guard_qr_delete
  before delete on public.forge_areas
  for each row execute function public.forge_guard_area_qr_delete();

create table if not exists public.forge_area_activity (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid not null references public.forge_areas(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null check (activity_type in ('created','updated','archived','restored','equipment_added','equipment_removed','qr_created')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_area_activity_area_idx
  on public.forge_area_activity (organization_id, area_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Equipment in an area
-- ---------------------------------------------------------------------------

alter table public.forge_assets
  add column if not exists area_id uuid references public.forge_areas(id) on delete set null;

create index if not exists forge_assets_area_idx
  on public.forge_assets (organization_id, area_id)
  where area_id is not null;

-- An asset's area must be an active area of the same company at the asset's own location. Moving the asset to
-- another location takes it out of the area.
create or replace function public.forge_guard_asset_area()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_area public.forge_areas%rowtype;
begin
  if new.area_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.location_id is distinct from old.location_id and new.area_id is not distinct from old.area_id then
    new.area_id := null;
    return new;
  end if;

  select * into v_area from public.forge_areas where id = new.area_id;

  if not found or v_area.organization_id <> new.organization_id then
    raise exception 'Area does not belong to this company.' using errcode = '23503';
  end if;

  if v_area.location_id is distinct from new.location_id then
    raise exception 'Equipment can only be placed in an area at its own location.' using errcode = '23514';
  end if;

  if v_area.archived_at is not null and (tg_op = 'INSERT' or new.area_id is distinct from old.area_id) then
    raise exception 'This area is archived.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_assets_guard_area on public.forge_assets;
create trigger forge_assets_guard_area
  before insert or update of area_id, location_id, organization_id on public.forge_assets
  for each row execute function public.forge_guard_asset_area();

-- ---------------------------------------------------------------------------
-- QR: areas can carry a QR (the Area Card)
-- ---------------------------------------------------------------------------

alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_target_type_check;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_target_type_check check (target_type in ('asset','location','form','vehicle','area'));

create or replace function public.forge_guard_qr_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.target_type = 'asset' then
    if not exists (select 1 from public.forge_assets where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target asset does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'location' then
    if not exists (select 1 from public.locations where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target location does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'form' then
    if not exists (select 1 from public.forge_form_templates where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target form does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'vehicle' then
    if not exists (select 1 from public.forge_fleet_vehicles where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target vehicle does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'area' then
    if not exists (select 1 from public.forge_areas where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target area does not belong to this company.' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

-- Issues reported from an Area Card remember the area (for its status light and history).
alter table public.forge_qr_issue_reports
  add column if not exists area_id uuid references public.forge_areas(id) on delete set null;

create index if not exists forge_qr_issue_reports_area_idx
  on public.forge_qr_issue_reports (organization_id, area_id, created_at desc)
  where area_id is not null;

-- ---------------------------------------------------------------------------
-- Lookups: hazards and PPE (tenants can rename, reorder and add their own)
-- ---------------------------------------------------------------------------

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select v.lookup_key, f.id, v.name, v.description, 'Waypoint', v.sort_order, true, true, true, true, false
from (
  values
    ('waypoint.hazard', 'Area Hazards', 'Hazards posted on an area''s Area Card.', 246),
    ('waypoint.ppe', 'Required PPE', 'Personal protective equipment required to enter an area.', 247)
) as v(lookup_key, name, description, sort_order)
join public.forge_feature_registry f on f.feature_key = 'waypoint'
on conflict (lookup_key) do update
set name = excluded.name, description = excluded.description, feature_id = excluded.feature_id, category = excluded.category,
    sort_order = excluded.sort_order, tenant_can_add_options = excluded.tenant_can_add_options, updated_at = now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('waypoint.hazard', 'noise', 'High noise', 'Noise levels that require hearing protection.', 10),
    ('waypoint.hazard', 'chemical', 'Chemicals', 'Hazardous chemicals are stored or used here.', 20),
    ('waypoint.hazard', 'forklift_traffic', 'Forklift traffic', 'Powered industrial trucks operate here.', 30),
    ('waypoint.hazard', 'electrical', 'Electrical / arc flash', 'Exposed energized parts or arc flash boundary.', 40),
    ('waypoint.hazard', 'confined_space', 'Confined space', 'Permit-required or non-permit confined space.', 50),
    ('waypoint.hazard', 'fall', 'Fall hazard', 'Elevated work, open edges or ladders.', 60),
    ('waypoint.hazard', 'moving_machinery', 'Moving machinery', 'Rotating or automated equipment.', 70),
    ('waypoint.hazard', 'hot_work', 'Hot work / hot surfaces', 'Welding, cutting or hot surfaces.', 80),
    ('waypoint.hazard', 'overhead', 'Overhead loads', 'Cranes, hoists or overhead conveyors.', 90),
    ('waypoint.hazard', 'slip_trip', 'Slip / trip', 'Wet floors, uneven surfaces or cords.', 100),
    ('waypoint.hazard', 'combustible_dust', 'Combustible dust', 'Dust that can ignite or explode.', 110),
    ('waypoint.hazard', 'radiation', 'Radiation / laser', 'Ionizing radiation or class 3B/4 lasers.', 120),

    ('waypoint.ppe', 'safety_glasses', 'Safety glasses', 'ANSI Z87.1 eye protection.', 10),
    ('waypoint.ppe', 'hard_hat', 'Hard hat', 'Head protection.', 20),
    ('waypoint.ppe', 'hearing_protection', 'Hearing protection', 'Ear plugs or ear muffs.', 30),
    ('waypoint.ppe', 'safety_footwear', 'Safety footwear', 'Protective-toe footwear.', 40),
    ('waypoint.ppe', 'high_visibility', 'High-visibility vest', 'High-visibility clothing.', 50),
    ('waypoint.ppe', 'gloves', 'Gloves', 'Hand protection suited to the task.', 60),
    ('waypoint.ppe', 'face_shield', 'Face shield', 'Face protection over safety glasses.', 70),
    ('waypoint.ppe', 'respirator', 'Respirator', 'Respiratory protection (fit test required).', 80),
    ('waypoint.ppe', 'fr_clothing', 'FR clothing', 'Flame-resistant or arc-rated clothing.', 90),
    ('waypoint.ppe', 'fall_protection', 'Fall protection', 'Harness and lanyard.', 100),
    ('waypoint.ppe', 'chemical_apron', 'Chemical apron', 'Chemical-resistant apron or suit.', 110)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key = v.lookup_key
on conflict (lookup_id, option_key) do update
set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['forge_areas', 'forge_area_activity']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('waypoint.view', 'waypoint', 'View Areas', 'See areas, their Area Cards, equipment and status.', 'Waypoint', 'view', true, true, 'organization', false, false, true, 'normal', 10),
  ('waypoint.manage', 'waypoint', 'Manage Areas', 'Create, edit and archive areas, set PPE, hazards and emergency information, and place equipment in an area.', 'Waypoint', 'edit', true, true, 'organization', false, false, true, 'normal', 20)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    is_sensitive = excluded.is_sensitive, sort_order = excluded.sort_order, updated_at = now();

-- Role templates.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key = 'waypoint.view'
where rt.template_key in ('standard-user', 'read-only')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.feature_key = 'waypoint'
where rt.template_key = 'supervisor'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.feature_key = 'waypoint'
where rt.template_key in ('safety-manager', 'company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

-- Existing tenant roles.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key = 'waypoint.view'
where r.role_key in ('employee', 'read-only')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.feature_key = 'waypoint'
where r.role_key in ('supervisor', 'location-administrator')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.feature_key = 'waypoint'
where r.role_key in ('company-administrator', 'company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
