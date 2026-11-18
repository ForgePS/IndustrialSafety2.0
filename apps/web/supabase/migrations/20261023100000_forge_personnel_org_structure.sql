-- Port slice 0 from Forge Industrial Safety 1.0: personnel organization structure and parity fields.
--
-- 1.0 source: packages/database/src/schema/industrial.ts (industrial_departments, industrial_positions,
-- industrial_employment_types, industrial_personnel) and apps/platform-api/src/modules/industrial/employee-number.ts.
--
-- What this adds:
--   * Departments (optionally tied to a Location / Division) and Positions (optionally tied to a Department).
--   * Personnel parity fields: middle/preferred name, suffix, employment type, termination date,
--     department, position, supervisor (as a personnel record), company / DOT driver flags.
--   * Employee-number matching key. 1.0 treats "EMP-0042", "emp 42" and "42" as the same person;
--     2.0 now enforces that with a normalized unique key.
--   * Sensitive personnel data (date of birth, sex, home address) needed for OSHA 301 and workers' comp,
--     plus emergency contacts. These live in separate service-role-only tables because forge_personnel
--     is readable by every organization member through RLS.
--   * Employment history written by trigger whenever status or assignment changes.
--   * Same-organization guards so a foreign UUID can never link records across tenants.

-- ---------------------------------------------------------------------------
-- Departments and positions
-- ---------------------------------------------------------------------------

