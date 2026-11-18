-- Forge Industrial Safety 2.0 Inspections runtime.
-- Template-driven inspections, checklist snapshots, findings, corrective actions and workflow.

create table if not exists public.forge_inspection_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, inspection_year)
);

create or replace function public.next_forge_inspection_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_number integer;
begin
  insert into public.forge_inspection_sequences (organization_id, inspection_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, inspection_year)
  do update set next_value = public.forge_inspection_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'INSP-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_inspection_number(uuid) from public;
grant execute on function public.next_forge_inspection_number(uuid) to service_role;

create table if not exists public.forge_inspection_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text,
  name text not null,
  description text,
  inspection_type text not null default 'general',
  version integer not null default 1,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_inspection_templates_key_unique_idx
  on public.forge_inspection_templates(organization_id, template_key)
  where template_key is not null;

create table if not exists public.forge_inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.forge_inspection_templates(id) on delete cascade,
  item_key text not null,
  section_key text not null default 'general',
  section_label text not null default 'General',
  prompt text not null,
  guidance text,
  response_type text not null default 'pass_fail_na'
    check (response_type in ('pass_fail_na','yes_no_na','text','number')),
  sort_order integer not null default 0,
  is_required boolean not null default true,
  finding_on text[] not null default array['fail']::text[],
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, item_key)
);

create index if not exists forge_inspection_template_items_order_idx
  on public.forge_inspection_template_items(template_id, section_key, sort_order);

create table if not exists public.forge_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_number text not null,
  template_id uuid references public.forge_inspection_templates(id) on delete set null,
  template_name_snapshot text,
  template_version_snapshot integer,
  status text not null default 'draft'
    check (status in ('draft','in_progress','submitted','returned','approved','closed')),
  inspection_date date not null,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  inspector_user_id uuid references auth.users(id) on delete set null,
  inspector_personnel_id uuid references public.forge_personnel(id) on delete set null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  result text,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  returned_at timestamptz,
  returned_by uuid references auth.users(id) on delete set null,
  return_reason text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, inspection_number)
);

create index if not exists forge_inspections_org_status_idx
  on public.forge_inspections(organization_id, status, inspection_date desc);

create index if not exists forge_inspections_org_location_idx
  on public.forge_inspections(organization_id, location_id, inspection_date desc);

create table if not exists public.forge_inspection_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.forge_inspections(id) on delete cascade,
  template_item_id uuid references public.forge_inspection_template_items(id) on delete set null,
  item_key text not null,
  section_key text not null,
  section_label text not null,
  prompt text not null,
  guidance text,
  response_type text not null,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  finding_on text[] not null default array['fail']::text[],
  response_value text,
  notes text,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (inspection_id, item_key)
);

create index if not exists forge_inspection_items_inspection_idx
  on public.forge_inspection_items(organization_id, inspection_id, section_key, sort_order);

