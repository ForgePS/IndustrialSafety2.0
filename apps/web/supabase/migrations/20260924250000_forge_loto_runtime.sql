-- Forge Industrial Safety 2.0 Lockout / Tagout runtime.
-- Equipment-specific energy-control procedures, energy sources, ordered steps,
-- approvals, periodic reviews, field-use logs, revision history, and Creator-driven configuration.

create table if not exists public.forge_loto_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id)
);

create or replace function public.next_forge_loto_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_loto_sequences (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id)
  do update set next_value = public.forge_loto_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'LOTO-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_loto_number(uuid) from public;
grant execute on function public.next_forge_loto_number(uuid) to service_role;

create table if not exists public.forge_loto_procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_number text not null,
  asset_id uuid not null references public.forge_assets(id) on delete restrict,
  title text not null,
  description text,
  purpose text,
  scope_text text,
  status text not null default 'draft'
    check (status in ('draft','review','approved','retired')),
  revision_number integer not null default 1 check (revision_number > 0),
  effective_date date,
  next_review_date date,
  special_precautions text,
  required_ppe text,
  authorized_employee_notes text,
  affected_employee_notes text,
  shutdown_notes text,
  restoration_notes text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  retired_at timestamptz,
  retired_by uuid references auth.users(id) on delete set null,
  retirement_reason text,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, procedure_number)
);

create index if not exists forge_loto_procedures_asset_idx
  on public.forge_loto_procedures(organization_id, asset_id, status, title);

create index if not exists forge_loto_procedures_review_idx
  on public.forge_loto_procedures(organization_id, next_review_date, status);

create table if not exists public.forge_loto_energy_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null references public.forge_loto_procedures(id) on delete cascade,
  energy_type text not null,
  source_name text not null,
  magnitude text,
  isolation_location text not null,
  isolation_device text,
  lockout_device text,
  stored_energy_method text,
  verification_method text not null,
  notes text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_loto_energy_sources_procedure_idx
  on public.forge_loto_energy_sources(organization_id, procedure_id, sort_order);

create table if not exists public.forge_loto_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null references public.forge_loto_procedures(id) on delete cascade,
  step_type text not null,
  title text not null,
  instructions text not null,
  warning_text text,
  verification_required boolean not null default false,
  verification_instructions text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_loto_steps_procedure_idx
  on public.forge_loto_steps(organization_id, procedure_id, sort_order);

create table if not exists public.forge_loto_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null references public.forge_loto_procedures(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_result text not null
    check (review_result in ('satisfactory','needs_revision','suspended')),
  employee_observed text,
  deviations_found text,
  corrective_actions text,
  notes text,
  next_review_date date,
  created_at timestamptz not null default now()
);

create index if not exists forge_loto_reviews_procedure_idx
  on public.forge_loto_reviews(organization_id, procedure_id, reviewed_at desc);

create table if not exists public.forge_loto_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null references public.forge_loto_procedures(id) on delete restrict,
  asset_id uuid not null references public.forge_assets(id) on delete restrict,
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','canceled')),
  started_at timestamptz not null default now(),
  started_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  verification_notes text,
  affected_employees_notified boolean not null default false,
  energy_control_verified boolean not null default false,
  restoration_verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_loto_applications_procedure_idx
  on public.forge_loto_applications(organization_id, procedure_id, started_at desc);

create index if not exists forge_loto_applications_asset_idx
  on public.forge_loto_applications(organization_id, asset_id, started_at desc);

create table if not exists public.forge_loto_procedure_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null references public.forge_loto_procedures(id) on delete cascade,
  revision_number integer not null,
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (procedure_id, revision_number)
);

alter table public.forge_loto_sequences enable row level security;
alter table public.forge_loto_procedures enable row level security;
alter table public.forge_loto_energy_sources enable row level security;
alter table public.forge_loto_steps enable row level security;
alter table public.forge_loto_reviews enable row level security;
alter table public.forge_loto_applications enable row level security;
alter table public.forge_loto_procedure_versions enable row level security;

drop policy if exists forge_loto_procedures_member_select on public.forge_loto_procedures;
create policy forge_loto_procedures_member_select
on public.forge_loto_procedures for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_loto_energy_sources_member_select on public.forge_loto_energy_sources;
create policy forge_loto_energy_sources_member_select
on public.forge_loto_energy_sources for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_loto_steps_member_select on public.forge_loto_steps;
create policy forge_loto_steps_member_select
on public.forge_loto_steps for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_loto_reviews_member_select on public.forge_loto_reviews;
create policy forge_loto_reviews_member_select
on public.forge_loto_reviews for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_loto_applications_member_select on public.forge_loto_applications;
create policy forge_loto_applications_member_select
on public.forge_loto_applications for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_loto_versions_member_select on public.forge_loto_procedure_versions;
create policy forge_loto_versions_member_select
on public.forge_loto_procedure_versions for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_loto_procedures to authenticated;
grant select on public.forge_loto_energy_sources to authenticated;
grant select on public.forge_loto_steps to authenticated;
grant select on public.forge_loto_reviews to authenticated;
grant select on public.forge_loto_applications to authenticated;
grant select on public.forge_loto_procedure_versions to authenticated;

