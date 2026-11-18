-- Forge Industrial Safety 2.0 Corrective Actions / CAPA runtime.
-- Shared cross-module corrective and preventive action service linked to operational Tasks.

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('corrective_actions','Corrective Actions','Shared corrective and preventive actions, verification, effectiveness review and closure.','Risk & Prevention','module','enabled',true,true,true,true,false,135)
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
  and f.feature_key='corrective_actions'
on conflict (plan_id, feature_id) do update set enabled=excluded.enabled;

create table if not exists public.forge_corrective_action_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id)
);

create or replace function public.next_forge_corrective_action_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_corrective_action_sequences (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id)
  do update set next_value = public.forge_corrective_action_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'CA-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_corrective_action_number(uuid) from public;
grant execute on function public.next_forge_corrective_action_number(uuid) to service_role;

create table if not exists public.forge_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_number text not null,
  title text not null,
  description text,
  action_type text not null default 'corrective'
    check (action_type in ('corrective','preventive','containment')),
  severity text not null default 'moderate'
    check (severity in ('low','moderate','high','critical')),
  status text not null default 'open'
    check (status in ('open','in_progress','pending_verification','verified','closed','canceled')),
  source_type text not null default 'manual',
  source_id text,
  source_reference text,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  assigned_personnel_id uuid references public.forge_personnel(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  immediate_containment text,
  root_cause_required boolean not null default true,
  root_cause text,
  action_plan text,
  preventive_action text,
  due_at timestamptz,
  verification_due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  verification_result text
    check (verification_result is null or verification_result in ('effective','ineffective','follow_up_required')),
  verification_notes text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  effectiveness_review_due_at timestamptz,
  effectiveness_notes text,
  closure_notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  linked_task_id uuid references public.forge_tasks(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, action_number)
);

create index if not exists forge_corrective_actions_org_status_idx
  on public.forge_corrective_actions(organization_id, status, due_at);

create index if not exists forge_corrective_actions_assignee_idx
  on public.forge_corrective_actions(organization_id, assigned_user_id, status, due_at);

create index if not exists forge_corrective_actions_location_idx
  on public.forge_corrective_actions(organization_id, location_id, status, due_at);

create index if not exists forge_corrective_actions_source_idx
  on public.forge_corrective_actions(organization_id, source_type, source_id);

create table if not exists public.forge_corrective_action_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  corrective_action_id uuid not null references public.forge_corrective_actions(id) on delete cascade,
  comment text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_corrective_action_comments_idx
  on public.forge_corrective_action_comments(organization_id, corrective_action_id, created_at);

