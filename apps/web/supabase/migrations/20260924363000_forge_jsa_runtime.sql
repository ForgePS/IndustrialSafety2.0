-- NX-02 Part D: JSA/JHA runtime (feature, permissions, tables, forms, nav).

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('jsa_jha','JSA / JHA','Job safety / hazard analysis authoring, step hazards, controls, revisions, and field execution acknowledgment.','People & Training','module','enabled',true,true,true,true,false,125)
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
  and f.feature_key='jsa_jha'
on conflict (plan_id, feature_id) do update set enabled=excluded.enabled;

create table if not exists public.forge_jsa_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, jsa_year)
);

create or replace function public.next_forge_jsa_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
begin
  insert into public.forge_jsa_sequences (organization_id, jsa_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, jsa_year)
  do update set next_value = public.forge_jsa_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'JSA-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_jsa_number(uuid) from public;
grant execute on function public.next_forge_jsa_number(uuid) to service_role;

create table if not exists public.forge_jsa_execution_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, execution_year)
);

create or replace function public.next_forge_jsa_execution_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
begin
  insert into public.forge_jsa_execution_sequences (organization_id, execution_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, execution_year)
  do update set next_value = public.forge_jsa_execution_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'JSAEX-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_jsa_execution_number(uuid) from public;
grant execute on function public.next_forge_jsa_execution_number(uuid) to service_role;

create table if not exists public.forge_jsas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_number text not null,
  title text not null,
  description text,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  work_area text,
  job_title text,
  task_name text,
  status text not null default 'draft'
    check (status in ('draft','in_review','approved','active','superseded','retired')),
  version integer not null default 1 check (version > 0),
  parent_jsa_id uuid references public.forge_jsas(id) on delete set null,
  risk_matrix_id uuid references public.forge_risk_matrices(id) on delete set null,
  risk_matrix_version integer,
  prepared_by_personnel_id uuid references public.forge_personnel(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  effective_at timestamptz,
  review_due_at timestamptz,
  row_version bigint not null default 1,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  unique (organization_id, jsa_number)
);

create index if not exists forge_jsas_org_status_idx
  on public.forge_jsas(organization_id, status, updated_at desc);

create index if not exists forge_jsas_org_location_idx
  on public.forge_jsas(organization_id, location_id, updated_at desc);

create index if not exists forge_jsas_org_division_idx
  on public.forge_jsas(organization_id, division_id, updated_at desc);

create index if not exists forge_jsas_parent_idx
  on public.forge_jsas(organization_id, parent_jsa_id);

create table if not exists public.forge_jsa_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  title text not null,
  description text,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, jsa_id, step_number)
);

create index if not exists forge_jsa_steps_jsa_idx
  on public.forge_jsa_steps(organization_id, jsa_id, sort_order, step_number);

create table if not exists public.forge_jsa_hazards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  step_id uuid not null references public.forge_jsa_steps(id) on delete cascade,
  hazard_description text not null,
  category_key text,
  likelihood_key text,
  severity_key text,
  risk_score integer,
  risk_band_key text,
  residual_likelihood_key text,
  residual_severity_key text,
  residual_score integer,
  residual_band_key text,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_jsa_hazards_jsa_idx
  on public.forge_jsa_hazards(organization_id, jsa_id, sort_order, created_at);

create index if not exists forge_jsa_hazards_step_idx
  on public.forge_jsa_hazards(organization_id, step_id, sort_order);

create table if not exists public.forge_jsa_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  hazard_id uuid not null references public.forge_jsa_hazards(id) on delete cascade,
  control_type text not null default 'administrative'
    check (control_type in ('elimination','substitution','engineering','administrative','ppe','other')),
  title text not null,
  description text,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_jsa_controls_hazard_idx
  on public.forge_jsa_controls(organization_id, hazard_id, sort_order, created_at);

create index if not exists forge_jsa_controls_jsa_idx
  on public.forge_jsa_controls(organization_id, jsa_id, sort_order);

create table if not exists public.forge_jsa_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  version_jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  version integer not null check (version > 0),
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, jsa_id, version),
  unique (organization_id, version_jsa_id)
);

