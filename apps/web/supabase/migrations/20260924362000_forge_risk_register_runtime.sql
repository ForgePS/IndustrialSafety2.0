-- NX-02 Part C: Risk Register runtime (feature, permissions, tables, forms, nav).

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('risk_register','Risk Register','Hazard identification, inherent/residual risk assessment, controls, and treatment tracking.','Risk & Prevention','module','enabled',true,true,true,true,false,132)
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
  and f.feature_key='risk_register'
on conflict (plan_id, feature_id) do update set enabled=excluded.enabled;

create table if not exists public.forge_risk_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, risk_year)
);

create or replace function public.next_forge_risk_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
begin
  insert into public.forge_risk_sequences (organization_id, risk_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, risk_year)
  do update set next_value = public.forge_risk_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'RISK-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_risk_number(uuid) from public;
grant execute on function public.next_forge_risk_number(uuid) to service_role;

create table if not exists public.forge_risks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk_number text not null,
  title text not null,
  description text not null,
  hazard_description text,
  category_key text,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  work_area text,
  status text not null default 'draft'
    check (status in ('draft','open','under_assessment','in_treatment','monitoring','closed')),
  risk_matrix_id uuid references public.forge_risk_matrices(id) on delete set null,
  risk_matrix_version integer,
  inherent_likelihood_key text,
  inherent_severity_key text,
  inherent_score integer,
  inherent_band_key text,
  residual_likelihood_key text,
  residual_severity_key text,
  residual_score integer,
  residual_band_key text,
  owner_personnel_id uuid references public.forge_personnel(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  review_due_at timestamptz,
  next_review_at timestamptz,
  source_type text,
  source_reference text,
  closure_summary text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  row_version bigint not null default 1,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  unique (organization_id, risk_number)
);

create index if not exists forge_risks_org_status_idx
  on public.forge_risks(organization_id, status, updated_at desc);

create index if not exists forge_risks_org_location_idx
  on public.forge_risks(organization_id, location_id, updated_at desc);

create index if not exists forge_risks_org_division_idx
  on public.forge_risks(organization_id, division_id, updated_at desc);

create index if not exists forge_risks_org_band_idx
  on public.forge_risks(organization_id, inherent_band_key, status);

create index if not exists forge_risks_owner_idx
  on public.forge_risks(organization_id, owner_user_id, status);

create table if not exists public.forge_risk_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk_id uuid not null references public.forge_risks(id) on delete cascade,
  control_type text not null default 'administrative'
    check (control_type in ('elimination','substitution','engineering','administrative','ppe','other')),
  title text not null,
  description text,
  effectiveness_notes text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_risk_controls_risk_idx
  on public.forge_risk_controls(organization_id, risk_id, sort_order, created_at);

