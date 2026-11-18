-- Forge AI Command Center, stage 3: risk intelligence and proactive monitoring.
-- Additive only.
--  * Risk intelligence: versioned scoring models, facility (location) and division assessments,
--    and per-factor indicators that keep the records each factor was computed from. Scores are
--    deterministic risk indicators over real records, never probabilities.
--  * Monitoring: seven new Watch rules, alert routing to the shared notification service,
--    notification tracking on alerts, and an event cursor so new domain events trigger a run.

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------
insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('forge_ai.view_risk','forge_ai','View AI Risk Indicators','View Forge AI facility and division risk indicators within the user''s location or division scope.','Forge AI','view_risk',true,true,'location',false,false,true,'normal',85)
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
join public.forge_permission_registry p on p.permission_key='forge_ai.view_risk'
where rt.template_key in ('supervisor','safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true,
  case when r.role_key in ('supervisor','location-administrator') then 'location' else 'organization' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='forge_ai.view_risk'
where r.role_key in ('supervisor','location-administrator','company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope=excluded.scope;

-- ---------------------------------------------------------------------------
-- Risk models. organization_id null = the platform default; a tenant row with the same
-- model_key overrides it. A model version is never edited once used: publish a new version.
-- ---------------------------------------------------------------------------
create table if not exists public.forge_ai_risk_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  model_key text not null check (model_key ~ '^[a-z_]+$'),
  version integer not null check (version > 0),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','retired')),
  window_days integer not null default 90 check (window_days between 14 and 730),
  factors jsonb not null,
  bands jsonb not null,
  min_available_weight numeric not null default 0.6 check (min_available_weight > 0 and min_available_weight <= 1),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists forge_ai_risk_models_version_idx
  on public.forge_ai_risk_models (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), model_key, version);

-- Factor weights and saturation points: a factor's raw value is normalised as min(value / saturation, 1).
insert into public.forge_ai_risk_models (organization_id, model_key, version, name, description, window_days, factors, bands, min_available_weight)
select null, 'facility_risk', 1, 'Facility Risk Indicator',
  'Weighted indicator over incidents, findings, corrective actions, training, open risks and observations in the last 90 days.',
  90,
  '[
    {"key":"injury_rate","label":"Injury rate per 200,000 hours","weight":0.20,"saturation":6},
    {"key":"incident_severity","label":"Incident severity load","weight":0.20,"saturation":20},
    {"key":"incident_trend","label":"Incident trend, last 30 days vs. prior 60","weight":0.10,"saturation":2},
    {"key":"open_findings","label":"Open high or critical inspection findings","weight":0.15,"saturation":5},
    {"key":"overdue_corrective_actions","label":"Overdue corrective actions","weight":0.15,"saturation":5},
    {"key":"overdue_training","label":"Share of training assignments overdue","weight":0.10,"saturation":0.25},
    {"key":"open_high_risks","label":"Open high-band risks and observations","weight":0.10,"saturation":5}
  ]'::jsonb,
  '[
    {"key":"low","label":"Low","min":0},
    {"key":"moderate","label":"Moderate","min":25},
    {"key":"elevated","label":"Elevated","min":50},
    {"key":"high","label":"High","min":75}
  ]'::jsonb,
  0.6
where not exists (
  select 1 from public.forge_ai_risk_models where organization_id is null and model_key = 'facility_risk' and version = 1
);

create table if not exists public.forge_ai_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_id uuid not null references public.forge_ai_risk_models(id),
  model_key text not null,
  model_version integer not null,
  scope_type text not null check (scope_type in ('location','division')),
  scope_id uuid not null,
  scope_name text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  score numeric check (score is null or (score >= 0 and score <= 100)),
  band text not null check (band in ('low','moderate','elevated','high','insufficient_data')),
  available_weight numeric not null,
  record_count integer not null default 0,
  trigger_type text not null check (trigger_type in ('manual','scheduled','event','system')),
  computed_by uuid references auth.users(id) on delete set null,
  computed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists forge_ai_risk_assessments_latest_idx
  on public.forge_ai_risk_assessments (organization_id, scope_type, scope_id, computed_at desc);

create table if not exists public.forge_ai_risk_indicators (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assessment_id uuid not null references public.forge_ai_risk_assessments(id) on delete cascade,
  factor_key text not null,
  label text not null,
  available boolean not null,
  raw_value numeric,
  normalized numeric check (normalized is null or (normalized >= 0 and normalized <= 1)),
  weight numeric not null,
  contribution numeric,
  detail text not null,
  evidence jsonb not null default '[]'::jsonb,
  unique (assessment_id, factor_key)
);

create index if not exists forge_ai_risk_indicators_org_idx
  on public.forge_ai_risk_indicators (organization_id, assessment_id);

-- ---------------------------------------------------------------------------
-- Alert routing. A route sends alerts at or above a severity, optionally for one rule, to the
-- members of a tenant role or to one user. Recipients still only receive alerts they could
-- open in AI Watch.
-- ---------------------------------------------------------------------------
create table if not exists public.forge_ai_alert_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_key text,
  min_severity text not null default 'high' check (min_severity in ('info','warning','high','critical')),
  recipient_type text not null check (recipient_type in ('tenant_role','user')),
  tenant_role_id uuid references public.forge_tenant_roles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  channel text not null default 'in_app' check (channel in ('in_app','email')),
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((recipient_type = 'tenant_role' and tenant_role_id is not null and user_id is null)
      or (recipient_type = 'user' and user_id is not null and tenant_role_id is null))
);

