-- Port slice 14: Emergency Management (Industrial 1.0 Emergency Response and Emergency Alerts).
--
-- Emergency plans, scenario procedures, drills with after-action reviews and response teams; emergency alerts
-- with templates, targeted audiences, updates and all-clear, and a roll call of who is safe.
--
-- Fixes over 1.0:
-- - Plans, drills and teams are real records with their own fields, status and archive (1.0 stored one title row
--   per "category" and matched categories by title text).
-- - Sending a live alert needs its own permission (1.0 let anyone with basic Industrial access send), and a
--   location-scoped sender can only alert their own locations.
-- - Updates and all-clear reach the original recipients (1.0 changed the record and told nobody).
-- - Only recipients can respond, and only while the alert is active; responses are "I'm safe" / "I need help"
--   with a roll call (1.0 took a free-text acknowledgment from anyone who could view alerts).
-- - Alert history and responses can't be rewritten (triggers).
--
-- Not in this slice: SMS delivery and consent, the QR SMS signup, and the CAP / digital signage feed.

-- ---------------------------------------------------------------------------
-- Features, menu
-- ---------------------------------------------------------------------------

update public.forge_feature_registry
set description = 'Emergency action plans, scenario procedures, drills and response teams.',
    platform_state = 'enabled',
    updated_at = now()
where feature_key = 'emergency_management';

update public.forge_feature_registry
set description = 'Emergency alerts to the company or chosen locations, departments and people, with updates, all-clear and roll call.',
    platform_state = 'enabled',
    updated_at = now()
where feature_key = 'emergency_alerts';

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key in ('emergency_management', 'emergency_alerts')
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select v.element_key, f.id, 'menu', v.label, v.label, v.description, v.route, v.component_key, 'Emergency Management', v.sort_order, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false, v.settings::jsonb
from (values
  ('nav.emergency_alerts', 'emergency_alerts', 'Emergency Alerts', 'Send emergency alerts and see who is safe.', '/emergency/alerts', 'emergency-alerts', 200, '{"route_live": true, "required_permission": "emergency_alerts.view"}'),
  ('nav.emergency_plans', 'emergency_management', 'Emergency Plans', 'Action plans, scenarios, drills and response teams.', '/emergency', 'emergency-plans', 210, '{"route_live": true, "required_permission": "emergency_management.view"}')
) as v(element_key, feature_key, label, description, route, component_key, sort_order, settings)
join public.forge_feature_registry f on f.feature_key = v.feature_key
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description, sort_order = excluded.sort_order,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Plans, scenarios, drills, response teams
-- ---------------------------------------------------------------------------

create table if not exists public.forge_emergency_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('plan', 'scenario', 'drill', 'team')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- Plans, scenarios and teams: draft / active / retired. Drills: scheduled / completed / canceled.
  status text not null,
  scenario_type text check (scenario_type is null or scenario_type in ('fire', 'evacuation', 'shelter_in_place', 'severe_weather', 'chemical_release', 'medical', 'security', 'utility_failure', 'other')),
  -- Blank = company-wide.
  location_id uuid references public.locations(id) on delete set null,
  -- A drill or scenario can point at the action plan it exercises.
  plan_id uuid references public.forge_emergency_plans(id) on delete set null,
  summary text check (summary is null or char_length(summary) <= 1000),
  body text check (body is null or char_length(body) <= 20000),
  review_due_on date,
  -- Drills.
  event_date date,
  participants integer check (participants is null or participants between 0 and 100000),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  after_action text check (after_action is null or char_length(after_action) <= 10000),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_emergency_plans_status_check check (
    (kind = 'drill' and status in ('scheduled', 'completed', 'canceled'))
    or (kind <> 'drill' and status in ('draft', 'active', 'retired'))
  ),
  constraint forge_emergency_plans_drill_fields check (
    kind = 'drill' or (event_date is null and participants is null and duration_minutes is null and after_action is null and completed_at is null)
  ),
  constraint forge_emergency_plans_drill_date check (kind <> 'drill' or event_date is not null),
  constraint forge_emergency_plans_completed_review check (kind <> 'drill' or status <> 'completed' or after_action is not null),
  constraint forge_emergency_plans_scenario_type check (kind <> 'scenario' or scenario_type is not null),
  constraint forge_emergency_plans_not_self check (plan_id is null or plan_id <> id)
);

create index if not exists forge_emergency_plans_org_kind_idx on public.forge_emergency_plans (organization_id, kind, archived_at);
create index if not exists forge_emergency_plans_plan_idx on public.forge_emergency_plans (plan_id);

-- Response team members: people in the company with a role on the team.
create table if not exists public.forge_emergency_team_members (
  team_id uuid not null references public.forge_emergency_plans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  team_role text check (team_role is null or char_length(team_role) <= 80),
  created_at timestamptz not null default now(),
  primary key (team_id, personnel_id)
);

