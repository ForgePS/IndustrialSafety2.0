-- Forge Industrial Safety 2.0 Tasks runtime.
-- Shared operational task and corrective-action work queue used across Forge modules.

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('tasks','Tasks','Operational tasks, assignments, corrective actions, due dates, comments, and activity.','Operations','module','enabled',true,true,true,true,false,205)
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

create table if not exists public.forge_task_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id)
);

create or replace function public.next_forge_task_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_task_sequences (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id)
  do update set next_value = public.forge_task_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'TASK-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_task_number(uuid) from public;
grant execute on function public.next_forge_task_number(uuid) to service_role;

create table if not exists public.forge_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_number text not null,
  title text not null,
  description text,
  status text not null default 'open'
    check (status in ('open','in_progress','blocked','completed','canceled')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  assigned_personnel_id uuid references public.forge_personnel(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  start_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  source_type text,
  source_id text,
  source_reference text,
  corrective_action boolean not null default false,
  verification_required boolean not null default false,
  verification_notes text,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, task_number)
);

create index if not exists forge_tasks_org_status_idx
  on public.forge_tasks(organization_id, status, due_at);

create index if not exists forge_tasks_assignee_idx
  on public.forge_tasks(organization_id, assigned_user_id, status, due_at);

create index if not exists forge_tasks_location_idx
  on public.forge_tasks(organization_id, location_id, status, due_at);

create index if not exists forge_tasks_source_idx
  on public.forge_tasks(organization_id, source_type, source_id);

create table if not exists public.forge_task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.forge_tasks(id) on delete cascade,
  comment text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_task_comments_task_idx
  on public.forge_task_comments(organization_id, task_id, created_at);

