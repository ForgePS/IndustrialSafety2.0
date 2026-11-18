-- Forge AI natural-language reporting and analytics foundation.

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('forge_ai.view_analytics','forge_ai','Use AI Analytics','Use permission-aware cross-module Forge AI reporting and analytics.','Forge AI','view_analytics',true,true,'location',false,false,true,'normal',100),
  ('forge_ai.save_reports','forge_ai','Save AI Reports','Save reusable Forge AI analysis definitions and report prompts.','Forge AI','save_reports',true,false,'organization',false,false,true,'normal',110)
on conflict (permission_key) do update
set
  name=excluded.name,
  description=excluded.description,
  tenant_assignable=true,
  tenant_can_scope=excluded.tenant_can_scope,
  default_scope=excluded.default_scope,
  audit_use=true,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true,
  case when rt.template_key='supervisor' then 'location' else 'organization' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='forge_ai.view_analytics'
where rt.template_key in ('supervisor','safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='forge_ai.save_reports'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true,
  case when r.role_key in ('supervisor','location-administrator') then 'location' else 'organization' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='forge_ai.view_analytics'
where r.role_key in ('supervisor','location-administrator','company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='forge_ai.save_reports'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('analytics_executive_summary','Executive Safety Analysis','Build a cross-module executive safety analysis using only modules and records the current user may view.','Analytics','forge_ai.view_analytics','read',true,false,false,120),
  ('analytics_incidents','Incident Analytics','Analyze incident counts, trends, severity, types, status and Location or Division patterns within scope.','Analytics','forge_ai.view_analytics','read',true,false,false,130),
  ('analytics_training','Training Analytics','Analyze training assignments, overdue rates, completion activity and training gaps within scope.','Analytics','forge_ai.view_analytics','read',true,false,false,140),
  ('analytics_inspections','Inspection Analytics','Analyze inspection volume, status, results, open findings, overdue findings and repeat finding patterns within scope.','Analytics','forge_ai.view_analytics','read',true,false,false,150),
  ('analytics_assets','Asset Analytics','Analyze asset status, condition, maintenance due dates, maintenance costs and equipment patterns within scope.','Analytics','forge_ai.view_analytics','read',true,false,false,160)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  capability_type=excluded.capability_type,
  platform_enabled=true,
  sensitive=false,
  requires_approval=false,
  sort_order=excluded.sort_order,
  updated_at=now();

create table if not exists public.forge_ai_saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  prompt text not null,
  report_type text not null default 'ai_analysis'
    check (report_type in ('ai_analysis','executive_summary','incident','training','inspection','asset')),
  visibility text not null default 'private'
    check (visibility in ('private','tenant')),
  pinned boolean not null default false,
  default_date_range_days integer check (default_date_range_days is null or default_date_range_days between 1 and 3650),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_ai_saved_reports_owner_idx
  on public.forge_ai_saved_reports(organization_id, owner_user_id, updated_at desc);

create table if not exists public.forge_ai_report_runs (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  saved_report_id uuid references public.forge_ai_saved_reports(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.forge_ai_conversations(id) on delete set null,
  report_type text not null,
  date_from date,
  date_to date,
  status text not null default 'running'
    check (status in ('running','completed','failed')),
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.forge_ai_saved_reports enable row level security;
alter table public.forge_ai_report_runs enable row level security;

grant all on public.forge_ai_saved_reports to service_role;
grant all on public.forge_ai_report_runs to service_role;
grant usage, select on sequence public.forge_ai_report_runs_id_seq to service_role;

insert into public.forge_experience_elements
(element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select
  'nav.forge_ai_analytics',
  f.id,
  'menu',
  'Forge AI Analytics',
  'AI Analytics',
  'Natural-language safety reporting and analytics.',
  '/ai/analytics',
  'forge-ai-analytics',
  'Navigation',
  257,
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
  '{"route_live":true,"required_permission":"forge_ai.view_analytics"}'::jsonb
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
