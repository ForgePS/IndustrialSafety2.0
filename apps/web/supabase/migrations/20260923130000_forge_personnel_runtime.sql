-- Forge Industrial Safety 2.0 Personnel runtime foundation.
-- First end-to-end runtime module driven by Creator forms, lookups and permissions.

create table if not exists public.forge_personnel (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  employee_number text,
  employment_status text not null default 'active',
  job_title text,
  email text,
  phone text,
  hire_date date,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  supervisor_user_id uuid references auth.users(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_personnel_employee_number_unique_idx
  on public.forge_personnel(organization_id, employee_number)
  where employee_number is not null and archived_at is null;

create index if not exists forge_personnel_org_name_idx
  on public.forge_personnel(organization_id, last_name, first_name);

create index if not exists forge_personnel_org_location_idx
  on public.forge_personnel(organization_id, location_id)
  where archived_at is null;

create index if not exists forge_personnel_org_division_idx
  on public.forge_personnel(organization_id, division_id)
  where archived_at is null;

create index if not exists forge_personnel_auth_user_idx
  on public.forge_personnel(organization_id, auth_user_id)
  where auth_user_id is not null;

alter table public.forge_personnel enable row level security;

drop policy if exists forge_personnel_member_select on public.forge_personnel;
create policy forge_personnel_member_select
on public.forge_personnel
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_personnel_member_insert on public.forge_personnel;
create policy forge_personnel_member_insert
on public.forge_personnel
for insert
to authenticated
with check (public.is_org_member(organization_id));

drop policy if exists forge_personnel_member_update on public.forge_personnel;
create policy forge_personnel_member_update
on public.forge_personnel
for update
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

grant select, insert, update on public.forge_personnel to authenticated;
grant all on public.forge_personnel to service_role;

-- Complete the initial Personnel Profile form.
insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_change_required, can_change_lookup)
select fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, null, v.section_key, v.section_label, v.sort_order, v.width, v.required, v.can_required, false
from (
  values
    ('job_title','Job Title','Current title or position.','Enter job title','text','employment','Employment',45,'half',false,true),
    ('hire_date','Hire Date','Date employment began.',null,'date','employment','Employment',46,'half',false,true),
    ('location_id','Location','Primary assigned Location.',null,'location','assignment','Assignment',70,'half',false,true),
    ('division_id','Division','Primary assigned Division.',null,'division','assignment','Assignment',80,'half',false,true)
) as v(field_key, label, help_text, placeholder, field_type, section_key, section_label, sort_order, width, required, can_required)
join public.forge_form_definitions fd on fd.form_key = 'personnel.profile'
on conflict (form_id, field_key) do update
set
  label = excluded.label,
  help_text = excluded.help_text,
  placeholder = excluded.placeholder,
  field_type = excluded.field_type,
  section_key = excluded.section_key,
  section_label = excluded.section_label,
  sort_order = excluded.sort_order,
  width = excluded.width,
  is_required = excluded.is_required,
  updated_at = now();

update public.forge_experience_elements
set
  settings = coalesce(settings, '{}'::jsonb) ||
    '{"route_live":true,"required_permission":"personnel.view"}'::jsonb,
  updated_at = now()
where element_key = 'nav.personnel';