create index if not exists forge_jsa_revisions_root_idx
  on public.forge_jsa_revisions(organization_id, jsa_id, version desc);

create table if not exists public.forge_jsa_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  execution_number text not null,
  status text not null default 'planned'
    check (status in ('planned','in_progress','completed','canceled')),
  started_at timestamptz,
  completed_at timestamptz,
  location_id uuid references public.locations(id) on delete set null,
  lead_personnel_id uuid references public.forge_personnel(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, execution_number)
);

create index if not exists forge_jsa_executions_jsa_idx
  on public.forge_jsa_executions(organization_id, jsa_id, created_at desc);

create index if not exists forge_jsa_executions_status_idx
  on public.forge_jsa_executions(organization_id, status, created_at desc);

create table if not exists public.forge_jsa_execution_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid not null references public.forge_jsa_executions(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'crew'
    check (role in ('lead','crew')),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, execution_id, personnel_id)
);

create index if not exists forge_jsa_execution_participants_exec_idx
  on public.forge_jsa_execution_participants(organization_id, execution_id, role);

create table if not exists public.forge_jsa_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  jsa_id uuid not null references public.forge_jsas(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_jsa_activity_idx
  on public.forge_jsa_activity(organization_id, jsa_id, created_at desc);

alter table public.forge_jsa_sequences enable row level security;
alter table public.forge_jsa_execution_sequences enable row level security;
alter table public.forge_jsas enable row level security;
alter table public.forge_jsa_steps enable row level security;
alter table public.forge_jsa_hazards enable row level security;
alter table public.forge_jsa_controls enable row level security;
alter table public.forge_jsa_revisions enable row level security;
alter table public.forge_jsa_executions enable row level security;
alter table public.forge_jsa_execution_participants enable row level security;
alter table public.forge_jsa_activity enable row level security;

-- JSAs + children: org members may SELECT; mutations via service_role + app authz.
drop policy if exists forge_jsas_member_select on public.forge_jsas;
create policy forge_jsas_member_select
on public.forge_jsas for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_steps_member_select on public.forge_jsa_steps;
create policy forge_jsa_steps_member_select
on public.forge_jsa_steps for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_hazards_member_select on public.forge_jsa_hazards;
create policy forge_jsa_hazards_member_select
on public.forge_jsa_hazards for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_controls_member_select on public.forge_jsa_controls;
create policy forge_jsa_controls_member_select
on public.forge_jsa_controls for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_revisions_member_select on public.forge_jsa_revisions;
create policy forge_jsa_revisions_member_select
on public.forge_jsa_revisions for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_executions_member_select on public.forge_jsa_executions;
create policy forge_jsa_executions_member_select
on public.forge_jsa_executions for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_execution_participants_member_select on public.forge_jsa_execution_participants;
create policy forge_jsa_execution_participants_member_select
on public.forge_jsa_execution_participants for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_jsa_activity_member_select on public.forge_jsa_activity;
create policy forge_jsa_activity_member_select
on public.forge_jsa_activity for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_jsas to authenticated;
grant select on public.forge_jsa_steps to authenticated;
grant select on public.forge_jsa_hazards to authenticated;
grant select on public.forge_jsa_controls to authenticated;
grant select on public.forge_jsa_revisions to authenticated;
grant select on public.forge_jsa_executions to authenticated;
grant select on public.forge_jsa_execution_participants to authenticated;
grant select on public.forge_jsa_activity to authenticated;

grant all on public.forge_jsa_sequences to service_role;
grant all on public.forge_jsa_execution_sequences to service_role;
grant all on public.forge_jsas to service_role;
grant all on public.forge_jsa_steps to service_role;
grant all on public.forge_jsa_hazards to service_role;
grant all on public.forge_jsa_controls to service_role;
grant all on public.forge_jsa_revisions to service_role;
grant all on public.forge_jsa_executions to service_role;
grant all on public.forge_jsa_execution_participants to service_role;
grant all on public.forge_jsa_activity to service_role;
grant usage, select on sequence public.forge_jsa_activity_id_seq to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('jsa_jha.view','jsa_jha','View JSAs','View job safety analyses within the assigned scope.','JSA / JHA','view',true,true,'own',false,false,false,'normal',10),
  ('jsa_jha.create','jsa_jha','Create JSAs','Create and draft job safety analyses.','JSA / JHA','create',true,true,'own',false,false,true,'normal',20),
  ('jsa_jha.edit','jsa_jha','Edit JSAs','Edit JSA details, steps, hazards, and controls.','JSA / JHA','edit',true,true,'own',false,false,true,'normal',30),
  ('jsa_jha.submit','jsa_jha','Submit JSAs','Submit JSAs for review.','JSA / JHA','submit',true,true,'own',false,false,true,'normal',40),
  ('jsa_jha.approve','jsa_jha','Approve JSAs','Approve JSAs for use.','JSA / JHA','approve',true,true,'organization',true,true,true,'sensitive',50),
  ('jsa_jha.acknowledge','jsa_jha','Acknowledge JSA Executions','Acknowledge participation in a JSA field execution.','JSA / JHA','acknowledge',true,true,'own',false,false,true,'normal',60),
  ('jsa_jha.execute','jsa_jha','Execute JSAs','Start and complete JSA field executions.','JSA / JHA','execute',true,true,'own',false,false,true,'normal',70),
  ('jsa_jha.assign','jsa_jha','Assign JSAs','Assign preparers and execution leads.','JSA / JHA','assign',true,true,'location',false,false,true,'normal',80),
  ('jsa_jha.close','jsa_jha','Close / Retire JSAs','Retire JSAs from active use.','JSA / JHA','close',true,true,'organization',true,true,true,'sensitive',90),
  ('jsa_jha.archive','jsa_jha','Archive JSAs','Archive retired JSAs.','JSA / JHA','archive',true,true,'organization',true,true,true,'sensitive',100)
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

-- Employee / standard-user: view, create, edit, submit, acknowledge, execute (scoped own)
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'jsa_jha.view','jsa_jha.create','jsa_jha.edit','jsa_jha.submit',
  'jsa_jha.acknowledge','jsa_jha.execute'
)
where rt.template_key='standard-user'
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'jsa_jha.view','jsa_jha.create','jsa_jha.edit','jsa_jha.submit',
  'jsa_jha.acknowledge','jsa_jha.execute','jsa_jha.assign'
)
where rt.template_key='supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key like 'jsa_jha.%'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'jsa_jha.view','jsa_jha.create','jsa_jha.edit','jsa_jha.submit',
  'jsa_jha.acknowledge','jsa_jha.execute'
)
where r.role_key='employee'
on conflict (role_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'jsa_jha.view','jsa_jha.create','jsa_jha.edit','jsa_jha.submit',
  'jsa_jha.acknowledge','jsa_jha.execute','jsa_jha.assign'
)
where r.role_key in ('supervisor','location-administrator')
on conflict (role_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key like 'jsa_jha.%'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'JSA / JHA',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('jsa_jha.status','JSA Status','Job safety analysis lifecycle status.',125,false),
    ('jsa_jha.hazard_category','Step Hazard Category','Hazard category for a JSA step hazard.',126,true),
    ('jsa_jha.control_type','Control Type','Hierarchy of controls classification.',127,false),
    ('jsa_jha.execution_status','Execution Status','JSA field execution progress status.',128,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='jsa_jha'
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
    ('jsa_jha.status','draft','Draft','JSA is being prepared.',10),
    ('jsa_jha.status','in_review','In Review','JSA is under review.',20),
    ('jsa_jha.status','approved','Approved','JSA has been approved.',30),
    ('jsa_jha.status','active','Active','JSA is active for field use.',40),
    ('jsa_jha.status','superseded','Superseded','Replaced by a newer revision.',50),
    ('jsa_jha.status','retired','Retired','JSA is retired from active use.',60),

    ('jsa_jha.hazard_category','physical','Physical','Physical hazard (struck-by, caught-in, falls, etc.).',10),
    ('jsa_jha.hazard_category','chemical','Chemical','Chemical exposure hazard.',20),
    ('jsa_jha.hazard_category','biological','Biological','Biological agent exposure.',30),
    ('jsa_jha.hazard_category','ergonomic','Ergonomic','Ergonomic / musculoskeletal hazard.',40),
    ('jsa_jha.hazard_category','electrical','Electrical','Electrical energy hazard.',50),
    ('jsa_jha.hazard_category','fire_explosion','Fire / Explosion','Fire, explosion, or combustible dust.',60),
    ('jsa_jha.hazard_category','environmental','Environmental','Environmental release or impact.',70),
    ('jsa_jha.hazard_category','other','Other','Other hazard category.',80),

    ('jsa_jha.control_type','elimination','Elimination','Remove the hazard entirely.',10),
    ('jsa_jha.control_type','substitution','Substitution','Replace with a less hazardous alternative.',20),
    ('jsa_jha.control_type','engineering','Engineering','Engineering control (guards, ventilation, interlocks).',30),
    ('jsa_jha.control_type','administrative','Administrative','Procedures, training, scheduling, permits.',40),
    ('jsa_jha.control_type','ppe','PPE','Personal protective equipment.',50),
    ('jsa_jha.control_type','other','Other','Other control type.',60),

    ('jsa_jha.execution_status','planned','Planned','Execution is planned but not started.',10),
    ('jsa_jha.execution_status','in_progress','In Progress','Execution is underway.',20),
    ('jsa_jha.execution_status','completed','Completed','Execution has been completed.',30),
    ('jsa_jha.execution_status','canceled','Canceled','Execution was canceled with history preserved.',40)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  'jsa_jha.jsa',
  f.id,
  'Job Safety Analysis',
  'Author a JSA/JHA with job steps, hazards, controls, and revision tracking.',
  'JSA / JHA',
  'record',
  'Save JSA',
  'Back',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  720
from public.forge_feature_registry f
where f.feature_key='jsa_jha'
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
    ('title','Title','Short summary of the job or task.','Enter JSA title','text',null,'identity','JSA',10,'full',true,false,false,false),
    ('description','Description','Describe the job scope and context.','Describe the job','textarea',null,'identity','JSA',20,'full',false,true,true,false),
    ('job_title','Job Title','Job or role this JSA covers.','Example: Millwright','text',null,'identity','JSA',30,'half',false,true,true,false),
    ('task_name','Task Name','Specific task covered by this JSA.','Example: Conveyor belt change','text',null,'identity','JSA',40,'half',false,true,true,false),
    ('status','Status','JSA lifecycle status.',null,'select','jsa_jha.status','classification','Classification',50,'half',true,false,false,true),
    ('work_area','Work Area','Specific work area or equipment zone.','Example: Line 3 / Bay 12','text',null,'details','Details',60,'half',false,true,true,false),
    ('location_id','Location','Location associated with this JSA.',null,'location',null,'details','Details',70,'half',false,true,true,false),
    ('division_id','Division','Division associated with this JSA.',null,'division',null,'details','Details',80,'half',false,true,true,false),
    ('prepared_by_personnel_id','Prepared By','Person who prepared this JSA.',null,'person',null,'assignment','Assignment',90,'half',false,true,true,false),
    ('effective_at','Effective','When this JSA becomes effective.',null,'datetime',null,'assignment','Assignment',100,'half',false,true,true,false),
    ('review_due_at','Review Due','When the next formal review is due.',null,'datetime',null,'assignment','Assignment',110,'half',false,true,true,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='jsa_jha.jsa'
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
  and fd.form_key='jsa_jha.jsa'
  and ff.field_key in ('title','status');

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
  'nav.jsa_jha',
  f.id,
  'menu',
  'JSA / JHA',
  'JSA / JHA',
  'Job safety analyses, hazards, controls, revisions, and field executions.',
  '/jsas',
  'jsa_jha',
  'Navigation',
  125,
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
  '{"route_live":true,"required_permission":"jsa_jha.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key='jsa_jha'
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
