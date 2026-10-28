-- Port slice 2 from Forge Industrial Safety 1.0: workers' compensation.
--
-- 1.0 source: packages/database/src/schema/industrial.ts (industrial_workers_comp_*),
-- apps/platform-api/src/modules/industrial/workers-comp-helpers.ts, wc-restrictions-accommodations.ts,
-- industrial-domain.service.ts (workers' comp section, syncOshaFromWorkersCompCase) and
-- apps/industrial-web/src/lib/workers-comp-module.ts.
--
-- 1.0 kept the claim (carrier, claim number, adjuster, body parts), the OSHA linkage and the restriction
-- checklist in jsonb. 2.0 stores them as explicit columns. Days away and restricted days are calculated
-- from work-status periods (OSHA counting rules) instead of being typed in.
--
-- Workers' comp data includes medical details, so no table here is readable by members through RLS.
-- Medical encounters additionally require workers_comp.medical.view / workers_comp.medical.manage.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Carriers
-- ---------------------------------------------------------------------------

create table if not exists public.forge_wc_carriers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  policy_number text,
  contact_name text,
  phone text,
  email text,
  claims_address text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_wc_carriers_active_name_idx
  on public.forge_wc_carriers (organization_id, lower(btrim(name)))
  where is_active;

-- ---------------------------------------------------------------------------
-- Case numbers: WC-YYYY-NNNN per organization and injury year
-- ---------------------------------------------------------------------------

create table if not exists public.forge_wc_case_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, case_year)
);

