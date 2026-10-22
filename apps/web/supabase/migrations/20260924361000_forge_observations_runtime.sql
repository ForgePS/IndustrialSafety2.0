-- NX-02 Part B: Observations runtime (feature, permissions, tables, forms, nav).
-- Workflow definition seeds live in a later migration (24370000+). Status constraints match planned states.

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('observations','Observations','Safe/unsafe observations, near-miss capture, anonymous reporting, risk assessment and CAPA generation.','Risk & Prevention','module','enabled',true,true,true,true,false,131)
on conflict (feature_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  platform_state=excluded.platform_state,
  tenant_configurable=excluded.tenant_configurable,
  location_configurable=excluded.location_configurable,
  user_configurable=excluded.user_configurable,
  requires_entitlement=excluded.requires_entitlement,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo','enterprise')
  and f.feature_key='observations'
on conflict (plan_id, feature_id) do update set enabled=excluded.enabled;

create table if not exists public.forge_observation_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  observation_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, observation_year)
);

create or replace function public.next_forge_observation_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
begin
  insert into public.forge_observation_sequences (organization_id, observation_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, observation_year)
  do update set next_value = public.forge_observation_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'OBS-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_observation_number(uuid) from public;
grant execute on function public.next_forge_observation_number(uuid) to service_role;

create table if not exists public.forge_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  observation_number text not null,
  status text not null default 'draft'
    check (status in ('draft','submitted','review','action_required','no_action','closed')),
  observation_type text not null default 'UNSAFE'
    check (observation_type in ('SAFE','UNSAFE','IMPROVEMENT','NEAR_MISS')),
  category_key text,
  work_area text,
  title text not null,
  description text not null,
  occurred_at timestamptz not null default now(),
  submitted_at timestamptz,
  reporting_mode text not null default 'named'
    check (reporting_mode in ('named','anonymous')),
  immediate_action text,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  risk_matrix_id uuid references public.forge_risk_matrices(id) on delete set null,
  risk_matrix_version integer,
  initial_likelihood_key text,
  initial_severity_key text,
  initial_risk_score integer,
  initial_risk_band_key text,
  -- Named reporters only; anonymous identity lives in forge_observation_reporters.
  reported_by_user_id uuid references auth.users(id) on delete set null,
  reported_by_personnel_id uuid references public.forge_personnel(id) on delete set null,
  assigned_to_personnel_id uuid references public.forge_personnel(id) on delete set null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  closure_summary text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, observation_number)
);

create index if not exists forge_observations_org_status_idx
  on public.forge_observations(organization_id, status, occurred_at desc);

create index if not exists forge_observations_org_type_idx
  on public.forge_observations(organization_id, observation_type, occurred_at desc);

create index if not exists forge_observations_org_location_idx
  on public.forge_observations(organization_id, location_id, occurred_at desc);

create index if not exists forge_observations_org_division_idx
  on public.forge_observations(organization_id, division_id, occurred_at desc);

create index if not exists forge_observations_assignee_idx
  on public.forge_observations(organization_id, assigned_to_user_id, status);

create index if not exists forge_observations_risk_band_idx
  on public.forge_observations(organization_id, initial_risk_band_key, status);

-- Restricted identity store for anonymous observations. Service-role only.
create table if not exists public.forge_observation_reporters (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.forge_observations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (observation_id)
);

create index if not exists forge_observation_reporters_org_idx
  on public.forge_observation_reporters(organization_id, auth_user_id);

