-- Port slice 1 from Forge Industrial Safety 1.0: OSHA recordkeeping (29 CFR 1904).
--
-- 1.0 source: apps/platform-api/src/modules/industrial/osha-helpers.ts, performance-report-helpers.ts,
-- industrial-domain.service.ts (OSHA section) and apps/industrial-web/src/components/osha/*.
-- 1.0 kept nearly every OSHA field in a source_payload jsonb blob and the Form 300A metadata inside the
-- site's payload. 2.0 stores them as explicit, constrained columns.
--
-- Model:
--   * forge_osha_cases: one case per injured/ill employee per incident. Holds the Form 300 log row and
--     the Form 301 incident report. The establishment is the Location.
--   * forge_osha_establishment_years: Form 300A annual summary inputs per Location and year, with
--     certification and a frozen snapshot of the totals at certification time.
--   * forge_osha_case_activity: case history (service role only).
--
-- OSHA data contains injury and medical details, so none of these tables are readable by members
-- through RLS. Access goes through server actions that check osha.* permissions and Location scope.

-- ---------------------------------------------------------------------------
-- Case numbers: "YYYY-NNN" per Location (establishment) and calendar year
-- ---------------------------------------------------------------------------

create table if not exists public.forge_osha_case_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  case_year integer not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (organization_id, location_id, case_year)
);

create or replace function public.next_forge_osha_case_number(
  p_organization_id uuid,
  p_location_id uuid,
  p_year integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_osha_case_sequences (organization_id, location_id, case_year, next_value)
  values (p_organization_id, p_location_id, p_year, 2)
  on conflict (organization_id, location_id, case_year)
  do update set next_value = public.forge_osha_case_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return p_year::text || '-' || lpad(v_number::text, 3, '0');
end;
$$;

revoke all on function public.next_forge_osha_case_number(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.next_forge_osha_case_number(uuid, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Cases (Form 300 row + Form 301)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_osha_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_number text not null,
  incident_id uuid references public.forge_incidents(id) on delete restrict,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  location_id uuid not null references public.locations(id) on delete restrict,
  division_id uuid references public.divisions(id) on delete set null,

  -- Form 300 columns B-F
  employee_name text not null check (length(btrim(employee_name)) > 0),
  job_title text,
  injury_date date not null,
  calendar_year integer generated always as (extract(year from injury_date)::integer) stored,
  event_location text,
  injury_description text,

  -- Classification (Form 300 columns G-M)
  recordability text not null default 'pending'
    check (recordability in ('pending','recordable','not_recordable')),
  not_recordable_reason text,
  is_privacy_case boolean not null default false,
  case_outcome text
    check (case_outcome in ('death','days_away','job_transfer_restriction','other_recordable')),
  case_type text
    check (case_type in ('injury','skin_disorder','respiratory_condition','poisoning','hearing_loss','other_illness')),
  days_away integer not null default 0 check (days_away >= 0),
  restricted_days integer not null default 0 check (restricted_days >= 0),
  date_of_death date,

  -- Form 301: employee (snapshotted from personnel when the case is opened)
  employee_street text,
  employee_city text,
  employee_state text,
  employee_zip text,
  employee_date_of_birth date,
  employee_date_hired date,
  employee_sex text check (employee_sex in ('male','female')),

  -- Form 301: health care professional
  physician_name text,
  treatment_facility text,
  treatment_street text,
  treatment_city text,
  treatment_state text,
  treatment_zip text,
  treated_in_er boolean,
  hospitalized_overnight boolean,

  -- Form 301: case details
  time_began_work time,
  time_of_event time,
  time_cannot_be_determined boolean not null default false,
  activity_before text,
  what_happened text,
  injury_or_illness text,
  object_or_substance text,

  -- Form 301: completed by
  completed_by_name text,
  completed_by_title text,
  completed_by_phone text,
  completed_date date,

  -- Lifecycle
  status text not null default 'open' check (status in ('open','closed','voided')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1904.7(b)(3)(vii): stop counting days away / restricted once the total reaches 180.
  constraint forge_osha_cases_day_cap check (days_away + restricted_days <= 180),
  -- 1904.29(b)(6): privacy cases are a kind of recordable case.
  constraint forge_osha_cases_privacy_recordable check (not is_privacy_case or recordability = 'recordable'),
  -- A recordable case needs its single most-serious outcome (G-J) and its type (M).
  constraint forge_osha_cases_recordable_complete check (
    recordability <> 'recordable' or (case_outcome is not null and case_type is not null)
  ),
  constraint forge_osha_cases_not_recordable_clear check (
    recordability = 'recordable' or (case_outcome is null and not is_privacy_case)
  ),
  constraint forge_osha_cases_death_date check (date_of_death is null or case_outcome = 'death'),
  constraint forge_osha_cases_void_reason check (status <> 'voided' or length(btrim(coalesce(void_reason, ''))) > 0)
);

create unique index if not exists forge_osha_cases_number_idx
  on public.forge_osha_cases (organization_id, location_id, calendar_year, case_number);

-- One active case per employee per incident.
create unique index if not exists forge_osha_cases_incident_person_idx
  on public.forge_osha_cases (incident_id, personnel_id)
  where status <> 'voided' and incident_id is not null and personnel_id is not null;

create index if not exists forge_osha_cases_org_year_idx
  on public.forge_osha_cases (organization_id, calendar_year, location_id)
  where status <> 'voided';

create index if not exists forge_osha_cases_incident_idx
  on public.forge_osha_cases (organization_id, incident_id);

create table if not exists public.forge_osha_case_activity (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_osha_cases(id) on delete cascade,
  activity_type text not null,
  message text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_osha_case_activity_case_idx
  on public.forge_osha_case_activity (organization_id, case_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Form 300A establishment summary inputs and certification
-- ---------------------------------------------------------------------------

create table if not exists public.forge_osha_establishment_years (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  year integer not null check (year between 2000 and 2100),

  establishment_name text,
  street text,
  city text,
  state text,
  zip text,
  industry_description text,
  naics_code text check (naics_code is null or naics_code ~ '^[0-9]{2,6}$'),
  annual_average_employees integer check (annual_average_employees is null or annual_average_employees >= 0),
  total_hours_worked numeric(14,2) check (total_hours_worked is null or total_hours_worked >= 0),

  status text not null default 'draft' check (status in ('draft','certified')),
  certifier_name text,
  certifier_title text,
  certifier_phone text,
  certification_date date,
  certified_at timestamptz,
  certified_by uuid references auth.users(id) on delete set null,

  -- Totals frozen at certification (Form 300A sections).
  certified_deaths integer,
  certified_days_away_cases integer,
  certified_transfer_cases integer,
  certified_other_cases integer,
  certified_days_away integer,
  certified_restricted_days integer,
  certified_injuries integer,
  certified_skin_disorders integer,
  certified_respiratory_conditions integer,
  certified_poisonings integer,
  certified_hearing_loss integer,
  certified_other_illnesses integer,

  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, year),

  constraint forge_osha_establishment_years_certified_complete check (
    status <> 'certified' or (
      length(btrim(coalesce(certifier_name, ''))) > 0
      and length(btrim(coalesce(certifier_title, ''))) > 0
      and certification_date is not null
      and annual_average_employees is not null
      and total_hours_worked is not null
      and certified_deaths is not null
    )
  )
);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_guard_osha_case()
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

  if new.incident_id is not null then
    select organization_id into v_incident_org from public.forge_incidents where id = new.incident_id;
    if v_incident_org is distinct from new.organization_id then
      raise exception 'Incident does not belong to this organization.' using errcode = '23503';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'OSHA cases cannot move between organizations.' using errcode = '23514';
    end if;
    if old.status = 'voided' and new.status = 'voided' then
      raise exception 'Voided OSHA cases cannot be edited.' using errcode = '23514';
    end if;
    -- Moving a case to another establishment or year would break its case number.
    if new.location_id <> old.location_id
       or extract(year from new.injury_date) <> extract(year from old.injury_date) then
      raise exception 'Change the establishment or injury year by voiding this case and opening a new one.'
        using errcode = '23514';
    end if;
    new.row_version := old.row_version + 1;
  end if;

  if new.injury_date > current_date then
    raise exception 'Injury date cannot be in the future.' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_osha_cases_guard on public.forge_osha_cases;
create trigger forge_osha_cases_guard
before insert or update on public.forge_osha_cases
for each row execute function public.forge_guard_osha_case();

create or replace function public.forge_guard_osha_establishment_year()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.locations', new.location_id, new.organization_id, 'Location');

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id
       or new.location_id <> old.location_id
       or new.year <> old.year then
      raise exception 'An establishment summary cannot change its Location or year.' using errcode = '23514';
    end if;

    -- A certified summary is frozen; it must be reopened (status back to draft) before editing.
    if old.status = 'certified' and new.status = 'certified' then
      raise exception 'This summary is certified. Reopen it before making changes.' using errcode = '23514';
    end if;

    new.row_version := old.row_version + 1;
  end if;

  if new.status = 'draft' then
    new.certified_at := null;
    new.certified_by := null;
    new.certified_deaths := null;
    new.certified_days_away_cases := null;
    new.certified_transfer_cases := null;
    new.certified_other_cases := null;
    new.certified_days_away := null;
    new.certified_restricted_days := null;
    new.certified_injuries := null;
    new.certified_skin_disorders := null;
    new.certified_respiratory_conditions := null;
    new.certified_poisonings := null;
    new.certified_hearing_loss := null;
    new.certified_other_illnesses := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_osha_establishment_years_guard on public.forge_osha_establishment_years;
create trigger forge_osha_establishment_years_guard
before insert or update on public.forge_osha_establishment_years
for each row execute function public.forge_guard_osha_establishment_year();

-- ---------------------------------------------------------------------------
-- Form 300A totals (single source of truth for the summary, rates and certification)
-- ---------------------------------------------------------------------------

create or replace function public.forge_osha_300a_totals(
  p_organization_id uuid,
  p_year integer,
  p_location_ids uuid[] default null
)
returns table (
  location_id uuid,
  deaths integer,
  days_away_cases integer,
  transfer_cases integer,
  other_cases integer,
  days_away integer,
  restricted_days integer,
  injuries integer,
  skin_disorders integer,
  respiratory_conditions integer,
  poisonings integer,
  hearing_loss integer,
  other_illnesses integer,
  recordable_cases integer
)
language sql
stable
set search_path = public
as $$
  select
    c.location_id,
    count(*) filter (where c.case_outcome = 'death')::integer,
    count(*) filter (where c.case_outcome = 'days_away')::integer,
    count(*) filter (where c.case_outcome = 'job_transfer_restriction')::integer,
    count(*) filter (where c.case_outcome = 'other_recordable')::integer,
    coalesce(sum(c.days_away), 0)::integer,
    coalesce(sum(c.restricted_days), 0)::integer,
    count(*) filter (where c.case_type = 'injury')::integer,
    count(*) filter (where c.case_type = 'skin_disorder')::integer,
    count(*) filter (where c.case_type = 'respiratory_condition')::integer,
    count(*) filter (where c.case_type = 'poisoning')::integer,
    count(*) filter (where c.case_type = 'hearing_loss')::integer,
    count(*) filter (where c.case_type = 'other_illness')::integer,
    count(*)::integer
  from public.forge_osha_cases c
  where c.organization_id = p_organization_id
    and c.calendar_year = p_year
    and c.recordability = 'recordable'
    and c.status <> 'voided'
    and (p_location_ids is null or c.location_id = any(p_location_ids))
  group by c.location_id;
$$;

revoke all on function public.forge_osha_300a_totals(uuid, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.forge_osha_300a_totals(uuid, integer, uuid[]) to service_role;

-- Certifies a summary atomically: totals are computed and frozen in the same statement.
create or replace function public.forge_certify_osha_establishment_year(
  p_organization_id uuid,
  p_summary_id uuid,
  p_expected_row_version integer,
  p_certifier_name text,
  p_certifier_title text,
  p_certifier_phone text,
  p_certification_date date,
  p_actor_user_id uuid
)
returns public.forge_osha_establishment_years
language plpgsql
set search_path = public
as $$
declare
  v_summary public.forge_osha_establishment_years;
  v_totals record;
begin
  select * into v_summary
  from public.forge_osha_establishment_years
  where id = p_summary_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Establishment summary not found.' using errcode = 'P0002';
  end if;

  if v_summary.row_version <> p_expected_row_version then
    raise exception 'This summary changed since you opened it. Reload and try again.' using errcode = '40001';
  end if;

  if v_summary.status = 'certified' then
    raise exception 'This summary is already certified.' using errcode = '23514';
  end if;

  select * into v_totals
  from public.forge_osha_300a_totals(p_organization_id, v_summary.year, array[v_summary.location_id]);

  update public.forge_osha_establishment_years
  set
    status = 'certified',
    certifier_name = btrim(p_certifier_name),
    certifier_title = btrim(p_certifier_title),
    certifier_phone = nullif(btrim(coalesce(p_certifier_phone, '')), ''),
    certification_date = p_certification_date,
    certified_at = now(),
    certified_by = p_actor_user_id,
    updated_by = p_actor_user_id,
    certified_deaths = coalesce(v_totals.deaths, 0),
    certified_days_away_cases = coalesce(v_totals.days_away_cases, 0),
    certified_transfer_cases = coalesce(v_totals.transfer_cases, 0),
    certified_other_cases = coalesce(v_totals.other_cases, 0),
    certified_days_away = coalesce(v_totals.days_away, 0),
    certified_restricted_days = coalesce(v_totals.restricted_days, 0),
    certified_injuries = coalesce(v_totals.injuries, 0),
    certified_skin_disorders = coalesce(v_totals.skin_disorders, 0),
    certified_respiratory_conditions = coalesce(v_totals.respiratory_conditions, 0),
    certified_poisonings = coalesce(v_totals.poisonings, 0),
    certified_hearing_loss = coalesce(v_totals.hearing_loss, 0),
    certified_other_illnesses = coalesce(v_totals.other_illnesses, 0)
  where id = p_summary_id
  returning * into v_summary;

  return v_summary;
end;
$$;

revoke all on function public.forge_certify_osha_establishment_year(uuid, uuid, integer, text, text, text, date, uuid) from public, anon, authenticated;
grant execute on function public.forge_certify_osha_establishment_year(uuid, uuid, integer, text, text, text, date, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: service role only
-- ---------------------------------------------------------------------------

alter table public.forge_osha_case_sequences enable row level security;
alter table public.forge_osha_cases enable row level security;
alter table public.forge_osha_case_activity enable row level security;
alter table public.forge_osha_establishment_years enable row level security;

revoke all on public.forge_osha_case_sequences from anon, authenticated;
revoke all on public.forge_osha_cases from anon, authenticated;
revoke all on public.forge_osha_case_activity from anon, authenticated;
revoke all on public.forge_osha_establishment_years from anon, authenticated;

grant all on public.forge_osha_case_sequences to service_role;
grant all on public.forge_osha_cases to service_role;
grant all on public.forge_osha_case_activity to service_role;
grant all on public.forge_osha_establishment_years to service_role;

-- ---------------------------------------------------------------------------
-- Navigation: OSHA is now a live route
-- ---------------------------------------------------------------------------

update public.forge_experience_elements
set
  settings = coalesce(settings, '{}'::jsonb) || '{"route_live":true,"required_permission":"osha.view"}'::jsonb,
  updated_at = now()
where element_key = 'nav.osha';
