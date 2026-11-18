-- Forge Industrial Safety 2.0 Incident runtime.
-- Creator-driven forms/lookups, explicit workflow states, scoped access and audit-ready records.

create table if not exists public.forge_incident_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, incident_year)
);

create or replace function public.next_forge_incident_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_number integer;
begin
  insert into public.forge_incident_sequences (organization_id, incident_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, incident_year)
  do update set next_value = public.forge_incident_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'INC-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_incident_number(uuid) from public;
grant execute on function public.next_forge_incident_number(uuid) to service_role;

create table if not exists public.forge_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_number text not null,
  status text not null default 'draft'
    check (status in ('draft','submitted','returned','approved','closed')),
  incident_type text not null default 'other',
  severity text not null default 'minor',
  occurred_at timestamptz not null,
  reported_at timestamptz not null default now(),
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  reported_by_user_id uuid references auth.users(id) on delete set null,
  reported_by_personnel_id uuid references public.forge_personnel(id) on delete set null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  summary text not null,
  description text,
  immediate_actions text,
  involves_injury boolean not null default false,
  involves_vehicle boolean not null default false,
  property_damage boolean not null default false,
  osha_review_flag boolean not null default false,
  workers_comp_review_flag boolean not null default false,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  returned_at timestamptz,
  returned_by uuid references auth.users(id) on delete set null,
  return_reason text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, incident_number)
);

create index if not exists forge_incidents_org_status_idx
  on public.forge_incidents(organization_id, status, occurred_at desc);

create index if not exists forge_incidents_org_location_idx
  on public.forge_incidents(organization_id, location_id, occurred_at desc);

create index if not exists forge_incidents_org_division_idx
  on public.forge_incidents(organization_id, division_id, occurred_at desc);

create index if not exists forge_incidents_reporter_idx
  on public.forge_incidents(organization_id, reported_by_user_id, occurred_at desc);

