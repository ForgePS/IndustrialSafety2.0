-- Port slice 17: Environmental Safety (Industrial 1.0 "environmental-safety" module).
--
-- Environmental permits; recurring compliance obligations (monitoring, agency reports, inspections, renewals)
-- with a completion log that rolls the due date forward; environmental events (spills and releases, permit
-- exceedances, complaints, notices of violation) with agency notification and corrective actions; and
-- hazardous waste shipments tracked by manifest until the signed copy comes back.
--
-- 1.0 had a single generic table of titled rows (default category "waste") with a status and nothing else.
-- This slice is built from the parity matrix's description of the module.

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('environmental', 'Environmental Safety', 'Environmental permits and their obligations, spills and other environmental events, and hazardous waste manifests.', 'Compliance', 'module', 'enabled', true, true, true, true, false, 180)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'environmental'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select 'nav.environmental', f.id, 'menu', 'Environmental Safety', 'Environmental Safety', 'Permits, obligations, environmental events and waste manifests.', '/environmental', 'environmental', 'Compliance Programs', 180, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
  '{"route_live": true, "required_permission": "environmental.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key = 'environmental'
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Event numbering: ENV-2026-0001 (per company, per year)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_env_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seq_year integer not null,
  next_value integer not null default 1,
  primary key (organization_id, seq_year)
);

create or replace function public.next_forge_env_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_number integer;
begin
  insert into public.forge_env_sequences (organization_id, seq_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, seq_year)
  do update set next_value = public.forge_env_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'ENV-' || v_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public.next_forge_env_number(uuid) from public, anon, authenticated;
grant execute on function public.next_forge_env_number(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Permits and obligations
-- ---------------------------------------------------------------------------

create table if not exists public.forge_env_permits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  permit_number text check (permit_number is null or char_length(permit_number) between 1 and 80),
  permit_type text not null check (permit_type in ('air', 'water_discharge', 'stormwater', 'hazardous_waste', 'spcc', 'drinking_water', 'other')),
  agency text not null check (char_length(btrim(agency)) between 1 and 200),
  location_id uuid not null references public.locations(id) on delete restrict,
  status text not null default 'active' check (status in ('pending', 'active', 'terminated')),
  issued_on date,
  effective_on date,
  expires_on date,
  document_id uuid references public.forge_documents(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 5000),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_env_permits_number check (status <> 'active' or permit_number is not null),
  constraint forge_env_permits_dates check ((expires_on is null or effective_on is null or expires_on >= effective_on) and (expires_on is null or issued_on is null or expires_on >= issued_on))
);

create index if not exists forge_env_permits_org_idx on public.forge_env_permits (organization_id, expires_on);

create table if not exists public.forge_env_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid references public.forge_env_permits(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  obligation_type text not null check (obligation_type in ('monitoring', 'report', 'inspection', 'training', 'plan_review', 'renewal', 'other')),
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'one_time')),
  next_due_on date,
  active boolean not null default true,
  owner_user_id uuid references auth.users(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An active obligation always has its next due date.
  constraint forge_env_obligations_due check (not active or next_due_on is not null)
);

create index if not exists forge_env_obligations_due_idx on public.forge_env_obligations (organization_id, active, next_due_on);
create index if not exists forge_env_obligations_permit_idx on public.forge_env_obligations (permit_id) where permit_id is not null;

create table if not exists public.forge_env_obligation_completions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  obligation_id uuid not null references public.forge_env_obligations(id) on delete cascade,
  due_on date not null,
  completed_on date not null,
  result text not null check (result in ('done', 'issue')),
  notes text check (notes is null or char_length(notes) <= 2000),
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_env_completions_issue check (result <> 'issue' or notes is not null),
  -- Each occurrence is completed once.
  constraint forge_env_completions_once unique (obligation_id, due_on)
);

-- ---------------------------------------------------------------------------
-- Environmental events
-- ---------------------------------------------------------------------------