create index if not exists forge_ai_alert_routes_org_idx
  on public.forge_ai_alert_routes (organization_id, enabled);

alter table public.forge_ai_watch_alerts
  add column if not exists notified_at timestamptz,
  add column if not exists notification_event_id uuid references public.forge_notification_events(id) on delete set null,
  add column if not exists notified_recipients integer not null default 0;

-- Last domain event each tenant's Watch has reacted to.
create table if not exists public.forge_ai_watch_cursors (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_event_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Incidents did not publish domain events; submission now does, so Watch reacts within one cycle.
create or replace function public.forge_incident_submitted_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    insert into public.forge_domain_event_outbox (organization_id, event_type, resource_type, resource_id, payload)
    values (new.organization_id, 'incident.submitted', 'incident', new.id,
            jsonb_build_object('severity', new.severity, 'incident_type', new.incident_type, 'location_id', new.location_id));
  end if;
  return new;
end $$;

revoke all on function public.forge_incident_submitted_outbox() from public, anon, authenticated;

drop trigger if exists forge_incident_submitted_outbox on public.forge_incidents;
create trigger forge_incident_submitted_outbox
after insert or update of status on public.forge_incidents
for each row execute function public.forge_incident_submitted_outbox();

alter table public.forge_ai_risk_models enable row level security;
alter table public.forge_ai_risk_assessments enable row level security;
alter table public.forge_ai_risk_indicators enable row level security;
alter table public.forge_ai_alert_routes enable row level security;
alter table public.forge_ai_watch_cursors enable row level security;

revoke all on public.forge_ai_risk_models, public.forge_ai_risk_assessments, public.forge_ai_risk_indicators,
  public.forge_ai_alert_routes, public.forge_ai_watch_cursors from anon, authenticated;
grant all on public.forge_ai_risk_models, public.forge_ai_risk_assessments, public.forge_ai_risk_indicators,
  public.forge_ai_alert_routes, public.forge_ai_watch_cursors to service_role;
grant usage, select on sequence public.forge_ai_risk_indicators_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- New Watch rules
-- ---------------------------------------------------------------------------
insert into public.forge_ai_watch_rule_templates
(rule_key, name, description, category, target_type, required_permission_key, severity, default_config, sort_order)
values
  ('incident.serious_reported','Serious Incident Reported','Incidents rated serious, or involving an injury, reported in the last few days.','Incidents','incident','incidents.view','high','{"lookback_hours":72,"severities":["serious"],"include_injuries":true}'::jsonb,72),
  ('incident.recurring_type','Recurring Incident Type','The same type of incident repeating at one location within a short window.','Incidents','incident_pattern','incidents.view','high','{"window_days":30,"min_count":3}'::jsonb,74),
  ('incident.emerging_trend','Emerging Incident Trend','A location''s incident count in the last 30 days is well above its own prior 90-day rate.','Incidents','incident_trend','incidents.view','warning','{"window_days":30,"baseline_days":90,"min_count":3,"ratio":1.5}'::jsonb,76),
  ('inspection.failed','Failed Inspection Not Closed','Inspections with a Fail result that are not yet closed.','Inspections','inspection','inspections.view','high','{}'::jsonb,32),
  ('observation.high_risk_open','Open High-Risk Observation','Observations rated in a high risk band that are still open.','Observations','observation','observations.view','high','{"bands":["high","very_high","critical","extreme"]}'::jsonb,80),
  ('risk.review_overdue','Risk Review Overdue','Risk register entries past their next review date.','Risk Register','risk','risk_register.view','warning','{"days_overdue":0}'::jsonb,82),
  ('training.location_gap','Training Gap at a Location','A large share of a location''s training assignments are overdue.','Training','training_gap','training.view','warning','{"min_share":0.2,"min_overdue":3}'::jsonb,12),
  ('risk.indicator_elevated','Elevated Facility Risk Indicator','A facility or division risk indicator reached the Elevated or High band.','Risk Intelligence','risk_assessment','forge_ai.view_risk','high','{"bands":["elevated","high"]}'::jsonb,84)
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

-- Tenants already using Watch get the new rules switched on, like every earlier rule.
insert into public.forge_ai_watch_rules (organization_id, template_id, enabled, config)
select distinct r.organization_id, t.id, true, t.default_config
from public.forge_ai_watch_rules r
cross join public.forge_ai_watch_rule_templates t
where t.rule_key in ('incident.serious_reported','incident.recurring_type','incident.emerging_trend','inspection.failed',
                     'observation.high_risk_open','risk.review_overdue','training.location_gap','risk.indicator_elevated')
on conflict (organization_id, template_id) do nothing;

-- ---------------------------------------------------------------------------
-- Risk tool for the Risk and Monitoring agents
-- ---------------------------------------------------------------------------
insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('get_risk_indicators','Get Risk Indicators','Latest facility and division risk indicators with their contributing factors and evidence, within the user''s risk scope.','Risk Intelligence','forge_ai.view_risk','read',true,false,false,96)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  platform_enabled=true;