create table if not exists public.forge_incident_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.forge_incidents(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  role text not null default 'involved'
    check (role in ('reporter','involved','injured','witness','supervisor','investigator')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_incident_people_incident_idx
  on public.forge_incident_people(organization_id, incident_id, role);

create table if not exists public.forge_incident_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.forge_incidents(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_incident_activity_incident_idx
  on public.forge_incident_activity(organization_id, incident_id, created_at desc);

alter table public.forge_incident_sequences enable row level security;
alter table public.forge_incidents enable row level security;
alter table public.forge_incident_people enable row level security;
alter table public.forge_incident_activity enable row level security;

drop policy if exists forge_incidents_member_select on public.forge_incidents;
create policy forge_incidents_member_select
on public.forge_incidents
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_incident_people_member_select on public.forge_incident_people;
create policy forge_incident_people_member_select
on public.forge_incident_people
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_incident_activity_member_select on public.forge_incident_activity;
create policy forge_incident_activity_member_select
on public.forge_incident_activity
for select
to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_incidents to authenticated;
grant select on public.forge_incident_people to authenticated;
grant select on public.forge_incident_activity to authenticated;

grant all on public.forge_incident_sequences to service_role;
grant all on public.forge_incidents to service_role;
grant all on public.forge_incident_people to service_role;
grant all on public.forge_incident_activity to service_role;
grant usage, select on sequence public.forge_incident_activity_id_seq to service_role;

-- Additional incident workflow permissions.
insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('incidents.submit','incidents','Submit Incidents','Submit draft or returned incidents for review.','Incidents','submit',true,true,'organization',false,true,true,'normal',35),
  ('incidents.close','incidents','Close Incidents','Close approved incident records.','Incidents','close',true,true,'organization',true,true,true,'sensitive',45)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
  name=excluded.name,
  description=excluded.description,
  tenant_assignable=true,
  tenant_can_scope=true,
  audit_use=true,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('incidents.submit','incidents.close')
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update
set allowed=true, scope='organization';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='incidents.submit'
where rt.template_key in ('standard-user','supervisor')
on conflict (template_id, permission_id) do update
set allowed=true, scope=excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true,
  case
    when r.role_key in ('employee','supervisor') and p.permission_key='incidents.submit' then 'own'
    else 'organization'
  end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('incidents.submit','incidents.close')
where
  (p.permission_key='incidents.submit' and r.role_key in ('employee','supervisor','company-administrator','company-owner'))
  or
  (p.permission_key='incidents.close' and r.role_key in ('company-administrator','company-owner'))
on conflict (role_id, permission_id) do update
set allowed=true, scope=excluded.scope;

-- Incident-specific dropdowns.
insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Incidents',
  v.sort_order,
  true,
  true,
  v.can_add,
  false,
  false
from (
  values
    ('incidents.type','Incident Type','Classification used for incident reporting.',121,true),
    ('incidents.status','Incident Status','Workflow status labels used by incident records.',122,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='incidents'
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
    ('incidents.type','injury','Injury / Illness','Incident involving an injury or illness.',10),
    ('incidents.type','near_miss','Near Miss','Event with potential for injury or loss.',20),
    ('incidents.type','property_damage','Property Damage','Damage to company or third-party property.',30),
    ('incidents.type','vehicle','Vehicle Incident','Incident involving a vehicle or mobile equipment.',40),
    ('incidents.type','environmental','Environmental','Environmental release or related event.',50),
    ('incidents.type','security','Security','Security-related incident.',60),
    ('incidents.type','other','Other','Other incident classification.',70),

    ('incidents.status','draft','Draft','Incident is being prepared.',10),
    ('incidents.status','submitted','Submitted','Incident has been submitted for review.',20),
    ('incidents.status','returned','Returned','Incident was returned for correction or more information.',30),
    ('incidents.status','approved','Approved','Incident has been approved.',40),
    ('incidents.status','closed','Closed','Incident workflow is complete.',50)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

-- Align the existing Incident Report form with runtime storage.
update public.forge_form_fields ff
set field_key='location_id',
    updated_at=now()
from public.forge_form_definitions fd
where ff.form_id=fd.id
  and fd.form_key='incidents.report'
  and ff.field_key='location'
  and not exists (
    select 1
    from public.forge_form_fields existing
    where existing.form_id=fd.id
      and existing.field_key='location_id'
  );

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select
  fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id,
  v.section_key, v.section_label, v.sort_order, v.width, v.required,
  v.can_hide, true, v.can_required, false, v.can_lookup
from (
  values
    ('incident_type','Incident Type','Choose the best classification for this incident.',null,'select','incidents.type','incident','Incident Details',5,'half',true,false,false,true),
    ('division_id','Division','Division associated with the incident.',null,'division',null,'incident','Incident Details',35,'half',false,true,true,false),
    ('reported_by_personnel_id','Reported By','Personnel record associated with the reporter.',null,'person',null,'people','People',45,'half',false,true,true,false),
    ('description','Detailed Description','Provide additional detail about what occurred.','Enter incident details','textarea',null,'incident','Incident Details',45,'full',false,true,true,false),
    ('involves_injury','Injury / Illness Involved','Indicate whether the event involved an injury or illness.',null,'switch',null,'review','Review Flags',60,'third',false,true,false,false),
    ('involves_vehicle','Vehicle Involved','Indicate whether a vehicle or mobile equipment was involved.',null,'switch',null,'review','Review Flags',70,'third',false,true,false,false),
    ('property_damage','Property Damage','Indicate whether property damage occurred.',null,'switch',null,'review','Review Flags',80,'third',false,true,false,false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key='incidents.report'
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

-- Protect structural incident fields while allowing presentation customization.
update public.forge_form_fields ff
set
  can_hide=false,
  can_change_required=false,
  can_change_input_type=false,
  updated_at=now()
from public.forge_form_definitions fd
where ff.form_id=fd.id
  and fd.form_key='incidents.report'
  and ff.field_key in ('incident_type','occurred_at','severity','summary');

update public.forge_experience_elements
set
  settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"incidents.view"}'::jsonb,
  updated_at=now()
where element_key='nav.incidents';