create table if not exists public.forge_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  code text,
  description text,
  contact_personnel_id uuid references public.forge_personnel(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active department name per Location (or per company when no Location is set).
create unique index if not exists forge_departments_active_name_idx
  on public.forge_departments (
    organization_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  )
  where is_active;

create unique index if not exists forge_departments_code_idx
  on public.forge_departments (organization_id, lower(btrim(code)))
  where code is not null and is_active;

create index if not exists forge_departments_org_location_idx
  on public.forge_departments (organization_id, location_id);

create table if not exists public.forge_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.forge_departments(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  code text,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.0 enforced one position name per tenant; 2.0 scopes that to the department.
create unique index if not exists forge_positions_active_name_idx
  on public.forge_positions (
    organization_id,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  )
  where is_active;

create index if not exists forge_positions_org_department_idx
  on public.forge_positions (organization_id, department_id);

-- ---------------------------------------------------------------------------
-- Employee number matching key
-- ---------------------------------------------------------------------------

-- Mirrors 1.0 employeeNumberLookupKeys(): trim, case-insensitive, optional "EMP" prefix with
-- "-", "_" or whitespace separators, and leading zeros ignored for numeric numbers.
create or replace function public.forge_employee_number_key(raw text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when s.v = '' then null
    when s.v ~ '^[0-9]+$' then coalesce(nullif(ltrim(s.v, '0'), ''), '0')
    else s.v
  end
  from (
    select lower(regexp_replace(btrim(coalesce(raw, '')), '^emp[-_[:space:]]*', '', 'i')) as v
  ) s;
$$;

-- ---------------------------------------------------------------------------
-- Personnel parity columns
-- ---------------------------------------------------------------------------

alter table public.forge_personnel
  add column if not exists middle_name text,
  add column if not exists preferred_name text,
  add column if not exists suffix text,
  add column if not exists employment_type text,
  add column if not exists termination_date date,
  add column if not exists department_id uuid references public.forge_departments(id) on delete set null,
  add column if not exists position_id uuid references public.forge_positions(id) on delete set null,
  add column if not exists supervisor_personnel_id uuid references public.forge_personnel(id) on delete set null,
  add column if not exists is_company_driver boolean not null default false,
  add column if not exists is_dot_driver boolean not null default false,
  add column if not exists employee_number_key text
    generated always as (public.forge_employee_number_key(employee_number)) stored;

alter table public.forge_personnel
  drop constraint if exists forge_personnel_termination_after_hire;
alter table public.forge_personnel
  add constraint forge_personnel_termination_after_hire
  check (termination_date is null or hire_date is null or termination_date >= hire_date);

alter table public.forge_personnel
  drop constraint if exists forge_personnel_not_own_supervisor;
alter table public.forge_personnel
  add constraint forge_personnel_not_own_supervisor
  check (supervisor_personnel_id is null or supervisor_personnel_id <> id);

create unique index if not exists forge_personnel_employee_number_key_unique_idx
  on public.forge_personnel (organization_id, employee_number_key)
  where employee_number_key is not null and archived_at is null;

create index if not exists forge_personnel_org_department_idx
  on public.forge_personnel (organization_id, department_id)
  where archived_at is null;

create index if not exists forge_personnel_org_position_idx
  on public.forge_personnel (organization_id, position_id)
  where archived_at is null;

create index if not exists forge_personnel_supervisor_personnel_idx
  on public.forge_personnel (organization_id, supervisor_personnel_id)
  where supervisor_personnel_id is not null;

-- Finds the active personnel record matching any accepted spelling of an employee number.
-- Used by scan / kiosk flows (QR, training portal, supply requests) in later port slices.
create or replace function public.forge_find_personnel_by_employee_number(
  p_organization_id uuid,
  p_employee_number text
)
returns setof public.forge_personnel
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.forge_personnel p
  where p.organization_id = p_organization_id
    and p.archived_at is null
    and p.employee_number_key = public.forge_employee_number_key(p_employee_number)
  limit 1;
$$;

revoke all on function public.forge_find_personnel_by_employee_number(uuid, text) from public, anon, authenticated;
grant execute on function public.forge_find_personnel_by_employee_number(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Sensitive personnel data and emergency contacts (service role only)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_personnel_sensitive (
  personnel_id uuid primary key references public.forge_personnel(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date_of_birth date,
  sex text,
  address_line1 text,
  address_line2 text,
  city text,
  state_region text,
  postal_code text,
  country_code text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_personnel_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  priority smallint not null check (priority between 1 and 5),
  name text not null check (length(btrim(name)) > 0),
  relationship text,
  phone text,
  alternate_phone text,
  email text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (personnel_id, priority)
);

create index if not exists forge_personnel_emergency_contacts_person_idx
  on public.forge_personnel_emergency_contacts (organization_id, personnel_id, priority);

-- ---------------------------------------------------------------------------
-- Employment history
-- ---------------------------------------------------------------------------

create table if not exists public.forge_personnel_employment_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  event_type text not null check (event_type in (
    'hired','status_changed','terminated','rehired','department_changed','position_changed',
    'location_changed','division_changed','supervisor_changed','archived','restored'
  )),
  from_value text,
  to_value text,
  effective_date date,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_personnel_employment_events_person_idx
  on public.forge_personnel_employment_events (organization_id, personnel_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Same-organization guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_assert_same_org(
  p_table regclass,
  p_id uuid,
  p_organization_id uuid,
  p_label text
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_match boolean;
begin
  if p_id is null then
    return;
  end if;

  execute format('select exists (select 1 from %s where id = $1 and organization_id = $2)', p_table)
    into v_match
    using p_id, p_organization_id;

  if not v_match then
    raise exception '% does not belong to this organization.', p_label
      using errcode = '23503';
  end if;
end;
$$;

create or replace function public.forge_guard_department()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.locations', new.location_id, new.organization_id, 'Location');
  perform public.forge_assert_same_org('public.divisions', new.division_id, new.organization_id, 'Division');
  perform public.forge_assert_same_org('public.forge_personnel', new.contact_personnel_id, new.organization_id, 'Department contact');
  new.name := btrim(new.name);
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_departments_guard on public.forge_departments;
create trigger forge_departments_guard
before insert or update on public.forge_departments
for each row execute function public.forge_guard_department();

create or replace function public.forge_guard_position()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_departments', new.department_id, new.organization_id, 'Department');
  new.name := btrim(new.name);
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_positions_guard on public.forge_positions;
create trigger forge_positions_guard
before insert or update on public.forge_positions
for each row execute function public.forge_guard_position();

create or replace function public.forge_guard_personnel_structure()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_position_department uuid;
begin
  if tg_op = 'UPDATE'
     and new.department_id is not distinct from old.department_id
     and new.position_id is not distinct from old.position_id
     and new.supervisor_personnel_id is not distinct from old.supervisor_personnel_id then
    return new;
  end if;

  perform public.forge_assert_same_org('public.forge_departments', new.department_id, new.organization_id, 'Department');
  perform public.forge_assert_same_org('public.forge_positions', new.position_id, new.organization_id, 'Position');
  perform public.forge_assert_same_org('public.forge_personnel', new.supervisor_personnel_id, new.organization_id, 'Supervisor');

  if new.position_id is not null and new.department_id is not null then
    select department_id into v_position_department
    from public.forge_positions
    where id = new.position_id;

    if v_position_department is not null and v_position_department <> new.department_id then
      raise exception 'Position belongs to a different department.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists forge_personnel_structure_guard on public.forge_personnel;
create trigger forge_personnel_structure_guard
before insert or update on public.forge_personnel
for each row execute function public.forge_guard_personnel_structure();

create or replace function public.forge_guard_personnel_child()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_personnel', new.personnel_id, new.organization_id, 'Personnel record');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.forge_validate_personnel_sensitive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.date_of_birth is not null
     and (new.date_of_birth > current_date or new.date_of_birth < date '1900-01-01') then
    raise exception 'Date of birth must be between 1900-01-01 and today.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_personnel_sensitive_guard on public.forge_personnel_sensitive;
create trigger forge_personnel_sensitive_guard
before insert or update on public.forge_personnel_sensitive
for each row execute function public.forge_guard_personnel_child();

drop trigger if exists forge_personnel_sensitive_validate on public.forge_personnel_sensitive;
create trigger forge_personnel_sensitive_validate
before insert or update on public.forge_personnel_sensitive
for each row execute function public.forge_validate_personnel_sensitive();

drop trigger if exists forge_personnel_emergency_contacts_guard on public.forge_personnel_emergency_contacts;
create trigger forge_personnel_emergency_contacts_guard
before insert or update on public.forge_personnel_emergency_contacts
for each row execute function public.forge_guard_personnel_child();

-- ---------------------------------------------------------------------------
-- Employment history trigger
-- ---------------------------------------------------------------------------

create or replace function public.forge_record_personnel_employment_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := new.updated_by;
begin
  if tg_op = 'INSERT' then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, to_value, effective_date, actor_user_id)
    values
      (new.organization_id, new.id, 'hired', new.employment_status, coalesce(new.hire_date, current_date), coalesce(v_actor, new.created_by));
    return new;
  end if;

  if new.employment_status is distinct from old.employment_status then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, from_value, to_value, effective_date, actor_user_id)
    values (
      new.organization_id,
      new.id,
      case
        when new.employment_status = 'terminated' then 'terminated'
        when old.employment_status = 'terminated' then 'rehired'
        else 'status_changed'
      end,
      old.employment_status,
      new.employment_status,
      case when new.employment_status = 'terminated' then coalesce(new.termination_date, current_date) else current_date end,
      v_actor
    );
  end if;

  if new.department_id is distinct from old.department_id then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, from_value, to_value, effective_date, actor_user_id)
    values (new.organization_id, new.id, 'department_changed', old.department_id::text, new.department_id::text, current_date, v_actor);
  end if;

  if new.position_id is distinct from old.position_id then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, from_value, to_value, effective_date, actor_user_id)
    values (new.organization_id, new.id, 'position_changed', old.position_id::text, new.position_id::text, current_date, v_actor);
  end if;

  if new.location_id is distinct from old.location_id then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, from_value, to_value, effective_date, actor_user_id)
    values (new.organization_id, new.id, 'location_changed', old.location_id::text, new.location_id::text, current_date, v_actor);
  end if;

  if new.division_id is distinct from old.division_id then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, from_value, to_value, effective_date, actor_user_id)
    values (new.organization_id, new.id, 'division_changed', old.division_id::text, new.division_id::text, current_date, v_actor);
  end if;

  if new.supervisor_personnel_id is distinct from old.supervisor_personnel_id then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, from_value, to_value, effective_date, actor_user_id)
    values (new.organization_id, new.id, 'supervisor_changed', old.supervisor_personnel_id::text, new.supervisor_personnel_id::text, current_date, v_actor);
  end if;

  if new.archived_at is distinct from old.archived_at then
    insert into public.forge_personnel_employment_events
      (organization_id, personnel_id, event_type, effective_date, actor_user_id)
    values (
      new.organization_id,
      new.id,
      case when new.archived_at is null then 'restored' else 'archived' end,
      current_date,
      v_actor
    );
  end if;

  return new;