create table if not exists public.forge_env_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_number text not null check (event_number ~ '^ENV-[0-9]{4}-[0-9]{4,}$'),
  event_type text not null check (event_type in ('spill_release', 'exceedance', 'complaint', 'notice_of_violation', 'other')),
  occurred_at timestamptz not null,
  location_id uuid not null references public.locations(id) on delete restrict,
  permit_id uuid references public.forge_env_permits(id) on delete set null,
  substance text check (substance is null or char_length(substance) <= 200),
  quantity numeric check (quantity is null or (quantity >= 0 and quantity <= 1000000000)),
  unit text check (unit is null or unit in ('gal', 'L', 'lb', 'kg', 'ton', 'ft3', 'yd3', 'drums')),
  media text[] not null default '{}'
    check (media <@ array['air', 'surface_water', 'stormwater', 'sewer', 'soil', 'groundwater', 'contained']::text[]),
  contained boolean not null default false,
  reportable boolean not null default false,
  agency_name text check (agency_name is null or char_length(agency_name) <= 200),
  agency_notified_at timestamptz,
  agency_reference text check (agency_reference is null or char_length(agency_reference) <= 120),
  description text not null check (char_length(btrim(description)) between 1 and 10000),
  immediate_actions text check (immediate_actions is null or char_length(immediate_actions) <= 5000),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closure_notes text check (closure_notes is null or char_length(closure_notes) <= 2000),
  reported_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_env_events_number_unique unique (organization_id, event_number),
  constraint forge_env_events_quantity check ((quantity is null) = (unit is null)),
  constraint forge_env_events_spill check (event_type <> 'spill_release' or (substance is not null and cardinality(media) > 0)),
  constraint forge_env_events_notice check (agency_notified_at is null or (agency_name is not null and agency_notified_at >= occurred_at)),
  constraint forge_env_events_closed check ((status = 'closed') = (closed_at is not null)),
  -- A reportable event can't be closed until the agency notice is on record.
  constraint forge_env_events_reported check (status <> 'closed' or not reportable or agency_notified_at is not null)
);

create index if not exists forge_env_events_org_idx on public.forge_env_events (organization_id, occurred_at desc);

