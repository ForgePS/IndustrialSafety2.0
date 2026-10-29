-- Forge Creator 2.0 tenant-specific dropdown and lookup management.

alter table public.forge_lookup_definitions
  add column if not exists category text not null default 'General',
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true;

alter table public.forge_tenant_lookup_options
  add column if not exists description text,
  add column if not exists color text,
  add column if not exists icon text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.forge_tenant_lookup_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lookup_id uuid not null references public.forge_lookup_definitions(id) on delete cascade,
  label text,
  description text,
  can_rename_override boolean,
  can_reorder_override boolean,
  can_add_options_override boolean,
  can_hide_core_options_override boolean,
  can_delete_core_options_override boolean,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, lookup_id)
);

alter table public.forge_tenant_lookup_overrides enable row level security;
grant all on public.forge_tenant_lookup_overrides to service_role;

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  v.category,
  v.sort_order,
  v.can_rename,
  v.can_reorder,
  v.can_add,
  v.can_hide,
  false
from (
  values
    ('personnel.employment_status','personnel','Employment Status','Status options used on personnel records.','Personnel',100,true,true,true,false),
    ('training.status','training','Training Status','Training assignment and completion statuses.','Training',110,true,true,true,false),
    ('incidents.severity','incidents','Incident Severity','Severity classification used on incident records.','Incidents',120,true,true,true,false),
    ('inspections.result','inspections','Inspection Result','Result values used when completing inspections.','Inspections',130,true,true,true,false),
    ('fleet.vehicle_status','fleet','Vehicle Status','Operational status of fleet vehicles.','Fleet',140,true,true,true,false),
    ('tasks.status','tasks','Task Status','Workflow status values for tasks and corrective actions.','Tasks',150,true,true,true,false),
    ('loto.status','loto','LOTO Procedure Status','Lifecycle values for lockout/tagout procedures.','Lockout / Tagout',160,true,true,false,false)
) as v(lookup_key, feature_key, name, description, category, sort_order, can_rename, can_reorder, can_add, can_hide)
join public.forge_feature_registry f on f.feature_key = v.feature_key
on conflict (lookup_key) do update
set
  feature_id = excluded.feature_id,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  tenant_can_rename = excluded.tenant_can_rename,
  tenant_can_reorder = excluded.tenant_can_reorder,
  tenant_can_add_options = excluded.tenant_can_add_options,
  tenant_can_hide_core_options = excluded.tenant_can_hide_core_options,
  updated_at = now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('personnel.employment_status','active','Active','Currently active personnel.',10),
    ('personnel.employment_status','inactive','Inactive','Inactive personnel record.',20),
    ('personnel.employment_status','leave','Leave','Personnel currently on leave.',30),
    ('personnel.employment_status','terminated','Terminated','Employment has ended.',40),

    ('training.status','assigned','Assigned','Training has been assigned.',10),
    ('training.status','in_progress','In Progress','Training is currently in progress.',20),
    ('training.status','completed','Completed','Training has been completed.',30),
    ('training.status','overdue','Overdue','Assigned training is past its due date.',40),
    ('training.status','exempt','Exempt','Person is exempt from this training assignment.',50),

    ('incidents.severity','near_miss','Near Miss','No injury or loss, but potential existed.',10),
    ('incidents.severity','minor','Minor','Low-severity incident classification.',20),
    ('incidents.severity','moderate','Moderate','Moderate incident classification.',30),
    ('incidents.severity','serious','Serious','Serious incident classification.',40),
    ('incidents.severity','critical','Critical','Highest severity classification.',50),

    ('inspections.result','pass','Pass','Inspection item meets requirements.',10),
    ('inspections.result','needs_attention','Needs Attention','Condition requires follow-up.',20),
    ('inspections.result','fail','Fail','Inspection item does not meet requirements.',30),
    ('inspections.result','not_applicable','Not Applicable','Inspection item does not apply.',40),

    ('fleet.vehicle_status','in_service','In Service','Vehicle is available for normal use.',10),
    ('fleet.vehicle_status','out_of_service','Out of Service','Vehicle is unavailable for use.',20),
    ('fleet.vehicle_status','maintenance','Maintenance','Vehicle is undergoing maintenance.',30),
    ('fleet.vehicle_status','retired','Retired','Vehicle has been retired.',40),

    ('tasks.status','open','Open','Task is open and not yet started.',10),
    ('tasks.status','in_progress','In Progress','Task is currently being worked.',20),
    ('tasks.status','blocked','Blocked','Task cannot proceed until another issue is resolved.',30),
    ('tasks.status','complete','Complete','Task has been completed.',40),
    ('tasks.status','canceled','Canceled','Task was canceled.',50),

    ('loto.status','draft','Draft','Procedure is still being prepared.',10),
    ('loto.status','active','Active','Procedure is approved for current use.',20),
    ('loto.status','under_review','Under Review','Procedure is being reviewed.',30),
    ('loto.status','retired','Retired','Procedure is no longer active.',40)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key = v.lookup_key
on conflict (lookup_id, option_key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;