grant all on public.forge_loto_sequences to service_role;
grant all on public.forge_loto_procedures to service_role;
grant all on public.forge_loto_energy_sources to service_role;
grant all on public.forge_loto_steps to service_role;
grant all on public.forge_loto_reviews to service_role;
grant all on public.forge_loto_applications to service_role;
grant all on public.forge_loto_procedure_versions to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('loto.view','loto','View LOTO Procedures','View Lockout / Tagout procedures within the assigned equipment scope.','Lockout / Tagout','view',true,true,'location',false,false,false,'normal',10),
  ('loto.create','loto','Create LOTO Procedures','Create equipment-specific Lockout / Tagout procedures.','Lockout / Tagout','create',true,true,'organization',false,false,true,'normal',20),
  ('loto.edit','loto','Edit LOTO Procedures','Edit draft or returned LOTO procedures within scope.','Lockout / Tagout','edit',true,true,'organization',true,false,true,'sensitive',30),
  ('loto.approve','loto','Approve LOTO Procedures','Approve a LOTO procedure for operational use.','Lockout / Tagout','approve',true,true,'organization',true,true,true,'critical',40),
  ('loto.review','loto','Perform LOTO Periodic Reviews','Record periodic inspection/review of an approved LOTO procedure.','Lockout / Tagout','review',true,true,'organization',true,true,true,'sensitive',50),
  ('loto.execute','loto','Use LOTO Procedures','Start and complete a field-use record for an approved LOTO procedure.','Lockout / Tagout','execute',true,true,'location',true,true,true,'critical',60),
  ('loto.retire','loto','Retire LOTO Procedures','Retire an approved or obsolete LOTO procedure while preserving history.','Lockout / Tagout','retire',true,true,'organization',true,true,true,'critical',70)
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
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='loto.view'
where rt.template_key in ('standard-user','supervisor')
on conflict (template_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='loto.execute'
where rt.template_key='supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p
  on p.permission_key in ('loto.view','loto.create','loto.edit','loto.approve','loto.review','loto.execute','loto.retire')
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='loto.view'
where r.role_key in ('employee','supervisor','location-administrator')
on conflict (role_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='loto.execute'
where r.role_key in ('supervisor','location-administrator')
on conflict (role_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p
  on p.permission_key in ('loto.view','loto.create','loto.edit','loto.approve','loto.review','loto.execute','loto.retire')
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Lockout / Tagout',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('loto.status','LOTO Procedure Status','Lifecycle status of a LOTO procedure.',191,false),
    ('loto.energy_type','Energy Type','Hazardous energy source classifications.',192,true),
    ('loto.step_type','LOTO Step Type','Standard Lockout / Tagout procedure step categories.',193,true),
    ('loto.review_result','LOTO Review Result','Periodic LOTO review result.',194,false),
    ('loto.application_status','LOTO Use Status','Field-use lifecycle for a LOTO application.',195,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='loto'
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
    ('loto.status','draft','Draft','Procedure is being developed and is not approved for operational use.',10),
    ('loto.status','review','Under Review','Procedure is awaiting qualified review/approval.',20),
    ('loto.status','approved','Approved','Procedure is approved for operational use.',30),
    ('loto.status','retired','Retired','Procedure is preserved historically but no longer approved for use.',40),

    ('loto.energy_type','electrical','Electrical','Electrical energy.',10),
    ('loto.energy_type','hydraulic','Hydraulic','Hydraulic pressure or stored fluid energy.',20),
    ('loto.energy_type','pneumatic','Pneumatic','Compressed air or gas pressure.',30),
    ('loto.energy_type','mechanical','Mechanical','Mechanical motion, tension, compression, or rotating energy.',40),
    ('loto.energy_type','gravity','Gravity','Elevated or suspended component energy.',50),
    ('loto.energy_type','thermal','Thermal','Hot, cold, steam, or other thermal energy.',60),
    ('loto.energy_type','chemical','Chemical','Chemical process, pressure, or hazardous material energy.',70),
    ('loto.energy_type','stored_energy','Stored Energy','Capacitors, springs, pressure accumulators, or other retained energy.',80),
    ('loto.energy_type','other','Other','Other hazardous energy source.',90),

    ('loto.step_type','notify','Notify Affected Employees','Notify affected employees before shutdown.',10),
    ('loto.step_type','shutdown','Shut Down Equipment','Perform normal equipment shutdown.',20),
    ('loto.step_type','isolate','Isolate Energy','Operate energy-isolating devices.',30),
    ('loto.step_type','lock_tag','Apply Locks / Tags','Apply personal/group lockout and tagout devices.',40),
    ('loto.step_type','release_stored','Release Stored Energy','Relieve, disconnect, restrain, block, bleed, discharge, or otherwise control stored energy.',50),
    ('loto.step_type','verify','Verify Isolation','Verify de-energization and effective isolation before work.',60),
    ('loto.step_type','service','Perform Authorized Work','Perform the authorized servicing or maintenance work.',70),
    ('loto.step_type','restore','Restore to Service','Remove tools/restraints, clear personnel, remove locks/tags as authorized, and restore energy.',80),
    ('loto.step_type','notify_restore','Notify After Restoration','Notify affected employees that the equipment is restored to service.',90),
    ('loto.step_type','other','Other','Other required procedure step.',100),

    ('loto.review_result','satisfactory','Satisfactory','Procedure remains accurate and effective.',10),
    ('loto.review_result','needs_revision','Needs Revision','Procedure requires correction or update before continued use.',20),
    ('loto.review_result','suspended','Suspended','Procedure should not be used until deficiencies are corrected.',30),

    ('loto.application_status','in_progress','In Progress','LOTO application is active.',10),
    ('loto.application_status','completed','Completed','LOTO application and restoration have been completed.',20),
    ('loto.application_status','canceled','Canceled','LOTO application was canceled.',30)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set
  label=excluded.label,
  description=excluded.description,
  sort_order=excluded.sort_order,
  is_active=true;

insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  v.form_key,
  f.id,
  v.name,
  v.description,
  'Lockout / Tagout',
  'record',
  v.submit_label,
  'Cancel',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  v.sort_order
from (
  values
    ('loto.procedure','LOTO Procedure','Equipment-specific hazardous energy control procedure.','Save Procedure',600),
    ('loto.energy_source','LOTO Energy Source','Hazardous energy source and isolation point.','Add Energy Source',610),
    ('loto.step','LOTO Procedure Step','Ordered Lockout / Tagout procedure step.','Add Step',620),
    ('loto.review','LOTO Periodic Review','Periodic review / inspection of an approved LOTO procedure.','Record Review',630)
) as v(form_key, name, description, submit_label, sort_order)
join public.forge_feature_registry f on f.feature_key='loto'
on conflict (form_key) do update
set
  name=excluded.name,
  description=excluded.description,
  feature_id=excluded.feature_id,
  updated_at=now();

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select
  fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id,
  v.section_key, v.section_label, v.sort_order, v.width, v.required,
  v.can_hide, true, v.can_required, false, v.can_lookup
from (
  values
    ('loto.procedure','asset_id','Equipment / Asset','Equipment this energy-control procedure applies to.',null,'asset',null,'identity','Procedure Identity',10,'half',true,false,false,false),
    ('loto.procedure','title','Procedure Title','Descriptive title for the LOTO procedure.','Enter procedure title','text',null,'identity','Procedure Identity',20,'half',true,false,false,false),
    ('loto.procedure','description','Description','Brief description of the equipment and servicing activity.','Enter description','textarea',null,'identity','Procedure Identity',30,'full',false,true,true,false),
    ('loto.procedure','purpose','Purpose','Why this hazardous energy control procedure is required.','Enter purpose','textarea',null,'scope','Purpose & Scope',40,'full',false,true,true,false),
    ('loto.procedure','scope_text','Scope','Activities, equipment boundaries, and personnel covered by this procedure.','Enter scope','textarea',null,'scope','Purpose & Scope',50,'full',false,true,true,false),
    ('loto.procedure','required_ppe','Required PPE','PPE required to safely perform the energy-control procedure.','Enter required PPE','textarea',null,'controls','Safety Controls',60,'full',false,true,true,false),
    ('loto.procedure','special_precautions','Special Precautions','Unique hazards, sequencing requirements, or prohibited actions.','Enter special precautions','textarea',null,'controls','Safety Controls',70,'full',false,true,true,false),
    ('loto.procedure','authorized_employee_notes','Authorized Employee Notes','Instructions specific to authorized employees.','Enter authorized employee notes','textarea',null,'communication','Personnel & Communication',80,'full',false,true,true,false),
    ('loto.procedure','affected_employee_notes','Affected Employee Notes','Notification or coordination instructions for affected employees.','Enter affected employee notes','textarea',null,'communication','Personnel & Communication',90,'full',false,true,true,false),
    ('loto.procedure','shutdown_notes','Shutdown Notes','General shutdown sequencing or conditions not captured in individual steps.','Enter shutdown notes','textarea',null,'operation','Shutdown / Restoration',100,'full',false,true,true,false),
    ('loto.procedure','restoration_notes','Restoration Notes','General restoration-to-service requirements.','Enter restoration notes','textarea',null,'operation','Shutdown / Restoration',110,'full',false,true,true,false),
    ('loto.procedure','next_review_date','Next Review Date','Next scheduled periodic review date.',null,'date',null,'review','Review',120,'half',false,true,true,false),

    ('loto.energy_source','energy_type','Energy Type','Type of hazardous energy.',null,'select','loto.energy_type','source','Energy Source',10,'half',true,false,false,true),
    ('loto.energy_source','source_name','Source Name','Human-readable name for this energy source.','Main electrical disconnect','text',null,'source','Energy Source',20,'half',true,false,false,false),
    ('loto.energy_source','magnitude','Magnitude / Pressure / Voltage','Known magnitude, voltage, pressure, temperature, or other useful energy value.','480 VAC','text',null,'source','Energy Source',30,'half',false,true,true,false),
    ('loto.energy_source','isolation_location','Isolation Location','Exact physical location of the energy-isolating device.','North wall disconnect DS-1','textarea',null,'isolation','Isolation',40,'full',true,false,false,false),
    ('loto.energy_source','isolation_device','Isolation Device','Disconnect, valve, breaker, block, blank, or other isolation device.','Enter isolation device','text',null,'isolation','Isolation',50,'half',false,true,true,false),
    ('loto.energy_source','lockout_device','Lockout Device','Lock, hasp, valve cover, breaker device, or other required lockout hardware.','Enter lockout device','text',null,'isolation','Isolation',60,'half',false,true,true,false),
    ('loto.energy_source','stored_energy_method','Stored Energy Control','How residual or stored energy must be released, blocked, restrained, or otherwise controlled.','Enter stored energy control','textarea',null,'verification','Stored Energy & Verification',70,'full',false,true,true,false),
    ('loto.energy_source','verification_method','Verification Method','How an authorized employee confirms effective isolation / zero energy state.','Enter verification method','textarea',null,'verification','Stored Energy & Verification',80,'full',true,false,false,false),
    ('loto.energy_source','notes','Notes','Additional source-specific information.','Enter notes','textarea',null,'verification','Stored Energy & Verification',90,'full',false,true,true,false),

    ('loto.step','step_type','Step Type','Standard category for this procedure step.',null,'select','loto.step_type','step','Procedure Step',10,'half',true,false,false,true),
    ('loto.step','title','Step Title','Short step heading.','Enter step title','text',null,'step','Procedure Step',20,'half',true,false,false,false),
    ('loto.step','instructions','Instructions','Detailed instructions for this step.','Enter step instructions','textarea',null,'step','Procedure Step',30,'full',true,false,false,false),
    ('loto.step','warning_text','Warning / Caution','Critical caution, hazard, or prohibited action.','Enter warning if applicable','textarea',null,'verification','Verification',40,'full',false,true,true,false),
    ('loto.step','verification_instructions','Verification Instructions','How the employee confirms this step was completed effectively.','Enter verification instructions','textarea',null,'verification','Verification',50,'full',false,true,true,false),

    ('loto.review','review_result','Review Result','Result of the periodic procedure review.',null,'select','loto.review_result','review','Periodic Review',10,'half',true,false,false,true),
    ('loto.review','employee_observed','Authorized Employee Observed','Employee observed applying the procedure, when applicable.','Enter employee name','text',null,'review','Periodic Review',20,'half',false,true,true,false),
    ('loto.review','deviations_found','Deviations / Inadequacies','Describe any deviations or inadequacies identified.','Enter deviations or inadequacies','textarea',null,'findings','Findings',30,'full',false,true,true,false),
    ('loto.review','corrective_actions','Corrective Actions','Describe corrections or retraining required.','Enter corrective actions','textarea',null,'findings','Findings',40,'full',false,true,true,false),
    ('loto.review','notes','Review Notes','Additional review notes.','Enter review notes','textarea',null,'findings','Findings',50,'full',false,true,true,false),
    ('loto.review','next_review_date','Next Review Date','Next periodic review date.',null,'date',null,'schedule','Next Review',60,'half',false,true,true,false)
) as v(form_key, field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key=v.form_key
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
  and (
    (fd.form_key='loto.procedure' and ff.field_key in ('asset_id','title'))
    or (fd.form_key='loto.energy_source' and ff.field_key in ('energy_type','source_name','isolation_location','verification_method'))
    or (fd.form_key='loto.step' and ff.field_key in ('step_type','title','instructions'))
    or (fd.form_key='loto.review' and ff.field_key='review_result')
  );

update public.forge_experience_elements
set settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"loto.view"}'::jsonb,
    updated_at=now()
where element_key='nav.loto';