create table if not exists public.forge_env_event_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.forge_env_events(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  capa_id uuid references public.forge_corrective_actions(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  removed_reason text check (removed_reason is null or char_length(removed_reason) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_env_event_actions_removed check ((removed_at is null) = (removed_reason is null))
);

create index if not exists forge_env_event_actions_event_idx on public.forge_env_event_actions (event_id);
create unique index if not exists forge_env_event_actions_capa_idx on public.forge_env_event_actions (capa_id) where capa_id is not null;

-- ---------------------------------------------------------------------------
-- Hazardous waste shipments
-- ---------------------------------------------------------------------------

create table if not exists public.forge_env_waste_shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  manifest_number text not null check (manifest_number ~ '^[0-9]{9}[A-Z]{3}$'),
  location_id uuid not null references public.locations(id) on delete restrict,
  shipped_on date not null,
  generator_status text not null check (generator_status in ('vsqg', 'sqg', 'lqg')),
  waste_description text not null check (char_length(btrim(waste_description)) between 1 and 500),
  waste_codes text[] not null default '{}' check (cardinality(waste_codes) <= 20),
  quantity numeric not null check (quantity > 0 and quantity <= 1000000000),
  unit text not null check (unit in ('gal', 'L', 'lb', 'kg', 'ton', 'ft3', 'yd3', 'drums')),
  transporter text not null check (char_length(btrim(transporter)) between 1 and 200),
  facility text not null check (char_length(btrim(facility)) between 1 and 200),
  return_received_on date,
  exception_filed_on date,
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_env_waste_dates check ((return_received_on is null or return_received_on >= shipped_on) and (exception_filed_on is null or exception_filed_on >= shipped_on))
);

-- A manifest tracking number is used once.
create unique index if not exists forge_env_waste_manifest_unique on public.forge_env_waste_shipments (organization_id, manifest_number) where archived_at is null;
create index if not exists forge_env_waste_open_idx on public.forge_env_waste_shipments (organization_id, shipped_on) where return_received_on is null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Linked records stay in one company; event numbers and parents never change; the completion log can't be
-- edited; a closed event is frozen except to reopen it. Conditions are nested because plpgsql doesn't
-- short-circuit and the tables have different columns.
create or replace function public.forge_env_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'Environmental records can''t move to another company.' using errcode = '42501';
  end if;

  if tg_table_name = 'forge_env_obligation_completions' then
    if tg_op = 'UPDATE' then
      raise exception 'Completed obligations can''t be changed.' using errcode = '42501';
    end if;
    select organization_id into v_org from public.forge_env_obligations where id = new.obligation_id;
    if v_org is distinct from new.organization_id then
      raise exception 'Environmental records must stay in one company.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'forge_env_event_actions' then
    if tg_op = 'UPDATE' and (new.event_id <> old.event_id or (old.capa_id is not null and new.capa_id is distinct from old.capa_id)) then
      raise exception 'An action stays with its event and its Corrective Action.' using errcode = '42501';
    end if;
    select organization_id into v_org from public.forge_env_events where id = new.event_id;
    if v_org is distinct from new.organization_id then
      raise exception 'Environmental records must stay in one company.' using errcode = '23514';
    end if;
    if new.capa_id is not null and not exists (select 1 from public.forge_corrective_actions ca where ca.id = new.capa_id and ca.organization_id = new.organization_id) then
      raise exception 'Environmental records must stay in one company.' using errcode = '23514';
    end if;
    return new;
  end if;

  -- The remaining tables all have a location.
  if not exists (select 1 from public.locations l where l.id = new.location_id and l.organization_id = new.organization_id) then
    raise exception 'Environmental records must stay in one company.' using errcode = '23514';
  end if;

  if tg_table_name = 'forge_env_permits' then
    if new.document_id is not null and not exists (select 1 from public.forge_documents d where d.id = new.document_id and d.organization_id = new.organization_id) then
      raise exception 'Environmental records must stay in one company.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'forge_env_obligations' then
    if new.permit_id is not null and not exists (select 1 from public.forge_env_permits p where p.id = new.permit_id and p.organization_id = new.organization_id) then
      raise exception 'Environmental records must stay in one company.' using errcode = '23514';
    end if;
    if new.owner_user_id is not null and (tg_op = 'INSERT' or new.owner_user_id is distinct from old.owner_user_id) and not exists (
      select 1 from public.organization_memberships m where m.organization_id = new.organization_id and m.user_id = new.owner_user_id and m.is_active
    ) then
      raise exception 'The owner must be an active member of the company.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'forge_env_events' then
    if tg_op = 'UPDATE' then
      if new.event_number <> old.event_number then
        raise exception 'An event''s number can''t change.' using errcode = '42501';
      end if;
      -- Closed: only reopening, or links cleared when a permit or user is deleted.
      if old.status = 'closed'
        and (to_jsonb(new) - array['status', 'closed_at', 'closed_by', 'closure_notes', 'permit_id', 'reported_by', 'updated_by', 'updated_at'])
          is distinct from (to_jsonb(old) - array['status', 'closed_at', 'closed_by', 'closure_notes', 'permit_id', 'reported_by', 'updated_by', 'updated_at']) then
        raise exception 'A closed event can''t be edited. Reopen it first.' using errcode = '42501';
      end if;
    end if;
    if new.permit_id is not null and not exists (select 1 from public.forge_env_permits p where p.id = new.permit_id and p.organization_id = new.organization_id) then
      raise exception 'Environmental records must stay in one company.' using errcode = '23514';
    end if;
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.forge_env_guard() from public, anon, authenticated;

drop trigger if exists forge_env_permits_guard on public.forge_env_permits;
create trigger forge_env_permits_guard before insert or update on public.forge_env_permits for each row execute function public.forge_env_guard();

drop trigger if exists forge_env_obligations_guard on public.forge_env_obligations;
create trigger forge_env_obligations_guard before insert or update on public.forge_env_obligations for each row execute function public.forge_env_guard();

drop trigger if exists forge_env_completions_guard on public.forge_env_obligation_completions;
create trigger forge_env_completions_guard before insert or update on public.forge_env_obligation_completions for each row execute function public.forge_env_guard();

drop trigger if exists forge_env_events_guard on public.forge_env_events;
create trigger forge_env_events_guard before insert or update on public.forge_env_events for each row execute function public.forge_env_guard();

drop trigger if exists forge_env_event_actions_guard on public.forge_env_event_actions;
create trigger forge_env_event_actions_guard before insert or update on public.forge_env_event_actions for each row execute function public.forge_env_guard();

drop trigger if exists forge_env_waste_guard on public.forge_env_waste_shipments;
create trigger forge_env_waste_guard before insert or update on public.forge_env_waste_shipments for each row execute function public.forge_env_guard();

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

alter table public.forge_env_sequences enable row level security;
alter table public.forge_env_permits enable row level security;
alter table public.forge_env_obligations enable row level security;
alter table public.forge_env_obligation_completions enable row level security;
alter table public.forge_env_events enable row level security;
alter table public.forge_env_event_actions enable row level security;
alter table public.forge_env_waste_shipments enable row level security;

revoke all on public.forge_env_sequences, public.forge_env_permits, public.forge_env_obligations, public.forge_env_obligation_completions,
  public.forge_env_events, public.forge_env_event_actions, public.forge_env_waste_shipments
  from anon, authenticated;

grant all on public.forge_env_sequences, public.forge_env_permits, public.forge_env_obligations, public.forge_env_obligation_completions,
  public.forge_env_events, public.forge_env_event_actions, public.forge_env_waste_shipments
  to service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('environmental.view', 'environmental', 'View Environmental Safety', 'See permits, obligations, environmental events and waste shipments. Location scope sees its own locations.', 'Environmental Safety', 'view', true, true, 'organization', false, false, true, 'normal', 10),
  ('environmental.report', 'environmental', 'Report Environmental Events', 'Record spills, releases, exceedances, complaints and notices of violation at your locations.', 'Environmental Safety', 'report', true, true, 'organization', false, false, true, 'normal', 20),
  ('environmental.manage', 'environmental', 'Manage Environmental Safety', 'Keep permits, obligations and waste shipments, complete obligations, edit, close and reopen events, and add their corrective actions.', 'Environmental Safety', 'manage', true, true, 'organization', false, false, true, 'normal', 30)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    requires_confirmation = excluded.requires_confirmation, is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level,
    sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, v.scope
from (values
  ('read-only', 'environmental.view', 'organization'),
  ('supervisor', 'environmental.view', 'location'),
  ('supervisor', 'environmental.report', 'location'),
  ('safety-manager', 'environmental.view', 'organization'),
  ('safety-manager', 'environmental.report', 'organization'),
  ('safety-manager', 'environmental.manage', 'organization'),
  ('company-admin', 'environmental.view', 'organization'),
  ('company-admin', 'environmental.report', 'organization'),
  ('company-admin', 'environmental.manage', 'organization')
) as v(template_key, permission_key, scope)
join public.forge_role_templates rt on rt.template_key = v.template_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, v.scope
from (values
  ('read-only', 'environmental.view', 'organization'),
  ('supervisor', 'environmental.view', 'location'),
  ('supervisor', 'environmental.report', 'location'),
  ('location-administrator', 'environmental.view', 'location'),
  ('location-administrator', 'environmental.report', 'location'),
  ('location-administrator', 'environmental.manage', 'location'),
  ('company-administrator', 'environmental.view', 'organization'),
  ('company-administrator', 'environmental.report', 'organization'),
  ('company-administrator', 'environmental.manage', 'organization'),
  ('company-owner', 'environmental.view', 'organization'),
  ('company-owner', 'environmental.report', 'organization'),
  ('company-owner', 'environmental.manage', 'organization')
) as v(role_key, permission_key, scope)
join public.forge_tenant_roles r on r.role_key = v.role_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