create table if not exists public.forge_task_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.forge_tasks(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_task_activity_task_idx
  on public.forge_task_activity(organization_id, task_id, created_at desc);

alter table public.forge_task_sequences enable row level security;
alter table public.forge_tasks enable row level security;
alter table public.forge_task_comments enable row level security;
alter table public.forge_task_activity enable row level security;

drop policy if exists forge_tasks_member_select on public.forge_tasks;
create policy forge_tasks_member_select
on public.forge_tasks for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_task_comments_member_select on public.forge_task_comments;
create policy forge_task_comments_member_select
on public.forge_task_comments for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_task_activity_member_select on public.forge_task_activity;
create policy forge_task_activity_member_select
on public.forge_task_activity for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_tasks to authenticated;
grant select on public.forge_task_comments to authenticated;
grant select on public.forge_task_activity to authenticated;

grant all on public.forge_task_sequences to service_role;
grant all on public.forge_tasks to service_role;
grant all on public.forge_task_comments to service_role;
grant all on public.forge_task_activity to service_role;
grant usage, select on sequence public.forge_task_activity_id_seq to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('tasks.view','tasks','View Tasks','View Tasks within the assigned access scope.','Tasks','view',true,true,'own',false,false,false,'normal',10),
  ('tasks.create','tasks','Create Tasks','Create Tasks and corrective-action assignments.','Tasks','create',true,true,'own',false,false,true,'normal',20),
  ('tasks.edit','tasks','Edit Tasks','Edit eligible Tasks within scope.','Tasks','edit',true,true,'own',false,false,true,'normal',30),
  ('tasks.assign','tasks','Assign Tasks','Assign Tasks to other personnel and organizational scopes.','Tasks','assign',true,true,'location',false,false,true,'normal',40),
  ('tasks.complete','tasks','Complete Tasks','Mark Tasks complete and record verification notes.','Tasks','complete',true,true,'own',false,false,true,'normal',50),
  ('tasks.archive','tasks','Archive Tasks','Archive completed, canceled, or obsolete Tasks.','Tasks','archive',true,true,'organization',true,true,true,'sensitive',60)
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
join public.forge_permission_registry p on p.permission_key in ('tasks.view','tasks.create','tasks.edit','tasks.complete')
where rt.template_key='standard-user'
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('tasks.view','tasks.create','tasks.edit','tasks.assign','tasks.complete')
where rt.template_key='supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('tasks.view','tasks.create','tasks.edit','tasks.assign','tasks.complete','tasks.archive')
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('tasks.view','tasks.create','tasks.edit','tasks.complete')
where r.role_key='employee'
on conflict (role_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('tasks.view','tasks.create','tasks.edit','tasks.assign','tasks.complete')
where r.role_key in ('supervisor','location-administrator')
on conflict (role_id, permission_id) do update set allowed=true, scope='location';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('tasks.view','tasks.create','tasks.edit','tasks.assign','tasks.complete','tasks.archive')
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Tasks',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('tasks.status','Task Status','Task workflow status.',206,false),
    ('tasks.priority','Task Priority','Task priority classification.',207,true),
    ('tasks.source_type','Task Source','Forge module or workflow that originated a task.',208,true)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='tasks'
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
    ('tasks.status','open','Open','Task has been created and is awaiting work.',10),
    ('tasks.status','in_progress','In Progress','Task work is underway.',20),
    ('tasks.status','blocked','Blocked','Task cannot progress until a dependency is resolved.',30),
    ('tasks.status','completed','Completed','Task has been completed.',40),
    ('tasks.status','canceled','Canceled','Task was canceled.',50),

    ('tasks.priority','low','Low','Low-priority work.',10),
    ('tasks.priority','normal','Normal','Normal-priority work.',20),
    ('tasks.priority','high','High','High-priority work requiring prompt attention.',30),
    ('tasks.priority','critical','Critical','Critical safety or operational task.',40),

    ('tasks.source_type','manual','Manual','Task created directly by a user.',10),
    ('tasks.source_type','incident','Incident','Task originated from an Incident.',20),
    ('tasks.source_type','inspection','Inspection','Task originated from an Inspection or finding.',30),
    ('tasks.source_type','training','Training','Task originated from Training.',40),
    ('tasks.source_type','asset','Asset / Equipment','Task originated from Assets & Equipment.',50),
    ('tasks.source_type','loto','Lockout / Tagout','Task originated from LOTO.',60),
    ('tasks.source_type','ai','Forge AI','Task originated from an approved Forge AI action.',70),
    ('tasks.source_type','other','Other','Other Forge workflow.',80)
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
  'tasks.task',
  f.id,
  'Task',
  'Operational task, corrective action, assignment, and due-date record.',
  'Tasks',
  'record',
  'Save Task',
  'Cancel',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  700
from public.forge_feature_registry f
where f.feature_key='tasks'
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
    ('title','Task Title','Short description of the required work.','Enter task title','text',null,'identity','Task',10,'full',true,false,false,false),
    ('description','Description','Detailed task or corrective-action instructions.','Enter task description','textarea',null,'identity','Task',20,'full',false,true,true,false),
    ('priority','Priority','Task priority.',null,'select','tasks.priority','workflow','Workflow',30,'half',true,false,false,true),
    ('status','Status','Current task status.',null,'select','tasks.status','workflow','Workflow',40,'half',true,false,false,true),
    ('assigned_personnel_id','Assigned To','Personnel responsible for completing this task.',null,'person',null,'assignment','Assignment',50,'half',false,true,true,false),
    ('location_id','Location','Location associated with this task.',null,'location',null,'assignment','Assignment',60,'half',false,true,true,false),
    ('division_id','Division','Division associated with this task.',null,'division',null,'assignment','Assignment',70,'half',false,true,true,false),
    ('start_at','Start Date & Time','Optional planned start.',null,'datetime',null,'schedule','Schedule',80,'half',false,true,true,false),
    ('due_at','Due Date & Time','Task due date/time.',null,'datetime',null,'schedule','Schedule',90,'half',false,true,true,false),
    ('verification_notes','Verification / Closure Notes','Verification evidence or closure notes.','Enter verification or closure notes','textarea',null,'closure','Closure',100,'full',false,true,true,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='tasks.task'
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
  and fd.form_key='tasks.task'
  and ff.field_key in ('title','priority','status');

update public.forge_experience_elements
set feature_id=(select id from public.forge_feature_registry where feature_key='tasks'),
    settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"tasks.view"}'::jsonb,
    updated_at=now()
where element_key='nav.tasks';