end;
$$;

drop trigger if exists forge_personnel_employment_events_trigger on public.forge_personnel;
create trigger forge_personnel_employment_events_trigger
after insert or update on public.forge_personnel
for each row execute function public.forge_record_personnel_employment_events();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.forge_departments enable row level security;
alter table public.forge_positions enable row level security;
alter table public.forge_personnel_sensitive enable row level security;
alter table public.forge_personnel_emergency_contacts enable row level security;
alter table public.forge_personnel_employment_events enable row level security;

-- Departments and positions are reference data every member may read (pickers, reports).
drop policy if exists forge_departments_member_select on public.forge_departments;
create policy forge_departments_member_select
on public.forge_departments for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_positions_member_select on public.forge_positions;
create policy forge_positions_member_select
on public.forge_positions for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_departments to authenticated;
grant select on public.forge_positions to authenticated;
grant all on public.forge_departments to service_role;
grant all on public.forge_positions to service_role;

-- Sensitive data, emergency contacts and employment history have NO authenticated policy.
-- They are read and written only by server actions that check personnel.view_sensitive /
-- personnel.edit_sensitive / personnel.view plus record scope.
revoke all on public.forge_personnel_sensitive from anon, authenticated;
revoke all on public.forge_personnel_emergency_contacts from anon, authenticated;
revoke all on public.forge_personnel_employment_events from anon, authenticated;
grant all on public.forge_personnel_sensitive to service_role;
grant all on public.forge_personnel_emergency_contacts to service_role;
grant all on public.forge_personnel_employment_events to service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('personnel.configure','personnel','Configure Personnel Structure','Create and maintain departments and positions.','Personnel','configure',true,false,'organization',false,false,true,'normal',90),
  ('personnel.edit_sensitive','personnel','Edit Sensitive Personnel Data','Edit date of birth, sex, home address and emergency contacts.','Personnel','edit_sensitive',true,true,'organization',true,false,true,'sensitive',65)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
  name=excluded.name,
  description=excluded.description,
  permission_group=excluded.permission_group,
  action=excluded.action,
  tenant_assignable=excluded.tenant_assignable,
  tenant_can_scope=excluded.tenant_can_scope,
  default_scope=excluded.default_scope,
  is_sensitive=excluded.is_sensitive,
  requires_confirmation=excluded.requires_confirmation,
  audit_use=excluded.audit_use,
  danger_level=excluded.danger_level,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'personnel.configure','personnel.view_sensitive','personnel.edit_sensitive'
)
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'personnel.configure','personnel.view_sensitive','personnel.edit_sensitive'
)
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select v.lookup_key, f.id, v.name, v.description, 'Personnel', v.sort_order, true, true, v.can_add, false, false
from (
  values
    ('personnel.employment_type','Employment Type','Full-time, part-time, seasonal and other employment types.',101,true),
    ('personnel.sex','Sex','Sex as recorded for OSHA Form 301 and workers'' compensation.',102,false)
) as v(lookup_key, name, description, sort_order, can_add)
join public.forge_feature_registry f on f.feature_key='personnel'
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
    ('personnel.employment_type','full_time','Full-time','Regular full-time employee.',10),
    ('personnel.employment_type','part_time','Part-time','Regular part-time employee.',20),
    ('personnel.employment_type','seasonal','Seasonal','Seasonal or harvest-season employee.',30),
    ('personnel.employment_type','temporary','Temporary','Temporary or agency-placed worker.',40),
    ('personnel.employment_type','contractor','Contractor','Contract worker tracked in personnel.',50),

    ('personnel.sex','male','Male',null,10),
    ('personnel.sex','female','Female',null,20),
    ('personnel.sex','not_specified','Not specified',null,30)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