create table if not exists public.forge_risk_treatments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk_id uuid not null references public.forge_risks(id) on delete cascade,
  treatment_status text not null default 'planned'
    check (treatment_status in ('planned','in_progress','completed','canceled')),
  title text not null,
  description text,
  owner_personnel_id uuid references public.forge_personnel(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_risk_treatments_risk_idx
  on public.forge_risk_treatments(organization_id, risk_id, treatment_status, due_at);

create table if not exists public.forge_risk_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk_id uuid not null references public.forge_risks(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_risk_activity_idx
  on public.forge_risk_activity(organization_id, risk_id, created_at desc);

alter table public.forge_risk_sequences enable row level security;
alter table public.forge_risks enable row level security;
alter table public.forge_risk_controls enable row level security;
alter table public.forge_risk_treatments enable row level security;
alter table public.forge_risk_activity enable row level security;

-- Risks + activity: org members may SELECT (mutations via service_role + app authz), like Observations/CAPA.
drop policy if exists forge_risks_member_select on public.forge_risks;
create policy forge_risks_member_select
on public.forge_risks for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_risk_activity_member_select on public.forge_risk_activity;
create policy forge_risk_activity_member_select
on public.forge_risk_activity for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_risk_controls_member_select on public.forge_risk_controls;
create policy forge_risk_controls_member_select
on public.forge_risk_controls for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_risk_treatments_member_select on public.forge_risk_treatments;
create policy forge_risk_treatments_member_select
on public.forge_risk_treatments for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_risks to authenticated;
grant select on public.forge_risk_activity to authenticated;
grant select on public.forge_risk_controls to authenticated;
grant select on public.forge_risk_treatments to authenticated;

grant all on public.forge_risk_sequences to service_role;
grant all on public.forge_risks to service_role;
grant all on public.forge_risk_controls to service_role;
grant all on public.forge_risk_treatments to service_role;
grant all on public.forge_risk_activity to service_role;
grant usage, select on sequence public.forge_risk_activity_id_seq to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('risk_register.view','risk_register','View Risk Register','View risks within the assigned scope.','Risk Register','view',true,true,'own',false,false,false,'normal',10),
  ('risk_register.create','risk_register','Create Risks','Create and draft risk register entries.','Risk Register','create',true,true,'own',false,false,true,'normal',20),
  ('risk_register.edit','risk_register','Edit Risks','Edit risk details within the assigned scope.','Risk Register','edit',true,true,'own',false,false,true,'normal',30),
  ('risk_register.assess','risk_register','Assess Risks','Assess inherent and residual risk using the active matrix.','Risk Register','assess',true,true,'location',true,true,true,'sensitive',40),
  ('risk_register.treat','risk_register','Treat Risks','Add and update risk treatments and controls.','Risk Register','treat',true,true,'location',false,false,true,'normal',50),
  ('risk_register.review','risk_register','Review Risks','Review risk assessments and treatment plans.','Risk Register','review',true,true,'location',true,true,true,'sensitive',60),
  ('risk_register.approve','risk_register','Approve Risks','Approve risk assessments and residual risk acceptance.','Risk Register','approve',true,true,'organization',true,true,true,'sensitive',70),
  ('risk_register.assign','risk_register','Assign Risks','Assign risk ownership.','Risk Register','assign',true,true,'location',false,false,true,'normal',80),
  ('risk_register.close','risk_register','Close Risks','Close risks with a documented closure summary.','Risk Register','close',true,true,'organization',true,true,true,'sensitive',90),
  ('risk_register.archive','risk_register','Archive Risks','Archive closed risks.','Risk Register','archive',true,true,'organization',true,true,true,'sensitive',100)
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
  'risk_register.view','risk_register.create','risk_register.edit'
)
where rt.template_key='standard-user'
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'risk_register.view','risk_register.create','risk_register.edit',
  'risk_register.assess','risk_register.treat','risk_register.review','risk_register.assign'
)
where rt.template_key='supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key like 'risk_register.%'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'risk_register.view','risk_register.create','risk_register.edit'
)
where r.role_key='employee'
on conflict (role_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'risk_register.view','risk_register.create','risk_register.edit',
  'risk_register.assess','risk_register.treat','risk_register.review','risk_register.assign'
)
where r.role_key in ('supervisor','location-administrator')
on conflict (role_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key like 'risk_register.%'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Risk Register',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('risk_register.status','Risk Status','Risk register lifecycle status.',141,false),
    ('risk_register.category','Risk Category','Hazard / risk category classification.',142,true),
    ('risk_register.control_type','Control Type','Hierarchy of controls classification.',143,false),
    ('risk_register.treatment_status','Treatment Status','Risk treatment progress status.',144,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='risk_register'
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
    ('risk_register.status','draft','Draft','Risk entry is being prepared.',10),
    ('risk_register.status','open','Open','Risk is open and requires assessment or ownership.',20),
    ('risk_register.status','under_assessment','Under Assessment','Inherent and residual risk are being assessed.',30),
    ('risk_register.status','in_treatment','In Treatment','Treatments and controls are being implemented.',40),
    ('risk_register.status','monitoring','Monitoring','Residual risk is accepted and under periodic review.',50),
    ('risk_register.status','closed','Closed','Risk is closed with history preserved.',60),

    ('risk_register.category','physical','Physical','Physical hazard (struck-by, caught-in, falls, etc.).',10),
    ('risk_register.category','chemical','Chemical','Chemical exposure or process chemical hazard.',20),
    ('risk_register.category','biological','Biological','Biological agent or pathogen exposure.',30),
    ('risk_register.category','ergonomic','Ergonomic','Ergonomic / musculoskeletal risk.',40),
    ('risk_register.category','electrical','Electrical','Electrical energy hazard.',50),
    ('risk_register.category','fire_explosion','Fire / Explosion','Fire, explosion, or combustible dust hazard.',60),
    ('risk_register.category','process_safety','Process Safety','Process safety / loss-of-containment risk.',70),
    ('risk_register.category','environmental','Environmental','Environmental release or impact risk.',80),
    ('risk_register.category','psychosocial','Psychosocial','Psychosocial / workplace stress risk.',90),
    ('risk_register.category','other','Other','Other risk category.',100),

    ('risk_register.control_type','elimination','Elimination','Remove the hazard entirely.',10),
    ('risk_register.control_type','substitution','Substitution','Replace with a less hazardous alternative.',20),
    ('risk_register.control_type','engineering','Engineering','Engineering control (guards, ventilation, interlocks).',30),
    ('risk_register.control_type','administrative','Administrative','Procedures, training, scheduling, permits.',40),
    ('risk_register.control_type','ppe','PPE','Personal protective equipment.',50),
    ('risk_register.control_type','other','Other','Other control type.',60),

    ('risk_register.treatment_status','planned','Planned','Treatment is planned but not started.',10),
    ('risk_register.treatment_status','in_progress','In Progress','Treatment work is underway.',20),
    ('risk_register.treatment_status','completed','Completed','Treatment has been completed.',30),
    ('risk_register.treatment_status','canceled','Canceled','Treatment was canceled with history preserved.',40)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  'risk_register.risk',
  f.id,
  'Risk Register Entry',
  'Identify hazards, assess inherent and residual risk, and track controls and treatments.',
  'Risk Register',
  'record',
  'Save Risk',
  'Back',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  710
from public.forge_feature_registry f
where f.feature_key='risk_register'
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
    ('title','Title','Short summary of the risk.','Enter risk title','text',null,'identity','Risk',10,'full',true,false,false,false),
    ('description','Description','Describe the risk and exposure context.','Describe the risk','textarea',null,'identity','Risk',20,'full',true,false,false,false),
    ('hazard_description','Hazard Description','Describe the specific hazard.','Describe the hazard','textarea',null,'identity','Risk',30,'full',false,true,true,false),
    ('category_key','Category','Hazard / risk category.',null,'select','risk_register.category','classification','Classification',40,'half',false,true,true,true),
    ('status','Status','Risk lifecycle status.',null,'select','risk_register.status','classification','Classification',50,'half',true,false,false,true),
    ('work_area','Work Area','Specific work area or equipment zone.','Example: Line 3 / Bay 12','text',null,'details','Details',60,'half',false,true,true,false),
    ('location_id','Location','Location associated with this risk.',null,'location',null,'details','Details',70,'half',false,true,true,false),
    ('division_id','Division','Division associated with this risk.',null,'division',null,'details','Details',80,'half',false,true,true,false),
    ('owner_personnel_id','Risk Owner','Person responsible for this risk.',null,'person',null,'assignment','Assignment',90,'half',false,true,true,false),
    ('review_due_at','Review Due','When the next formal review is due.',null,'datetime',null,'assignment','Assignment',100,'half',false,true,true,false),
    ('source_type','Source Type','Originating workflow or source.','Example: observation','text',null,'source','Source',110,'half',false,true,true,false),
    ('source_reference','Source Reference','Reference number or identifier from the source.','Example: OBS-2026-000001','text',null,'source','Source',120,'half',false,true,true,false),
    ('inherent_likelihood_key','Inherent Likelihood','Inherent likelihood key from the active risk matrix.','Example: likely','text',null,'inherent','Inherent Risk',130,'half',false,true,true,false),
    ('inherent_severity_key','Inherent Severity','Inherent severity key from the active risk matrix.','Example: major','text',null,'inherent','Inherent Risk',140,'half',false,true,true,false),
    ('residual_likelihood_key','Residual Likelihood','Residual likelihood after controls.','Example: unlikely','text',null,'residual','Residual Risk',150,'half',false,true,true,false),
    ('residual_severity_key','Residual Severity','Residual severity after controls.','Example: moderate','text',null,'residual','Residual Risk',160,'half',false,true,true,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='risk_register.risk'
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
  and fd.form_key='risk_register.risk'
  and ff.field_key in ('title','description','status');

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
  'nav.risk_register',
  f.id,
  'menu',
  'Risk Register',
  'Risk Register',
  'Hazard identification, risk assessment, controls, and treatments.',
  '/risk-register',
  'risk_register',
  'Navigation',
  132,
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
  '{"route_live":true,"required_permission":"risk_register.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key='risk_register'
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
