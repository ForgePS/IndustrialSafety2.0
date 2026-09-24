-- Forge AI Watch foundation.
-- Permission-aware proactive monitoring of Forge runtime data with deduplicated tenant alerts.

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('forge_ai.view_alerts','forge_ai','View AI Alerts','View Forge AI Watch alerts within the user''s normal record scope.','Forge AI','view_alerts',true,true,'location',false,false,true,'normal',80),
  ('forge_ai.manage_watchers','forge_ai','Manage AI Watchers','Create, enable and configure Forge AI Watch monitoring rules.','Forge AI','manage_watchers',true,false,'organization',true,true,true,'sensitive',90)
on conflict (permission_key) do update
set
  name=excluded.name,
  description=excluded.description,
  tenant_assignable=true,
  tenant_can_scope=excluded.tenant_can_scope,
  default_scope=excluded.default_scope,
  is_sensitive=excluded.is_sensitive,
  requires_confirmation=excluded.requires_confirmation,
  audit_use=true,
  danger_level=excluded.danger_level,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true,
  case when rt.template_key='supervisor' then 'location' else 'organization' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='forge_ai.view_alerts'
where rt.template_key in ('supervisor','safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='forge_ai.manage_watchers'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true,
  case when r.role_key in ('supervisor','location-administrator') then 'location' else 'organization' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='forge_ai.view_alerts'
where r.role_key in ('supervisor','location-administrator','company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='forge_ai.manage_watchers'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

create table if not exists public.forge_ai_watch_rule_templates (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  description text,
  category text not null,
  target_type text not null,
  required_permission_key text not null,
  severity text not null default 'warning'
    check (severity in ('info','warning','high','critical')),
  platform_enabled boolean not null default true,
  tenant_configurable boolean not null default true,
  default_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.forge_ai_watch_rule_templates
(rule_key, name, description, category, target_type, required_permission_key, severity, default_config, sort_order)
values
  (
    'training.overdue',
    'Overdue Training',
    'Identify active training assignments that are past their due date.',
    'Training',
    'training_assignment',
    'training.view',
    'warning',
    '{"days_overdue":1}'::jsonb,
    10
  ),
  (
    'inspection.critical_open_finding',
    'Open Critical Inspection Finding',
    'Identify Critical inspection findings that are not closed or canceled.',
    'Inspections',
    'inspection_finding',
    'inspections.view',
    'critical',
    '{}'::jsonb,
    20
  ),
  (
    'inspection.overdue_finding',
    'Overdue Inspection Finding',
    'Identify inspection findings that remain open past their due date.',
    'Inspections',
    'inspection_finding',
    'inspections.view',
    'high',
    '{"days_overdue":1}'::jsonb,
    30
  ),
  (
    'asset.out_of_service',
    'Asset Out of Service',
    'Identify Assets & Equipment currently marked Out of Service.',
    'Assets & Equipment',
    'asset',
    'assets_equipment.view',
    'high',
    '{}'::jsonb,
    40
  ),
  (
    'asset.poor_condition',
    'Poor / Unserviceable Asset',
    'Identify assets in Poor or Unserviceable condition.',
    'Assets & Equipment',
    'asset',
    'assets_equipment.view',
    'high',
    '{}'::jsonb,
    50
  ),
  (
    'asset.maintenance_due',
    'Asset Maintenance Due',
    'Identify maintenance records with a next due date that is due or approaching.',
    'Assets & Equipment',
    'asset',
    'assets_equipment.view',
    'warning',
    '{"days_ahead":14}'::jsonb,
    60
  ),
  (
    'incident.awaiting_review',
    'Incident Awaiting Review',
    'Identify submitted incidents waiting for review.',
    'Incidents',
    'incident',
    'incidents.view',
    'warning',
    '{"minimum_age_hours":24}'::jsonb,
    70
  )
on conflict (rule_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  target_type=excluded.target_type,
  required_permission_key=excluded.required_permission_key,
  severity=excluded.severity,
  default_config=excluded.default_config,
  sort_order=excluded.sort_order,
  updated_at=now();

create table if not exists public.forge_ai_watch_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.forge_ai_watch_rule_templates(id) on delete cascade,
  enabled boolean not null default true,
  name_override text,
  severity_override text
    check (severity_override is null or severity_override in ('info','warning','high','critical')),
  config jsonb not null default '{}'::jsonb,
  notification_mode text not null default 'in_app'
    check (notification_mode in ('in_app','none')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_id)
);

create table if not exists public.forge_ai_watch_runs (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trigger_type text not null
    check (trigger_type in ('manual','scheduled','system')),
  started_by uuid references auth.users(id) on delete set null,
  status text not null default 'running'
    check (status in ('running','completed','failed')),
  evaluated_rules integer not null default 0,
  alerts_created integer not null default 0,
  alerts_refreshed integer not null default 0,
  alerts_resolved integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.forge_ai_watch_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  watch_rule_id uuid not null references public.forge_ai_watch_rules(id) on delete cascade,
  rule_key text not null,
  severity text not null
    check (severity in ('info','warning','high','critical')),
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved','dismissed')),
  target_type text not null,
  target_id text not null,
  target_reference text,
  title text not null,
  summary text not null,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);

create index if not exists forge_ai_watch_alerts_org_status_idx
  on public.forge_ai_watch_alerts(organization_id, status, severity, last_detected_at desc);

create index if not exists forge_ai_watch_alerts_location_idx
  on public.forge_ai_watch_alerts(organization_id, location_id, status);

alter table public.forge_ai_watch_rule_templates enable row level security;
alter table public.forge_ai_watch_rules enable row level security;
alter table public.forge_ai_watch_runs enable row level security;
alter table public.forge_ai_watch_alerts enable row level security;

grant all on public.forge_ai_watch_rule_templates to service_role;
grant all on public.forge_ai_watch_rules to service_role;
grant all on public.forge_ai_watch_runs to service_role;
grant all on public.forge_ai_watch_alerts to service_role;
grant usage, select on sequence public.forge_ai_watch_runs_id_seq to service_role;

insert into public.forge_ai_watch_rules
(organization_id, template_id, enabled, config, notification_mode)
select
  '20000000-0000-4000-8000-000000000100',
  t.id,
  true,
  t.default_config,
  'in_app'
from public.forge_ai_watch_rule_templates t
where t.platform_enabled=true
on conflict (organization_id, template_id) do update
set enabled=true,
    config=excluded.config,
    updated_at=now();

insert into public.forge_experience_elements
(element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select
  'nav.forge_ai_watch',
  f.id,
  'menu',
  'Forge AI Watch',
  'AI Watch',
  'Proactive Forge safety monitoring and alerts.',
  '/ai/watch',
  'forge-ai-watch',
  'Navigation',
  256,
  true,
  'configurable',
  'presentation',
  'none',
  'preference',
  true,
  true,
  true,
  false,
  false,
  '{"route_live":true,"required_permission":"forge_ai.view_alerts"}'::jsonb
from public.forge_feature_registry f
where f.feature_key='forge_ai'
on conflict (element_key) do update
set
  feature_id=excluded.feature_id,
  default_label=excluded.default_label,
  default_description=excluded.default_description,
  route=excluded.route,
  component_key=excluded.component_key,
  settings=excluded.settings,
  updated_at=now();