-- ---------------------------------------------------------------------------
-- Alert templates and alerts
-- ---------------------------------------------------------------------------

create table if not exists public.forge_emergency_alert_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  alert_type text not null check (alert_type in ('general', 'fire', 'evacuation', 'shelter_in_place', 'severe_weather', 'chemical_release', 'medical', 'security', 'utility_failure')),
  severity text not null check (severity in ('extreme', 'severe', 'moderate', 'minor')),
  headline text not null check (char_length(btrim(headline)) between 1 and 120),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  requires_response boolean not null default true,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_emergency_alert_templates_name_idx on public.forge_emergency_alert_templates (organization_id, lower(name));

create table if not exists public.forge_emergency_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_number text not null check (alert_number ~ '^EA-[0-9]{8}-[0-9A-F]{6}$'),
  alert_type text not null check (alert_type in ('general', 'fire', 'evacuation', 'shelter_in_place', 'severe_weather', 'chemical_release', 'medical', 'security', 'utility_failure')),
  severity text not null check (severity in ('extreme', 'severe', 'moderate', 'minor')),
  -- The current message; every version sent is in forge_emergency_alert_updates.
  headline text not null check (char_length(btrim(headline)) between 1 and 120),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  is_drill boolean not null default false,
  requires_response boolean not null default true,
  status text not null default 'active' check (status in ('active', 'cleared')),
  -- {scope, locationIds, departmentIds, personnelIds} as chosen; the resolved people are the recipients.
  audience jsonb not null check (jsonb_typeof(audience) = 'object'),
  -- The locations an alert was aimed at (empty = company-wide or by department / person), for location scope.
  location_ids uuid[] not null default '{}',
  template_id uuid references public.forge_emergency_alert_templates(id) on delete set null,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  cleared_by uuid references auth.users(id) on delete set null,
  cleared_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint forge_emergency_alerts_number_unique unique (organization_id, alert_number),
  constraint forge_emergency_alerts_cleared check ((status = 'cleared') = (cleared_at is not null))
);

create index if not exists forge_emergency_alerts_org_status_idx on public.forge_emergency_alerts (organization_id, status, sent_at desc);

create table if not exists public.forge_emergency_alert_updates (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.forge_emergency_alerts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('issued', 'update', 'all_clear')),
  headline text not null,
  message text not null,
  instructions text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_emergency_alert_updates_alert_idx on public.forge_emergency_alert_updates (alert_id, created_at);