-- ---------------------------------------------------------------------------
-- Personnel Profile form fields
-- ---------------------------------------------------------------------------

alter table public.forge_form_fields drop constraint if exists forge_form_fields_field_type_check;
alter table public.forge_form_fields
  add constraint forge_form_fields_field_type_check
  check (field_type in (
    'text','textarea','email','phone','number','currency','date','datetime','time',
    'select','multi_select','checkbox','switch','radio','file','photo','signature',
    'person','location','division','department','position','asset','vehicle','read_only'
  ));

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select
  fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id,
  v.section_key, v.section_label, v.sort_order, v.width, false, true, true, true, false, v.can_lookup
from (
  values
    ('middle_name','Middle Name',null,'Enter middle name','text',null,'identity','Identity',15,'third',false),
    ('preferred_name','Preferred Name','Name the person goes by, shown alongside the legal name.','Enter preferred name','text',null,'identity','Identity',22,'third',false),
    ('suffix','Suffix',null,'Jr., Sr., III','text',null,'identity','Identity',24,'third',false),
    ('employment_type','Employment Type','Full-time, part-time, seasonal and similar.',null,'select','personnel.employment_type','employment','Employment',42,'half',true),
    ('termination_date','Termination Date','Last day of employment. Leave blank for current personnel.',null,'date',null,'employment','Employment',47,'half',false),
    ('department_id','Department','Department this person works in.',null,'department',null,'assignment','Assignment',82,'half',false),
    ('position_id','Position','Position within the department.',null,'position',null,'assignment','Assignment',84,'half',false),
    ('supervisor_personnel_id','Supervisor','Direct supervisor from the personnel roster.',null,'person',null,'assignment','Assignment',86,'half',false),
    ('is_company_driver','Company Driver','Drives company vehicles.',null,'switch',null,'driver','Driver Status',90,'half',false),
    ('is_dot_driver','DOT-Regulated Driver','Requires a DOT driver qualification file.',null,'switch',null,'driver','Driver Status',92,'half',false)
) as v(field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, can_lookup)
join public.forge_form_definitions fd on fd.form_key='personnel.profile'
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
  can_change_lookup=excluded.can_change_lookup,
  updated_at=now();