create table if not exists public.forge_corrective_action_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  corrective_action_id uuid not null references public.forge_corrective_actions(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_corrective_action_activity_idx
  on public.forge_corrective_action_activity(organization_id, corrective_action_id, created_at desc);

alter table public.forge_corrective_action_sequences enable row level security;
alter table public.forge_corrective_actions enable row level security;
alter table public.forge_corrective_action_comments enable row level security;
alter table public.forge_corrective_action_activity enable row level security;

drop policy if exists forge_corrective_actions_member_select on public.forge_corrective_actions;
create policy forge_corrective_actions_member_select
on public.forge_corrective_actions for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_corrective_action_comments_member_select on public.forge_corrective_action_comments;
create policy forge_corrective_action_comments_member_select
on public.forge_corrective_action_comments for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_corrective_action_activity_member_select on public.forge_corrective_action_activity;
create policy forge_corrective_action_activity_member_select
on public.forge_corrective_action_activity for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_corrective_actions to authenticated;
grant select on public.forge_corrective_action_comments to authenticated;
grant select on public.forge_corrective_action_activity to authenticated;

grant all on public.forge_corrective_action_sequences to service_role;
grant all on public.forge_corrective_actions to service_role;
grant all on public.forge_corrective_action_comments to service_role;
grant all on public.forge_corrective_action_activity to service_role;
grant usage, select on sequence public.forge_corrective_action_activity_id_seq to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('corrective_actions.view','corrective_actions','View Corrective Actions','View corrective and preventive actions within the assigned scope.','Corrective Actions','view',true,true,'own',false,false,false,'normal',10),
  ('corrective_actions.create','corrective_actions','Create Corrective Actions','Create corrective and preventive actions.','Corrective Actions','create',true,true,'own',false,false,true,'normal',20),
  ('corrective_actions.edit','corrective_actions','Edit Corrective Actions','Edit corrective action analysis and action plans.','Corrective Actions','edit',true,true,'own',false,false,true,'normal',30),
  ('corrective_actions.assign','corrective_actions','Assign Corrective Actions','Assign corrective actions to personnel and organizational scopes.','Corrective Actions','assign',true,true,'location',false,false,true,'normal',40),
  ('corrective_actions.submit','corrective_actions','Submit Corrective Actions','Submit completed corrective actions for independent verification.','Corrective Actions','submit',true,true,'own',false,true,true,'normal',50),
  ('corrective_actions.verify','corrective_actions','Verify Corrective Actions','Verify corrective-action effectiveness or return work for follow-up.','Corrective Actions','verify',true,true,'location',true,true,true,'sensitive',60),
  ('corrective_actions.close','corrective_actions','Close Corrective Actions','Close verified corrective actions.','Corrective Actions','close',true,true,'organization',true,true,true,'sensitive',70),
  ('corrective_actions.archive','corrective_actions','Archive Corrective Actions','Archive closed or canceled corrective actions.','Corrective Actions','archive',true,true,'organization',true,true,true,'sensitive',80)
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
  'corrective_actions.view','corrective_actions.create','corrective_actions.edit','corrective_actions.submit'
)
where rt.template_key='standard-user'
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'corrective_actions.view','corrective_actions.create','corrective_actions.edit',
  'corrective_actions.assign','corrective_actions.submit','corrective_actions.verify'
)
where rt.template_key='supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key like 'corrective_actions.%'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'corrective_actions.view','corrective_actions.create','corrective_actions.edit','corrective_actions.submit'
)
where r.role_key='employee'
on conflict (role_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'corrective_actions.view','corrective_actions.create','corrective_actions.edit',
  'corrective_actions.assign','corrective_actions.submit','corrective_actions.verify'
)
where r.role_key in ('supervisor','location-administrator')
on conflict (role_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key like 'corrective_actions.%'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Corrective Actions',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('corrective_actions.status','Corrective Action Status','CAPA workflow status.',136,false),
    ('corrective_actions.type','Corrective Action Type','Corrective, preventive, or containment classification.',137,true),
    ('corrective_actions.severity','Corrective Action Severity','Risk/severity classification.',138,true),
    ('corrective_actions.source_type','Corrective Action Source','Forge workflow that originated the action.',139,true),
    ('corrective_actions.verification_result','Verification Result','Effectiveness verification result.',140,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='corrective_actions'
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
    ('corrective_actions.status','open','Open','Action has been created and requires planning or assignment.',10),
    ('corrective_actions.status','in_progress','In Progress','Corrective work is underway.',20),
    ('corrective_actions.status','pending_verification','Pending Verification','Work is complete and awaiting independent verification.',30),
    ('corrective_actions.status','verified','Verified','Effectiveness has been verified and the action is ready for closure.',40),
    ('corrective_actions.status','closed','Closed','Corrective action is fully closed.',50),
    ('corrective_actions.status','canceled','Canceled','Corrective action was canceled with history preserved.',60),

    ('corrective_actions.type','corrective','Corrective','Corrects an identified deficiency or nonconformance.',10),
    ('corrective_actions.type','preventive','Preventive','Prevents a potential deficiency or recurrence.',20),
    ('corrective_actions.type','containment','Containment','Immediate containment or interim control.',30),

    ('corrective_actions.severity','low','Low','Low-risk condition.',10),
    ('corrective_actions.severity','moderate','Moderate','Moderate-risk condition.',20),
    ('corrective_actions.severity','high','High','High-risk condition requiring prompt attention.',30),
    ('corrective_actions.severity','critical','Critical','Critical condition requiring immediate management attention.',40),

    ('corrective_actions.source_type','manual','Manual','Created directly by a user.',10),
    ('corrective_actions.source_type','incident','Incident','Originated from an Incident.',20),
    ('corrective_actions.source_type','inspection','Inspection','Originated from an Inspection or finding.',30),
    ('corrective_actions.source_type','observation','Observation','Originated from a safety observation.',40),
    ('corrective_actions.source_type','jsa','JSA / JHA','Originated from a job safety analysis.',50),
    ('corrective_actions.source_type','risk','Risk Register','Originated from the Risk Register.',60),
    ('corrective_actions.source_type','asset','Asset / Equipment','Originated from an asset or equipment record.',70),
    ('corrective_actions.source_type','loto','Lockout / Tagout','Originated from a LOTO workflow.',80),
    ('corrective_actions.source_type','permit','Permit to Work','Originated from a high-risk work permit.',90),
    ('corrective_actions.source_type','training','Training','Originated from a training or qualification deficiency.',100),
    ('corrective_actions.source_type','other','Other','Other Forge workflow.',110),

    ('corrective_actions.verification_result','effective','Effective','Corrective action is effective.',10),
    ('corrective_actions.verification_result','ineffective','Ineffective','Corrective action is not effective and requires rework.',20),
    ('corrective_actions.verification_result','follow_up_required','Follow-up Required','Additional monitoring or follow-up is required before closure.',30)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, 'corrective_action', 'Corrective Action', 'Task originated from the shared Corrective Actions / CAPA module.', 35, true, true
from public.forge_lookup_definitions d
where d.lookup_key='tasks.source_type'
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  'corrective_actions.action',
  f.id,
  'Corrective Action',
  'Corrective and preventive action analysis, assignment, due date, verification and effectiveness review.',
  'Corrective Actions',
  'record',
  'Save Corrective Action',
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
where f.feature_key='corrective_actions'
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
    ('title','Title','Short description of the issue or required action.','Enter corrective action title','text',null,'identity','Corrective Action',10,'full',true,false,false,false),
    ('description','Issue / Nonconformance','Describe the deficiency, hazard, event, or opportunity being addressed.','Describe the issue','textarea',null,'identity','Corrective Action',20,'full',true,false,true,false),
    ('action_type','Action Type','Corrective, preventive, or containment classification.',null,'select','corrective_actions.type','classification','Classification',30,'half',true,false,false,true),
    ('severity','Severity','Risk/severity classification.',null,'select','corrective_actions.severity','classification','Classification',40,'half',true,false,false,true),
    ('source_type','Source','Workflow that originated the action.',null,'select','corrective_actions.source_type','source','Source',50,'half',true,true,true,true),
    ('source_reference','Source Reference','Human-readable source record number or reference.','Example: INSP-2026-000014','text',null,'source','Source',60,'half',false,true,true,false),
    ('assigned_personnel_id','Assigned Owner','Person responsible for corrective work.',null,'person',null,'assignment','Assignment',70,'half',false,true,true,false),
    ('location_id','Location','Location associated with this action.',null,'location',null,'assignment','Assignment',80,'half',false,true,true,false),
    ('division_id','Division','Division associated with this action.',null,'division',null,'assignment','Assignment',90,'half',false,true,true,false),
    ('due_at','Due Date & Time','Required corrective-work completion date/time.',null,'datetime',null,'assignment','Assignment',100,'half',false,true,true,false),
    ('immediate_containment','Immediate Containment','Temporary control or immediate action taken while permanent correction is developed.','Describe containment','textarea',null,'analysis','Analysis & Controls',110,'full',false,true,true,false),
    ('root_cause_required','Root Cause Required','Require documented root-cause analysis before verification.',null,'checkbox',null,'analysis','Analysis & Controls',120,'half',false,true,true,false),
    ('root_cause','Root Cause','Document verified or most-supported root cause.','Describe root cause','textarea',null,'analysis','Analysis & Controls',130,'full',false,true,true,false),
    ('action_plan','Corrective Action Plan','Permanent corrective work to address the cause.','Describe corrective action plan','textarea',null,'plan','Action Plan',140,'full',false,false,true,false),
    ('preventive_action','Preventive / System Action','Additional action to prevent recurrence elsewhere.','Describe preventive action','textarea',null,'plan','Action Plan',150,'full',false,true,true,false),
    ('verification_due_at','Verification Due','Target date/time for independent verification.',null,'datetime',null,'verification','Verification',160,'half',false,true,true,false),
    ('effectiveness_review_due_at','Effectiveness Review Due','Optional later review to confirm the fix remains effective.',null,'datetime',null,'verification','Verification',170,'half',false,true,true,false),
    ('effectiveness_notes','Effectiveness Review Notes','Longer-term recurrence or effectiveness observations.','Enter effectiveness review notes','textarea',null,'verification','Verification',180,'full',false,true,true,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='corrective_actions.action'
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
  and fd.form_key='corrective_actions.action'
  and ff.field_key in ('title','description','action_type','severity');

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
  'nav.corrective_actions',
  f.id,
  'menu',
  'Corrective Actions',
  'Corrective Actions',
  'Corrective and preventive actions, verification and effectiveness review.',
  '/corrective-actions',
  'corrective-actions',
  'Navigation',
  135,
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
  '{"route_live":true,"required_permission":"corrective_actions.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key='corrective_actions'
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