create table if not exists public.forge_emergency_alert_recipients (
  alert_id uuid not null references public.forge_emergency_alerts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  name text not null,
  location_id uuid references public.locations(id) on delete set null,
  department_id uuid references public.forge_departments(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

create index if not exists forge_emergency_alert_recipients_user_idx on public.forge_emergency_alert_recipients (user_id, alert_id);

create table if not exists public.forge_emergency_alert_responses (
  alert_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  status text not null check (status in ('safe', 'need_help')),
  note text check (note is null or char_length(note) <= 500),
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (alert_id, user_id),
  foreign key (alert_id, user_id) references public.forge_emergency_alert_recipients(alert_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Linked records stay in one company.
create or replace function public.forge_emergency_same_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if tg_table_name = 'forge_emergency_plans' then
    if new.plan_id is not null then
      select organization_id into v_org from public.forge_emergency_plans where id = new.plan_id;
      if v_org is distinct from new.organization_id then
        raise exception 'Emergency records must stay in one company.' using errcode = '23514';
      end if;
    end if;
    if new.location_id is not null then
      select organization_id into v_org from public.locations where id = new.location_id;
      if v_org is distinct from new.organization_id then
        raise exception 'Emergency records must stay in one company.' using errcode = '23514';
      end if;
    end if;
    return new;
  elsif tg_table_name = 'forge_emergency_team_members' then
    if not exists (select 1 from public.forge_emergency_plans where id = new.team_id and kind = 'team' and organization_id = new.organization_id) then
      raise exception 'Team members can only be added to a response team in the same company.' using errcode = '23514';
    end if;
    select organization_id into v_org from public.forge_personnel where id = new.personnel_id;
  elsif tg_table_name = 'forge_emergency_alert_updates' then
    select organization_id into v_org from public.forge_emergency_alerts where id = new.alert_id;
  elsif tg_table_name = 'forge_emergency_alert_recipients' then
    select organization_id into v_org from public.forge_emergency_alerts where id = new.alert_id;
    if v_org is not distinct from new.organization_id and not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = new.organization_id and m.user_id = new.user_id and m.is_active
    ) then
      raise exception 'Alert recipients must be active members of the company.' using errcode = '23514';
    end if;
  end if;

  if v_org is distinct from new.organization_id then
    raise exception 'Emergency records must stay in one company.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_emergency_plans_same_org on public.forge_emergency_plans;
create trigger forge_emergency_plans_same_org
  before insert or update on public.forge_emergency_plans
  for each row execute function public.forge_emergency_same_organization();

drop trigger if exists forge_emergency_team_members_same_org on public.forge_emergency_team_members;
create trigger forge_emergency_team_members_same_org
  before insert or update on public.forge_emergency_team_members
  for each row execute function public.forge_emergency_same_organization();

drop trigger if exists forge_emergency_alert_updates_same_org on public.forge_emergency_alert_updates;
create trigger forge_emergency_alert_updates_same_org
  before insert on public.forge_emergency_alert_updates
  for each row execute function public.forge_emergency_same_organization();

drop trigger if exists forge_emergency_alert_recipients_same_org on public.forge_emergency_alert_recipients;
create trigger forge_emergency_alert_recipients_same_org
  before insert or update on public.forge_emergency_alert_recipients
  for each row execute function public.forge_emergency_same_organization();

-- What an alert said, and who it went to, is a record: it can't be edited afterwards.
create or replace function public.forge_emergency_history_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Emergency alert history can''t be changed.' using errcode = '42501';
end;
$$;

drop trigger if exists forge_emergency_alert_updates_no_update on public.forge_emergency_alert_updates;
create trigger forge_emergency_alert_updates_no_update
  before update on public.forge_emergency_alert_updates
  for each row execute function public.forge_emergency_history_immutable();

drop trigger if exists forge_emergency_alert_recipients_no_update on public.forge_emergency_alert_recipients;
create trigger forge_emergency_alert_recipients_no_update
  before update on public.forge_emergency_alert_recipients
  for each row execute function public.forge_emergency_history_immutable();

-- Alerts: type, drill flag, audience and sender never change; status only goes active -> cleared; a cleared
-- alert can't change at all.
create or replace function public.forge_emergency_alert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cleared' then
    raise exception 'A cleared alert can''t be changed.' using errcode = '42501';
  end if;

  if new.organization_id <> old.organization_id or new.alert_number <> old.alert_number or new.alert_type <> old.alert_type
    or new.is_drill <> old.is_drill or new.audience <> old.audience or new.location_ids <> old.location_ids
    or new.sent_by is distinct from old.sent_by or new.sent_at <> old.sent_at or new.requires_response <> old.requires_response then
    raise exception 'Only the message, severity and status of an alert can change.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_emergency_alerts_guard on public.forge_emergency_alerts;
create trigger forge_emergency_alerts_guard
  before update on public.forge_emergency_alerts
  for each row execute function public.forge_emergency_alert_guard();

-- Responses only while the alert is active and asks for one; the same company as the alert.
create or replace function public.forge_emergency_response_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_alert record;
begin
  select organization_id, status, requires_response into v_alert from public.forge_emergency_alerts where id = new.alert_id;

  if v_alert.organization_id is distinct from new.organization_id then
    raise exception 'Emergency records must stay in one company.' using errcode = '23514';
  end if;

  if v_alert.status <> 'active' or not v_alert.requires_response then
    raise exception 'This alert isn''t taking responses.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (new.alert_id <> old.alert_id or new.user_id <> old.user_id) then
    raise exception 'A response belongs to one person and one alert.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_emergency_alert_responses_guard on public.forge_emergency_alert_responses;
create trigger forge_emergency_alert_responses_guard
  before insert or update on public.forge_emergency_alert_responses
  for each row execute function public.forge_emergency_response_guard();

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

alter table public.forge_emergency_plans enable row level security;
alter table public.forge_emergency_team_members enable row level security;
alter table public.forge_emergency_alert_templates enable row level security;
alter table public.forge_emergency_alerts enable row level security;
alter table public.forge_emergency_alert_updates enable row level security;
alter table public.forge_emergency_alert_recipients enable row level security;
alter table public.forge_emergency_alert_responses enable row level security;

revoke all on public.forge_emergency_plans, public.forge_emergency_team_members, public.forge_emergency_alert_templates, public.forge_emergency_alerts,
  public.forge_emergency_alert_updates, public.forge_emergency_alert_recipients, public.forge_emergency_alert_responses
  from anon, authenticated;

grant all on public.forge_emergency_plans, public.forge_emergency_team_members, public.forge_emergency_alert_templates, public.forge_emergency_alerts,
  public.forge_emergency_alert_updates, public.forge_emergency_alert_recipients, public.forge_emergency_alert_responses
  to service_role;

revoke all on function public.forge_emergency_same_organization() from public, anon, authenticated;
revoke all on function public.forge_emergency_history_immutable() from public, anon, authenticated;
revoke all on function public.forge_emergency_alert_guard() from public, anon, authenticated;
revoke all on function public.forge_emergency_response_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

update public.forge_permission_registry
set name = 'View Emergency Plans',
    description = 'See emergency action plans, scenario procedures, drills and response teams for your scope.',
    updated_at = now()
where permission_key = 'emergency_management.view';

update public.forge_permission_registry
set name = 'Manage Emergency Plans',
    description = 'Create and edit emergency plans, scenarios, drills (with after-action reviews) and response teams.',
    updated_at = now()
where permission_key = 'emergency_management.edit';

-- Replaced by emergency_alerts.send below (alerts have their own feature). Nothing in 2.0 used it.
update public.forge_permission_registry
set description = 'Replaced by Emergency Alerts: Send Live Alerts.',
    tenant_assignable = false,
    updated_at = now()
where permission_key = 'emergency_management.send_alerts';

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('emergency_alerts.view', 'emergency_alerts', 'View Emergency Alerts', 'See emergency alerts and their roll call for your scope. Everyone can always see and answer the alerts sent to them.', 'Emergency Alerts', 'view', true, true, 'organization', false, false, true, 'normal', 10),
  ('emergency_alerts.run_drills', 'emergency_alerts', 'Send Drill Alerts', 'Send drill alerts (marked [DRILL]), update them and give the all-clear.', 'Emergency Alerts', 'send_drills', true, true, 'organization', false, true, true, 'normal', 20),
  ('emergency_alerts.send', 'emergency_alerts', 'Send Live Alerts', 'Send live emergency alerts, update them and give the all-clear. Location scope can only alert its own locations.', 'Emergency Alerts', 'send_alerts', true, true, 'organization', false, true, true, 'critical', 30),
  ('emergency_alerts.manage_templates', 'emergency_alerts', 'Manage Alert Templates', 'Create and edit the alert templates senders start from.', 'Emergency Alerts', 'manage_templates', true, false, 'organization', false, false, true, 'normal', 40)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    requires_confirmation = excluded.requires_confirmation, is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level,
    sort_order = excluded.sort_order, updated_at = now();

-- Role templates. emergency_management.view is already granted to read-only, standard-user, supervisor and
-- company-admin; give it to safety managers too.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, v.scope
from (values
  ('supervisor', 'emergency_alerts.view', 'location'),
  ('supervisor', 'emergency_alerts.run_drills', 'location'),
  ('safety-manager', 'emergency_management.view', 'organization'),
  ('safety-manager', 'emergency_management.edit', 'organization'),
  ('safety-manager', 'emergency_alerts.view', 'organization'),
  ('safety-manager', 'emergency_alerts.run_drills', 'organization'),
  ('safety-manager', 'emergency_alerts.send', 'organization'),
  ('safety-manager', 'emergency_alerts.manage_templates', 'organization'),
  ('company-admin', 'emergency_alerts.view', 'organization'),
  ('company-admin', 'emergency_alerts.run_drills', 'organization'),
  ('company-admin', 'emergency_alerts.send', 'organization'),
  ('company-admin', 'emergency_alerts.manage_templates', 'organization')
) as v(template_key, permission_key, scope)
join public.forge_role_templates rt on rt.template_key = v.template_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

delete from public.forge_role_template_permissions
where permission_id in (select id from public.forge_permission_registry where permission_key = 'emergency_management.send_alerts');

-- Existing tenant roles.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, v.scope
from (values
  ('supervisor', 'emergency_alerts.view', 'location'),
  ('supervisor', 'emergency_alerts.run_drills', 'location'),
  ('location-administrator', 'emergency_management.edit', 'location'),
  ('location-administrator', 'emergency_alerts.view', 'location'),
  ('location-administrator', 'emergency_alerts.run_drills', 'location'),
  ('location-administrator', 'emergency_alerts.send', 'location'),
  ('company-administrator', 'emergency_alerts.view', 'organization'),
  ('company-administrator', 'emergency_alerts.run_drills', 'organization'),
  ('company-administrator', 'emergency_alerts.send', 'organization'),
  ('company-administrator', 'emergency_alerts.manage_templates', 'organization'),
  ('company-owner', 'emergency_alerts.view', 'organization'),
  ('company-owner', 'emergency_alerts.run_drills', 'organization'),
  ('company-owner', 'emergency_alerts.send', 'organization'),
  ('company-owner', 'emergency_alerts.manage_templates', 'organization')
) as v(role_key, permission_key, scope)
join public.forge_tenant_roles r on r.role_key = v.role_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

delete from public.forge_tenant_role_permissions
where permission_id in (select id from public.forge_permission_registry where permission_key = 'emergency_management.send_alerts');