create table if not exists public.forge_observation_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  observation_id uuid not null references public.forge_observations(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_observation_activity_idx
  on public.forge_observation_activity(organization_id, observation_id, created_at desc);

alter table public.forge_observation_sequences enable row level security;
alter table public.forge_observations enable row level security;
alter table public.forge_observation_reporters enable row level security;
alter table public.forge_observation_activity enable row level security;

-- Observations + activity: org members may SELECT (mutations via service_role + app authz), like CAPA.
drop policy if exists forge_observations_member_select on public.forge_observations;
create policy forge_observations_member_select
on public.forge_observations for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_observation_activity_member_select on public.forge_observation_activity;
create policy forge_observation_activity_member_select
on public.forge_observation_activity for select to authenticated
using (public.is_org_member(organization_id));

-- Reporters: no authenticated policies — service_role only.
grant select on public.forge_observations to authenticated;
grant select on public.forge_observation_activity to authenticated;

grant all on public.forge_observation_sequences to service_role;
grant all on public.forge_observations to service_role;
grant all on public.forge_observation_reporters to service_role;
grant all on public.forge_observation_activity to service_role;
grant usage, select on sequence public.forge_observation_activity_id_seq to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('observations.view','observations','View Observations','View safety observations within the assigned scope.','Observations','view',true,true,'own',false,false,false,'normal',10),
  ('observations.create','observations','Create Observations','Create and draft safety observations.','Observations','create',true,true,'own',false,false,true,'normal',20),
  ('observations.edit','observations','Edit Observations','Edit observation details within the assigned scope.','Observations','edit',true,true,'own',false,false,true,'normal',30),
  ('observations.submit','observations','Submit Observations','Submit observations for review.','Observations','submit',true,true,'own',false,true,true,'normal',40),
  ('observations.review','observations','Review Observations','Review submitted observations, assess risk, and route for action.','Observations','review',true,true,'location',true,true,true,'sensitive',50),
  ('observations.assign','observations','Assign Observations','Assign observation review ownership.','Observations','assign',true,true,'location',false,false,true,'normal',60),
  ('observations.close','observations','Close Observations','Close observations with a documented closure summary.','Observations','close',true,true,'organization',true,true,true,'sensitive',70),
  ('observations.archive','observations','Archive Observations','Archive closed observations.','Observations','archive',true,true,'organization',true,true,true,'sensitive',80),
  ('observations.view_reporter_identity','observations','View Observation Reporter Identity','View the real identity behind anonymous observations.','Observations','view_reporter_identity',true,true,'organization',true,true,true,'sensitive',90)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
  name=excluded.name,
  description=excluded.description,
  permission_group=excluded.permission_group,
  action=excluded.action,
  tenant_assignable=true,
  tenant_can_scope=true,
  default_scope=excluded.default_scope,
  is_sensitive=excluded.is_sensitive,
  requires_confirmation=excluded.requires_confirmation,
  audit_use=excluded.audit_use,
  danger_level=excluded.danger_level,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'observations.view','observations.create','observations.edit','observations.submit'
)
where rt.template_key='standard-user'
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'observations.view','observations.create','observations.edit',
  'observations.submit','observations.review','observations.assign'
)
where rt.template_key='supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key like 'observations.%'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'observations.view','observations.create','observations.edit','observations.submit'
)
where r.role_key='employee'
on conflict (role_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'observations.view','observations.create','observations.edit',
  'observations.submit','observations.review','observations.assign'
)
where r.role_key in ('supervisor','location-administrator')
on conflict (role_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key like 'observations.%'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Observations',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('observations.status','Observation Status','Observation workflow status.',131,false),
    ('observations.type','Observation Type','Safe, unsafe, improvement, or near-miss classification.',132,false),
    ('observations.category','Observation Category','Hazard / behavior / condition category.',133,true),
    ('observations.reporting_mode','Reporting Mode','Named or anonymous reporting.',134,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='observations'
on conflict (lookup_key) do update
set
  name=excluded.name,
  description=excluded.description,
  feature_id=excluded.feature_id,
  category=excluded.category,
  sort_order=excluded.sort_order,
  tenant_can_add_options=excluded.tenant_can_add_options,
  updated_at=now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('observations.status','draft','Draft','Observation is being prepared.',10),
    ('observations.status','submitted','Submitted','Observation has been submitted for review.',20),
    ('observations.status','review','In Review','Observation is under supervisory review.',30),
    ('observations.status','action_required','Action Required','Corrective or risk action is required.',40),
    ('observations.status','no_action','No Action','Review determined no further action is required.',50),
    ('observations.status','closed','Closed','Observation is closed with history preserved.',60),

    ('observations.type','SAFE','Safe','Positive / safe behavior or condition recognition.',10),
    ('observations.type','UNSAFE','Unsafe','Unsafe act or condition.',20),
    ('observations.type','IMPROVEMENT','Improvement','Opportunity for safety improvement.',30),
    ('observations.type','NEAR_MISS','Near Miss','Event that could have resulted in injury or damage.',40),

    ('observations.category','unsafe_act','Unsafe Act','Behavior-based hazard.',10),
    ('observations.category','unsafe_condition','Unsafe Condition','Workplace condition hazard.',20),
    ('observations.category','positive_recognition','Positive Recognition','Safe behavior recognition.',30),
    ('observations.category','near_miss','Near Miss','Near-miss event category.',40),
    ('observations.category','environmental','Environmental','Environmental hazard or spill potential.',50),
    ('observations.category','ppe','PPE','Personal protective equipment issue.',60),
    ('observations.category','housekeeping','Housekeeping','Housekeeping or orderliness issue.',70),
    ('observations.category','process_safety','Process Safety','Process safety related observation.',80),
    ('observations.category','other','Other','Other observation category.',90),

    ('observations.reporting_mode','named','Named','Reporter identity is visible to authorized viewers.',10),
    ('observations.reporting_mode','anonymous','Anonymous','Reporter identity is hidden from ordinary viewers.',20)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  'observations.observation',
  f.id,
  'Safety Observation',
  'Capture safe/unsafe observations, near misses, and improvement opportunities with optional anonymous reporting and risk assessment.',
  'Observations',
  'record',
  'Save Observation',
  'Back',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  705
from public.forge_feature_registry f
where f.feature_key='observations'
on conflict (form_key) do update
set name=excluded.name, description=excluded.description, feature_id=excluded.feature_id, updated_at=now();

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select
  fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id,
  v.section_key, v.section_label, v.sort_order, v.width, v.required,
  v.can_hide, true, v.can_required, false, v.can_lookup
from (
  values
    ('title','Title','Short summary of the observation.','Enter observation title','text',null,'identity','Observation',10,'full',true,false,false,false),
    ('description','Description','Describe what was observed.','Describe the observation','textarea',null,'identity','Observation',20,'full',true,false,false,false),
    ('observation_type','Observation Type','Safe, unsafe, improvement, or near-miss.',null,'select','observations.type','classification','Classification',30,'half',true,false,false,true),
    ('category_key','Category','Hazard / behavior / condition category.',null,'select','observations.category','classification','Classification',40,'half',false,true,true,true),
    ('reporting_mode','Reporting Mode','Named or anonymous. Anonymous hides your identity from ordinary viewers.',null,'select','observations.reporting_mode','classification','Classification',50,'half',true,false,false,true),
    ('occurred_at','Occurred At','When the observation occurred.',null,'datetime',null,'details','Details',60,'half',true,false,false,false),
    ('work_area','Work Area','Specific work area or equipment zone.','Example: Line 3 / Bay 12','text',null,'details','Details',70,'half',false,true,true,false),
    ('location_id','Location','Location associated with this observation.',null,'location',null,'details','Details',80,'half',false,true,true,false),
    ('division_id','Division','Division associated with this observation.',null,'division',null,'details','Details',90,'half',false,true,true,false),
    ('immediate_action','Immediate Action','Any immediate action taken.','Describe immediate action','textarea',null,'details','Details',100,'full',false,true,true,false),
    ('assigned_to_personnel_id','Assigned Reviewer','Person responsible for reviewing this observation.',null,'person',null,'assignment','Assignment',110,'half',false,true,true,false),
    ('initial_likelihood_key','Likelihood','Initial likelihood key from the active risk matrix (optional).','Example: likely','text',null,'risk','Risk Assessment',120,'half',false,true,true,false),
    ('initial_severity_key','Severity','Initial severity key from the active risk matrix (optional).','Example: major','text',null,'risk','Risk Assessment',130,'half',false,true,true,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='observations.observation'
left join public.forge_lookup_definitions ld on ld.lookup_key=v.lookup_key
on conflict (form_id, field_key) do update
set
  label=excluded.label,
  help_text=excluded.help_text,
  placeholder=excluded.placeholder,
  field_type=excluded.field_type,
  lookup_id=excluded.lookup_id,
  section_key=excluded.section_key,
  section_label=excluded.section_label,
  sort_order=excluded.sort_order,
  width=excluded.width,
  is_required=excluded.is_required,
  can_hide=excluded.can_hide,
  can_change_required=excluded.can_change_required,
  can_change_lookup=excluded.can_change_lookup,
  updated_at=now();

update public.forge_form_fields ff
set can_hide=false, can_change_required=false, can_change_input_type=false, updated_at=now()
from public.forge_form_definitions fd
where ff.form_id=fd.id
  and fd.form_key='observations.observation'
  and ff.field_key in ('title','description','observation_type','reporting_mode','occurred_at');

insert into public.forge_experience_elements (
  element_key,
  feature_id,
  element_type,
  name,
  default_label,
  default_description,
  route,
  component_key,
  category,
  sort_order,
  platform_enabled,
  protection_level,
  tenant_edit_mode,
  location_edit_mode,
  user_edit_mode,
  can_hide,
  can_rename,
  can_reorder,
  can_duplicate,
  can_delete,
  settings
)
select
  'nav.observations',
  f.id,
  'menu',
  'Observations',
  'Observations',
  'Safety observations, near misses, anonymous reporting and risk assessment.',
  '/observations',
  'observations',
  'Navigation',
  131,
  true,
  'configurable',
  'presentation',
  'presentation',
  'preference',
  true,
  true,
  true,
  false,
  false,
  '{"route_live":true,"required_permission":"observations.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key='observations'
on conflict (element_key) do update
set
  feature_id=excluded.feature_id,
  default_label=excluded.default_label,
  default_description=excluded.default_description,
  route=excluded.route,
  component_key=excluded.component_key,
  sort_order=excluded.sort_order,
  platform_enabled=excluded.platform_enabled,
  settings=excluded.settings,
  updated_at=now();