-- Field types tie to columns and validation, so tenants may relabel these fields but not retype them.
update public.forge_form_fields ff
set can_change_input_type=false, updated_at=now()
from public.forge_form_definitions fd
where ff.form_id=fd.id
  and fd.form_key='personnel.profile'
  and ff.field_key in (
    'middle_name','preferred_name','suffix','employment_type','termination_date',
    'department_id','position_id','supervisor_personnel_id','is_company_driver','is_dot_driver'
  );

-- ---------------------------------------------------------------------------
-- Atomic emergency-contact replacement (server actions call this with the service role
-- after checking personnel.edit_sensitive and record scope).
-- ---------------------------------------------------------------------------

create or replace function public.forge_replace_personnel_emergency_contacts(
  p_organization_id uuid,
  p_personnel_id uuid,
  p_contacts jsonb,
  p_actor_user_id uuid
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.forge_assert_same_org('public.forge_personnel', p_personnel_id, p_organization_id, 'Personnel record');

  if jsonb_typeof(coalesce(p_contacts, '[]'::jsonb)) <> 'array' then
    raise exception 'Emergency contacts must be a list.' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_contacts, '[]'::jsonb)) > 5 then
    raise exception 'No more than five emergency contacts are allowed.' using errcode = '22023';
  end if;

  delete from public.forge_personnel_emergency_contacts
  where organization_id = p_organization_id
    and personnel_id = p_personnel_id;

  insert into public.forge_personnel_emergency_contacts
    (organization_id, personnel_id, priority, name, relationship, phone, alternate_phone, email, updated_by)
  select
    p_organization_id,
    p_personnel_id,
    c.ordinality::smallint,
    btrim(c.value->>'name'),
    nullif(btrim(coalesce(c.value->>'relationship', '')), ''),
    nullif(btrim(coalesce(c.value->>'phone', '')), ''),
    nullif(btrim(coalesce(c.value->>'alternate_phone', '')), ''),
    nullif(btrim(coalesce(c.value->>'email', '')), ''),
    p_actor_user_id
  from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) with ordinality as c(value, ordinality);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.forge_replace_personnel_emergency_contacts(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.forge_replace_personnel_emergency_contacts(uuid, uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Close direct member writes to forge_personnel.
-- The original runtime migration let any organization member insert or update any personnel
-- row through PostgREST, bypassing personnel.create / personnel.edit and scope. All app writes
-- already go through server actions with the service role, so members keep read access only
-- (matching CAPA, Tasks and the other runtime modules).
-- ---------------------------------------------------------------------------

drop policy if exists forge_personnel_member_insert on public.forge_personnel;
drop policy if exists forge_personnel_member_update on public.forge_personnel;
revoke insert, update, delete on public.forge_personnel from anon, authenticated;