create or replace function public.next_forge_wc_case_number(p_organization_id uuid, p_year integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_wc_case_sequences (organization_id, case_year, next_value)
  values (p_organization_id, p_year, 2)
  on conflict (organization_id, case_year)
  do update set next_value = public.forge_wc_case_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'WC-' || p_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public.next_forge_wc_case_number(uuid, integer) from public, anon, authenticated;
grant execute on function public.next_forge_wc_case_number(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------

create table if not exists public.forge_wc_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_number text not null,
  incident_id uuid references public.forge_incidents(id) on delete restrict,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  employee_name text not null check (length(btrim(employee_name)) > 0),
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  injury_date date not null,
  reported_date date,

  status text not null default 'active' check (status in ('active','closed','archived')),
  stage text not null default 'intake'
    check (stage in ('intake','investigation','medical_review','treatment','return_to_work','claim_admin','closed')),
  severity text check (severity in ('minor','moderate','restricted','lost_time','fatality')),

  -- Claim
  carrier_id uuid references public.forge_wc_carriers(id) on delete set null,
  is_self_pay boolean not null default false,
  claim_number text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  body_parts text,
  claim_notes text,

  -- Follow-up set by the case manager (1.0 "nextAction")
  next_action_label text,
  next_action_due date,
  next_action_priority text check (next_action_priority in ('high','medium','low')),

  -- OSHA linkage (1.0 kept this in source_payload)
  osha_recordable boolean not null default false,
  osha_privacy_case boolean not null default false,
  osha_case_type text
    check (osha_case_type in ('injury','skin_disorder','respiratory_condition','poisoning','hearing_loss','other_illness')),
  osha_case_outcome_override text
    check (osha_case_outcome_override in ('death','days_away','job_transfer_restriction','other_recordable')),
  osha_case_id uuid references public.forge_osha_cases(id) on delete set null,
  osha_synced_at timestamptz,

  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint forge_wc_cases_self_pay_carrier check (not (is_self_pay and carrier_id is not null)),
  constraint forge_wc_cases_privacy_recordable check (not osha_privacy_case or osha_recordable),
  -- 1.0: "Link an injury incident before marking this workers' compensation case as OSHA recordable."
  constraint forge_wc_cases_recordable_incident check (not osha_recordable or incident_id is not null),
  constraint forge_wc_cases_closed_stage check ((status = 'closed') = (stage = 'closed') or status = 'archived')
);

create unique index if not exists forge_wc_cases_number_idx
  on public.forge_wc_cases (organization_id, case_number);

-- 1.0 duplicate detection: same worker and injury date.
create unique index if not exists forge_wc_cases_person_injury_idx
  on public.forge_wc_cases (organization_id, personnel_id, injury_date)
  where status <> 'archived' and personnel_id is not null;

create index if not exists forge_wc_cases_org_status_idx
  on public.forge_wc_cases (organization_id, status, injury_date desc);

create index if not exists forge_wc_cases_incident_idx
  on public.forge_wc_cases (organization_id, incident_id);

-- ---------------------------------------------------------------------------
-- Work status periods (drive days away / restricted)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_wc_work_status_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_wc_cases(id) on delete cascade,
  work_status text not null check (work_status in ('full_duty','restricted','off_work')),
  start_date date not null,
  end_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_wc_work_status_period_order check (end_date is null or end_date >= start_date),
  -- A worker has one work status at a time.
  constraint forge_wc_work_status_no_overlap exclude using gist (
    case_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

create index if not exists forge_wc_work_status_case_idx
  on public.forge_wc_work_status_periods (organization_id, case_id, start_date);

-- ---------------------------------------------------------------------------
-- Restrictions and accommodations (1.0 restriction checklist, now explicit columns)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_wc_restrictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_wc_cases(id) on delete cascade,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active','lifted')),
  stand_walk_hours text check (stand_walk_hours in ('none','1-4','4-6','6-8','8-12','12-16')),
  sit_hours text check (sit_hours in ('unlimited','1-3','3-5','5-8')),
  lifting_level text
    check (lifting_level in ('sedentary','minimal-light','light','light-medium','medium','light-heavy','heavy')),
  upper_extremity text[] not null default '{}'
    check (upper_extremity <@ array[
      'no-repetitive-gripping','no-vibratory','no-lift-above-shoulder','no-lift-floor-shoulder',
      'no-lift-floor-waist','limit-push-pull','no-use-affected-arm-hand'
    ]::text[]),
  push_pull_limit_lbs integer check (push_pull_limit_lbs is null or push_pull_limit_lbs between 0 and 500),
  lower_extremity text[] not null default '{}'
    check (lower_extremity <@ array[
      'no-squatting-kneeling','no-stairs','no-ladders','no-foot-pedal','no-stooping-bending'
    ]::text[]),
  transitional_hours_per_day integer check (transitional_hours_per_day in (2,4,6,8)),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_wc_restriction_order check (end_date is null or end_date >= start_date)
);

create index if not exists forge_wc_restrictions_case_idx
  on public.forge_wc_restrictions (organization_id, case_id, start_date desc);

-- ---------------------------------------------------------------------------
-- Medical encounters (sensitive)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_wc_medical_encounters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_wc_cases(id) on delete cascade,
  encounter_date date not null,
  provider_name text,
  provider_specialty text,
  facility text,
  symptoms text,
  exam_findings text,
  diagnosis text,
  assessment text,
  treatment text,
  medication text,
  notes text,
  next_appointment_date date,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_wc_medical_case_idx
  on public.forge_wc_medical_encounters (organization_id, case_id, encounter_date desc);

-- ---------------------------------------------------------------------------
-- Weekly status updates (one per open case per Thursday)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_wc_weekly_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_wc_cases(id) on delete cascade,
  week_of date not null check (extract(isodow from week_of) = 4),
  notes text not null check (length(btrim(notes)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, week_of)
);

create index if not exists forge_wc_weekly_updates_week_idx
  on public.forge_wc_weekly_updates (organization_id, week_of);

create table if not exists public.forge_wc_case_activity (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_wc_cases(id) on delete cascade,
  activity_type text not null,
  message text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_wc_case_activity_case_idx
  on public.forge_wc_case_activity (organization_id, case_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_guard_wc_case()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_incident_org uuid;
begin
  perform public.forge_assert_same_org('public.locations', new.location_id, new.organization_id, 'Location');
  perform public.forge_assert_same_org('public.divisions', new.division_id, new.organization_id, 'Division');
  perform public.forge_assert_same_org('public.forge_personnel', new.personnel_id, new.organization_id, 'Employee');
  perform public.forge_assert_same_org('public.forge_wc_carriers', new.carrier_id, new.organization_id, 'Carrier');
  perform public.forge_assert_same_org('public.forge_osha_cases', new.osha_case_id, new.organization_id, 'OSHA case');

  if new.incident_id is not null then
    select organization_id into v_incident_org from public.forge_incidents where id = new.incident_id;
    if v_incident_org is distinct from new.organization_id then
      raise exception 'Incident does not belong to this organization.' using errcode = '23503';
    end if;
  end if;

  if new.injury_date > current_date then
    raise exception 'Injury date cannot be in the future.' using errcode = '23514';
  end if;

  if new.reported_date is not null and new.reported_date < new.injury_date then
    raise exception 'The reported date cannot be before the injury date.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'Workers'' comp cases cannot move between organizations.' using errcode = '23514';
    end if;
    if old.status = 'archived' and new.status = 'archived' then
      raise exception 'Archived workers'' comp cases cannot be edited.' using errcode = '23514';
    end if;
    new.row_version := old.row_version + 1;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_wc_cases_guard on public.forge_wc_cases;
create trigger forge_wc_cases_guard
before insert or update on public.forge_wc_cases
for each row execute function public.forge_guard_wc_case();

-- Child rows: same organization as their case, and the case must not be archived.
create or replace function public.forge_guard_wc_child()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_case public.forge_wc_cases;
begin
  select * into v_case from public.forge_wc_cases where id = new.case_id;

  if v_case.id is null or v_case.organization_id <> new.organization_id then
    raise exception 'Workers'' comp case does not belong to this organization.' using errcode = '23503';
  end if;

  if v_case.status = 'archived' then
    raise exception 'Archived workers'' comp cases cannot be changed.' using errcode = '23514';
  end if;

  -- Nested so the start_date reference is only evaluated on the table that has the column.
  if tg_table_name = 'forge_wc_work_status_periods' then
    if (to_jsonb(new) ->> 'start_date')::date < v_case.injury_date then
      raise exception 'Work status periods cannot start before the injury date.' using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_wc_work_status_guard on public.forge_wc_work_status_periods;
create trigger forge_wc_work_status_guard
before insert or update on public.forge_wc_work_status_periods
for each row execute function public.forge_guard_wc_child();

drop trigger if exists forge_wc_restrictions_guard on public.forge_wc_restrictions;
create trigger forge_wc_restrictions_guard
before insert or update on public.forge_wc_restrictions
for each row execute function public.forge_guard_wc_child();

drop trigger if exists forge_wc_medical_guard on public.forge_wc_medical_encounters;
create trigger forge_wc_medical_guard
before insert or update on public.forge_wc_medical_encounters
for each row execute function public.forge_guard_wc_child();

drop trigger if exists forge_wc_weekly_guard on public.forge_wc_weekly_updates;
create trigger forge_wc_weekly_guard
before insert or update on public.forge_wc_weekly_updates
for each row execute function public.forge_guard_wc_child();

create or replace function public.forge_guard_wc_carrier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_wc_carriers_guard on public.forge_wc_carriers;
create trigger forge_wc_carriers_guard
before insert or update on public.forge_wc_carriers
for each row execute function public.forge_guard_wc_carrier();

-- ---------------------------------------------------------------------------
-- OSHA sync: apply a workers' comp classification to its linked OSHA case in one statement.
-- The app computes day counts from work-status periods (OSHA calendar-day rules) and passes them in.
-- ---------------------------------------------------------------------------

create or replace function public.forge_apply_wc_to_osha_case(
  p_organization_id uuid,
  p_wc_case_id uuid,
  p_osha_case_id uuid,
  p_recordable boolean,
  p_privacy boolean,
  p_case_outcome text,
  p_case_type text,
  p_days_away integer,
  p_restricted_days integer,
  p_actor_user_id uuid
)
returns public.forge_osha_cases
language plpgsql
set search_path = public
as $$
declare
  v_wc public.forge_wc_cases;
  v_osha public.forge_osha_cases;
  v_days_away integer := least(greatest(coalesce(p_days_away, 0), 0), 180);
  v_restricted integer;
begin
  select * into v_wc from public.forge_wc_cases
  where id = p_wc_case_id and organization_id = p_organization_id
  for update;
  if v_wc.id is null then
    raise exception 'Workers'' comp case not found.' using errcode = 'P0002';
  end if;

  select * into v_osha from public.forge_osha_cases
  where id = p_osha_case_id and organization_id = p_organization_id
  for update;
  if v_osha.id is null then
    raise exception 'OSHA case not found.' using errcode = 'P0002';
  end if;
  if v_osha.status = 'voided' then
    raise exception 'The linked OSHA case is voided. Open a new OSHA case instead.' using errcode = '23514';
  end if;

  -- 1904.7(b)(3)(vii): stop counting at 180 days; days away are counted first.
  v_restricted := least(greatest(coalesce(p_restricted_days, 0), 0), 180 - v_days_away);

  if p_recordable then
    update public.forge_osha_cases
    set
      recordability = 'recordable',
      not_recordable_reason = null,
      is_privacy_case = coalesce(p_privacy, false),
      case_outcome = p_case_outcome,
      case_type = coalesce(p_case_type, 'injury'),
      days_away = v_days_away,
      restricted_days = v_restricted,
      updated_by = p_actor_user_id
    where id = p_osha_case_id
    returning * into v_osha;
  else
    update public.forge_osha_cases
    set
      recordability = 'not_recordable',
      not_recordable_reason = 'Marked not recordable on workers'' comp case ' || v_wc.case_number || '.',
      is_privacy_case = false,
      case_outcome = null,
      date_of_death = null,
      days_away = v_days_away,
      restricted_days = v_restricted,
      updated_by = p_actor_user_id
    where id = p_osha_case_id
    returning * into v_osha;
  end if;

  update public.forge_wc_cases
  set osha_case_id = p_osha_case_id, osha_synced_at = now(), updated_by = p_actor_user_id
  where id = p_wc_case_id;

  insert into public.forge_osha_case_activity (organization_id, case_id, activity_type, message, actor_user_id, metadata)
  values (
    p_organization_id,
    p_osha_case_id,
    'synced_from_workers_comp',
    'Updated from workers'' comp case ' || v_wc.case_number || '.',
    p_actor_user_id,
    jsonb_build_object('wc_case_id', p_wc_case_id, 'recordable', p_recordable, 'days_away', v_days_away, 'restricted_days', v_restricted)
  );

  return v_osha;
end;
$$;

revoke all on function public.forge_apply_wc_to_osha_case(uuid, uuid, uuid, boolean, boolean, text, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.forge_apply_wc_to_osha_case(uuid, uuid, uuid, boolean, boolean, text, text, integer, integer, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'forge_wc_carriers','forge_wc_case_sequences','forge_wc_cases','forge_wc_work_status_periods',
    'forge_wc_restrictions','forge_wc_medical_encounters','forge_wc_weekly_updates','forge_wc_case_activity'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('workers_comp.medical.view','workers_comp','View Workers'' Comp Medical Records','View medical encounters on workers'' compensation cases.','Workers Compensation','medical_view',true,true,'organization',true,false,true,'critical',50),
  ('workers_comp.medical.manage','workers_comp','Manage Workers'' Comp Medical Records','Add and edit medical encounters on workers'' compensation cases.','Workers Compensation','medical_manage',true,true,'organization',true,true,true,'critical',60),
  ('workers_comp.configure','workers_comp','Configure Workers'' Comp','Manage insurance carriers and edit other people''s workers'' comp notes.','Workers Compensation','configure',true,false,'organization',true,false,true,'sensitive',70)
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

-- Medical access is opt-in: only company administrators and owners get it by default.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in (
  'workers_comp.medical.view','workers_comp.medical.manage','workers_comp.configure'
)
where rt.template_key = 'company-admin'
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in (
  'workers_comp.medical.view','workers_comp.medical.manage','workers_comp.configure'
)
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

-- The read-only template grants every *.view permission; never include medical records in it.
delete from public.forge_role_template_permissions tp
using public.forge_role_templates rt, public.forge_permission_registry p
where tp.template_id = rt.id
  and tp.permission_id = p.id
  and rt.template_key = 'read-only'
  and p.permission_key = 'workers_comp.medical.view';

delete from public.forge_tenant_role_permissions rp
using public.forge_tenant_roles r, public.forge_permission_registry p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.role_key = 'read-only'
  and p.permission_key = 'workers_comp.medical.view';

-- ---------------------------------------------------------------------------
-- Navigation
-- ---------------------------------------------------------------------------

update public.forge_experience_elements
set
  settings = coalesce(settings, '{}'::jsonb) || '{"route_live":true,"required_permission":"workers_comp.view"}'::jsonb,
  updated_at = now()
where element_key = 'nav.workers_comp';