create table if not exists public.forge_inspection_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.forge_inspections(id) on delete cascade,
  inspection_item_id uuid references public.forge_inspection_items(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'moderate',
  status text not null default 'open'
    check (status in ('open','in_progress','pending_verification','closed','canceled')),
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  corrective_action text,
  verification_notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_inspection_findings_inspection_idx
  on public.forge_inspection_findings(organization_id, inspection_id, status, due_date);

create table if not exists public.forge_inspection_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.forge_inspections(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_inspection_activity_idx
  on public.forge_inspection_activity(organization_id, inspection_id, created_at desc);

alter table public.forge_inspection_sequences enable row level security;
alter table public.forge_inspection_templates enable row level security;
alter table public.forge_inspection_template_items enable row level security;
alter table public.forge_inspections enable row level security;
alter table public.forge_inspection_items enable row level security;
alter table public.forge_inspection_findings enable row level security;
alter table public.forge_inspection_activity enable row level security;

drop policy if exists forge_inspection_templates_member_select on public.forge_inspection_templates;
create policy forge_inspection_templates_member_select
on public.forge_inspection_templates for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_inspection_template_items_member_select on public.forge_inspection_template_items;
create policy forge_inspection_template_items_member_select
on public.forge_inspection_template_items for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_inspections_member_select on public.forge_inspections;
create policy forge_inspections_member_select
on public.forge_inspections for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_inspection_items_member_select on public.forge_inspection_items;
create policy forge_inspection_items_member_select
on public.forge_inspection_items for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_inspection_findings_member_select on public.forge_inspection_findings;
create policy forge_inspection_findings_member_select
on public.forge_inspection_findings for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_inspection_activity_member_select on public.forge_inspection_activity;
create policy forge_inspection_activity_member_select
on public.forge_inspection_activity for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_inspection_templates to authenticated;
grant select on public.forge_inspection_template_items to authenticated;
grant select on public.forge_inspections to authenticated;
grant select on public.forge_inspection_items to authenticated;
grant select on public.forge_inspection_findings to authenticated;
grant select on public.forge_inspection_activity to authenticated;

grant all on public.forge_inspection_sequences to service_role;
grant all on public.forge_inspection_templates to service_role;
grant all on public.forge_inspection_template_items to service_role;
grant all on public.forge_inspections to service_role;
grant all on public.forge_inspection_items to service_role;
grant all on public.forge_inspection_findings to service_role;
grant all on public.forge_inspection_activity to service_role;
grant usage, select on sequence public.forge_inspection_activity_id_seq to service_role;

-- Inspection workflow/template permissions.
insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('inspections.submit','inspections','Submit Inspections','Submit inspections for review.','Inspections','submit',true,true,'organization',false,true,true,'normal',35),
  ('inspections.close','inspections','Close Inspections','Close approved inspections when all required work is complete.','Inspections','close',true,true,'organization',true,true,true,'sensitive',65),
  ('inspections.manage_templates','inspections','Manage Inspection Templates','Create and maintain tenant inspection templates and checklist items.','Inspections','manage_templates',true,false,'organization',true,true,true,'sensitive',90)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
  name=excluded.name,
  description=excluded.description,
  tenant_assignable=true,
  audit_use=true,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('inspections.submit','inspections.close','inspections.manage_templates')
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='inspections.submit'
where rt.template_key='supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true,
  case when r.role_key='supervisor' and p.permission_key='inspections.submit' then 'own' else 'organization' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('inspections.submit','inspections.close','inspections.manage_templates')
where
  (p.permission_key='inspections.submit' and r.role_key in ('supervisor','company-administrator','company-owner'))
  or
  (p.permission_key in ('inspections.close','inspections.manage_templates') and r.role_key in ('company-administrator','company-owner'))
on conflict (role_id, permission_id) do update set allowed=true, scope=excluded.scope;

-- Inspection lookup sets.
insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Inspections',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('inspections.type','Inspection Type','Classification used for inspection templates.',131,true),
    ('inspections.status','Inspection Status','Workflow status labels for inspections.',132,false),
    ('inspections.finding_severity','Finding Severity','Severity classifications for inspection findings.',133,true),
    ('inspections.finding_status','Finding Status','Corrective action workflow status labels.',134,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='inspections'
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
    ('inspections.type','general','General Safety','General workplace safety inspection.',10),
    ('inspections.type','housekeeping','Housekeeping','Housekeeping and workplace condition inspection.',20),
    ('inspections.type','equipment','Equipment','Equipment-focused inspection.',30),
    ('inspections.type','fire_life_safety','Fire & Life Safety','Fire protection and life-safety inspection.',40),
    ('inspections.type','vehicle','Vehicle / Mobile Equipment','Vehicle or mobile-equipment inspection.',50),
    ('inspections.type','custom','Custom','Tenant-defined inspection type.',60),

    ('inspections.status','draft','Draft','Inspection has been created but not started.',10),
    ('inspections.status','in_progress','In Progress','Inspection is actively being completed.',20),
    ('inspections.status','submitted','Submitted','Inspection has been submitted for review.',30),
    ('inspections.status','returned','Returned','Inspection was returned for correction.',40),
    ('inspections.status','approved','Approved','Inspection has been approved.',50),
    ('inspections.status','closed','Closed','Inspection and required follow-up are complete.',60),

    ('inspections.finding_severity','low','Low','Low-risk finding.',10),
    ('inspections.finding_severity','moderate','Moderate','Moderate-risk finding.',20),
    ('inspections.finding_severity','high','High','High-risk finding.',30),
    ('inspections.finding_severity','critical','Critical','Critical finding requiring prompt attention.',40),

    ('inspections.finding_status','open','Open','Finding requires corrective action.',10),
    ('inspections.finding_status','in_progress','In Progress','Corrective action is underway.',20),
    ('inspections.finding_status','pending_verification','Pending Verification','Corrective action awaits verification.',30),
    ('inspections.finding_status','closed','Closed','Finding has been verified and closed.',40),
    ('inspections.finding_status','canceled','Canceled','Finding was canceled.',50)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

-- Bring the General Inspection Creator form in line with runtime storage.
update public.forge_form_fields ff
set field_key='location_id', updated_at=now()
from public.forge_form_definitions fd
where ff.form_id=fd.id
  and fd.form_key='inspections.general'
  and ff.field_key='location'
  and not exists (
    select 1 from public.forge_form_fields existing
    where existing.form_id=fd.id and existing.field_key='location_id'
  );

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select
  fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id,
  v.section_key, v.section_label, v.sort_order, v.width, v.required,
  v.can_hide, true, v.can_required, false, v.can_lookup
from (
  values
    ('template_id','Inspection Template','Select the checklist used for this inspection.',null,'select',null,'inspection','Inspection',5,'full',true,false,false,false),
    ('division_id','Division','Division associated with the inspection.',null,'division',null,'inspection','Inspection',25,'half',false,true,true,false),
    ('inspector_personnel_id','Inspector','Personnel record associated with the inspector.',null,'person',null,'inspection','Inspection',27,'half',false,true,true,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='inspections.general'
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
  and fd.form_key='inspections.general'
  and ff.field_key in ('template_id','inspection_date','location_id');

update public.forge_experience_elements
set settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"inspections.view"}'::jsonb,
    updated_at=now()
where element_key='nav.inspections';
