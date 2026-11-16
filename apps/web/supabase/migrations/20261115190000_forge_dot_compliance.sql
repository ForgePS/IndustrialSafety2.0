-- Port slice 5: DOT Compliance from Industrial 1.0 (docs/PORT_S5_DOT.md).
--
-- 1.0 kept a driver qualification file (DQF) as one JSON payload in a generic record table and
-- guessed which rows were DQFs. 2.0 stores:
--   * forge_dot_driver_files    one DQF per driver (personnel), credentials as columns
--   * forge_dot_dqf_documents   one row per DQF document (date placed, on file, extra text)
--   * forge_dot_files           uploaded copies (private bucket forge-dot)
--   * forge_dot_company_drivers the insurance MVR roster (company drivers)
--   * forge_dot_mvr_events      MVR consent, report and annual-sample history
--   * forge_dot_records         other DOT records: roadside inspections, accidents, D&A, company, other
--   * forge_dot_settings        per organization: hidden documents, company-driver rule, insurer, sample %
--
-- Personnel stay the source of truth for who is a driver:
--   * a DQF sets personnel.is_dot_driver; turning the flag off archives the DQF; turning it back on
--     restores the DQF archived that way
--   * terminating, deactivating or archiving a person archives their DQF and clears the flag
--   * personnel.is_company_driver keeps a roster row (removed when the flag goes off)
-- DVIRs and vehicles belong to the Fleet port.

-- ---------------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------------

create table if not exists public.forge_dot_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('dqf','record')),
  next_value integer not null default 1,
  primary key (organization_id, kind)
);

create or replace function public.next_forge_dot_number(p_organization_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_dot_sequences (organization_id, kind, next_value)
  values (p_organization_id, p_kind, 2)
  on conflict (organization_id, kind)
  do update set next_value = public.forge_dot_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return case p_kind when 'dqf' then 'DQF-' else 'DOT-' end || lpad(v_number::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table if not exists public.forge_dot_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  hidden_document_types text[] not null default array['employment_eligibility_i9','cdl_affidavit_ar','cdl_affidavit_ms'],
  dot_drivers_are_company_drivers boolean not null default false,
  insurer_name text,
  insurer_email text,
  mvr_sample_percent integer not null default 10 check (mvr_sample_percent between 1 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Driver qualification files
-- ---------------------------------------------------------------------------

create table if not exists public.forge_dot_driver_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete restrict,
  file_number text not null,
  license_class text not null default 'cdl' check (license_class in ('cdl','non_cdl')),
  license_number text,
  license_state text check (license_state is null or license_state ~ '^[A-Z]{2}$'),
  license_expires_on date,
  driver_restrictions text,
  medical_certificate_expires_on date,
  national_registry_number text,
  registry_verified boolean not null default false,
  diabetic_eye_exam_expires_on date,
  mvr_completed_on date,
  mvr_expires_on date,
  notes text,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archived_reason text check (archived_reason is null or archived_reason in ('manual','dot_driver_off','personnel_inactive')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, file_number),
  check ((archived_at is null) = (archived_reason is null))
);

create unique index if not exists forge_dot_driver_files_one_active
  on public.forge_dot_driver_files (organization_id, personnel_id) where archived_at is null;
create index if not exists forge_dot_driver_files_org on public.forge_dot_driver_files (organization_id, archived_at);

create table if not exists public.forge_dot_dqf_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_file_id uuid not null references public.forge_dot_driver_files(id) on delete cascade,
  document_type text not null check (document_type in (
    'application','employment_eligibility_i9','previous_employer_request','previous_employer_safety','road_test',
    'mvr_consent','cdl_affidavit_ar','cdl_affidavit_ms','mer_form','registry_verification',
    'pre_employment_drug_consent','pre_employment_drug_completed','clearinghouse_consent','clearinghouse_completed',
    'drug_alcohol_consent','previous_da_statement','da_records_request','da_certified_receipt','drug_alcohol_log',
    'refusal_to_test','reasonable_suspicion','actual_knowledge','on_duty_hours','dqf_review'
  )),
  placed_on date,
  on_file text check (on_file is null or on_file in ('yes','no','na')),
  text_values jsonb not null default '{}'::jsonb check (jsonb_typeof(text_values) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (driver_file_id, document_type)
);

-- ---------------------------------------------------------------------------
-- Company-driver roster (insurance MVRs)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_dot_company_drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  driver_name text not null check (length(btrim(driver_name)) > 0),
  employee_number text,
  license_number text,
  license_state text check (license_state is null or license_state ~ '^[A-Z]{2}$'),
  license_expires_on date,
  date_of_birth date,
  status text not null default 'pending_mvr' check (status in ('on_insurance','pending_mvr','suspended','removed')),
  mvr_consent_on date,
  initial_mvr_on date,
  last_mvr_on date,
  next_mvr_due_on date,
  insurance_effective_on date,
  insurance_removed_on date,
  sample_year integer,
  sample_selected_at timestamptz,
  sample_completed_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_dot_company_drivers_person
  on public.forge_dot_company_drivers (organization_id, personnel_id) where personnel_id is not null;

create table if not exists public.forge_dot_mvr_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_driver_id uuid not null references public.forge_dot_company_drivers(id) on delete cascade,
  kind text not null check (kind in ('consent_received','mvr_received','sample_selected','sample_completed','status_changed')),
  occurred_on date not null default current_date,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_dot_mvr_events_driver on public.forge_dot_mvr_events (company_driver_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Other DOT records
-- ---------------------------------------------------------------------------

create table if not exists public.forge_dot_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_number text not null,
  category text not null check (category in ('roadside_inspection','accident','drug_alcohol','company','other')),
  title text not null check (length(btrim(title)) > 0),
  record_date date,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed')),
  description text,
  outcome text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, record_number)
);

-- ---------------------------------------------------------------------------
-- Uploaded copies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-dot', 'forge-dot', false, 12582912)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create table if not exists public.forge_dot_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_file_id uuid references public.forge_dot_driver_files(id) on delete cascade,
  company_driver_id uuid references public.forge_dot_company_drivers(id) on delete cascade,
  record_id uuid references public.forge_dot_records(id) on delete cascade,
  slot text not null check (slot ~ '^[a-z][a-z0-9_]{0,59}$'),
  storage_path text not null unique,
  file_name text not null,
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 12582912),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  check (num_nonnulls(driver_file_id, company_driver_id, record_id) = 1),
  check (company_driver_id is null or slot in ('mvr_consent','mvr_report','license')),
  check (record_id is null or slot = 'attachment')
);

create index if not exists forge_dot_files_driver on public.forge_dot_files (driver_file_id) where removed_at is null;
create index if not exists forge_dot_files_roster on public.forge_dot_files (company_driver_id) where removed_at is null;
create index if not exists forge_dot_files_record on public.forge_dot_files (record_id) where removed_at is null;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_dot_settings_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from unnest(new.hidden_document_types) t
    where t not in (
      'application','employment_eligibility_i9','previous_employer_request','previous_employer_safety','road_test',
      'mvr_consent','cdl_affidavit_ar','cdl_affidavit_ms','mer_form','registry_verification',
      'pre_employment_drug_consent','pre_employment_drug_completed','clearinghouse_consent','clearinghouse_completed',
      'drug_alcohol_consent','previous_da_statement','da_records_request','da_certified_receipt','drug_alcohol_log',
      'refusal_to_test','reasonable_suspicion','actual_knowledge','on_duty_hours','dqf_review'
    )
  ) then
    raise exception 'Unknown DQF document type.' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_dot_settings_guard on public.forge_dot_settings;
create trigger forge_dot_settings_guard
before insert or update on public.forge_dot_settings
for each row execute function public.forge_dot_settings_guard();

create or replace function public.forge_dot_driver_files_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_person public.forge_personnel%rowtype;
begin
  if tg_op = 'UPDATE' and (new.personnel_id <> old.personnel_id or new.organization_id <> old.organization_id) then
    raise exception 'A DQF cannot move to another driver.' using errcode = '23514';
  end if;

  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    select * into v_person from public.forge_personnel where id = new.personnel_id and organization_id = new.organization_id;

    if not found then
      raise exception 'Driver does not belong to this organization.' using errcode = '23503';
    end if;

    if v_person.archived_at is not null or v_person.employment_status in ('terminated','inactive') then
      raise exception '% % is not an active employee, so they cannot have an open DQF.', v_person.first_name, v_person.last_name
        using errcode = '23514';
    end if;
  end if;

  new.license_number := nullif(btrim(new.license_number), '');
  new.license_state := nullif(upper(btrim(new.license_state)), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_dot_driver_files_guard on public.forge_dot_driver_files;
create trigger forge_dot_driver_files_guard
before insert or update on public.forge_dot_driver_files
for each row execute function public.forge_dot_driver_files_guard();

-- Keeps personnel.is_dot_driver equal to "has an open DQF". Runs after the row is written.
create or replace function public.forge_dot_driver_files_sync()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_company boolean;
begin
  if new.archived_at is null then
    select coalesce(dot_drivers_are_company_drivers, false) into v_company
    from public.forge_dot_settings where organization_id = new.organization_id;

    update public.forge_personnel
    set is_dot_driver = true,
        is_company_driver = is_company_driver or coalesce(v_company, false),
        updated_at = now()
    where id = new.personnel_id
      and (not is_dot_driver or (coalesce(v_company, false) and not is_company_driver));
  elsif tg_op = 'UPDATE' and old.archived_at is null and new.archived_reason = 'manual' then
    update public.forge_personnel
    set is_dot_driver = false, updated_at = now()
    where id = new.personnel_id and is_dot_driver
      and not exists (
        select 1 from public.forge_dot_driver_files f
        where f.personnel_id = new.personnel_id and f.archived_at is null and f.id <> new.id
      );
  end if;

  return null;
end;
$$;

drop trigger if exists forge_dot_driver_files_sync on public.forge_dot_driver_files;
create trigger forge_dot_driver_files_sync
after insert or update of archived_at on public.forge_dot_driver_files
for each row execute function public.forge_dot_driver_files_sync();

create or replace function public.forge_dot_documents_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.forge_dot_driver_files f
    where f.id = new.driver_file_id and f.organization_id = new.organization_id
  ) then
    raise exception 'DQF does not belong to this organization.' using errcode = '23503';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_dot_documents_guard on public.forge_dot_dqf_documents;
create trigger forge_dot_documents_guard
before insert or update on public.forge_dot_dqf_documents
for each row execute function public.forge_dot_documents_guard();

create or replace function public.forge_dot_company_drivers_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_personnel', new.personnel_id, new.organization_id, 'Driver');

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'removed' and new.insurance_removed_on is null then
      new.insurance_removed_on := current_date;
    elsif old.status = 'removed' then
      new.insurance_removed_on := null;
    end if;

    if new.status = 'on_insurance' and new.insurance_effective_on is null then
      new.insurance_effective_on := current_date;
    end if;
  end if;

  new.driver_name := btrim(new.driver_name);
  new.license_state := nullif(upper(btrim(new.license_state)), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_dot_company_drivers_guard on public.forge_dot_company_drivers;
create trigger forge_dot_company_drivers_guard
before insert or update on public.forge_dot_company_drivers
for each row execute function public.forge_dot_company_drivers_guard();

create or replace function public.forge_dot_records_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_personnel', new.personnel_id, new.organization_id, 'Driver');
  perform public.forge_assert_same_org('public.locations', new.location_id, new.organization_id, 'Location');

  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then
    new.closed_at := now();
  elsif new.status = 'open' then
    new.closed_at := null;
    new.closed_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_dot_records_guard on public.forge_dot_records;
create trigger forge_dot_records_guard
before insert or update on public.forge_dot_records
for each row execute function public.forge_dot_records_guard();

create or replace function public.forge_dot_files_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.storage_path <> old.storage_path
       or new.driver_file_id is distinct from old.driver_file_id
       or new.company_driver_id is distinct from old.company_driver_id
       or new.record_id is distinct from old.record_id
       or new.slot <> old.slot then
      raise exception 'An uploaded DOT file cannot move.' using errcode = '23514';
    end if;

    if old.removed_at is not null and new.removed_at is null then
      raise exception 'A removed DOT file cannot be restored.' using errcode = '23514';
    end if;

    return new;
  end if;

  if new.driver_file_id is not null then
    if not exists (select 1 from public.forge_dot_driver_files where id = new.driver_file_id and organization_id = new.organization_id) then
      raise exception 'DQF does not belong to this organization.' using errcode = '23503';
    end if;

    if new.slot not in (
      'license','medical_certificate','mvr','diabetic_eye_exam',
      'application','employment_eligibility_i9','previous_employer_request','previous_employer_safety','road_test',
      'mvr_consent','cdl_affidavit_ar','cdl_affidavit_ms','mer_form','registry_verification',
      'pre_employment_drug_consent','pre_employment_drug_completed','clearinghouse_consent','clearinghouse_completed',
      'drug_alcohol_consent','previous_da_statement','da_records_request','da_certified_receipt','drug_alcohol_log',
      'refusal_to_test','reasonable_suspicion','actual_knowledge','on_duty_hours','dqf_review'
    ) then
      raise exception 'Unknown DQF upload slot.' using errcode = '23514';
    end if;
  elsif new.company_driver_id is not null then
    perform public.forge_assert_same_org('public.forge_dot_company_drivers', new.company_driver_id, new.organization_id, 'Company driver');
  else
    perform public.forge_assert_same_org('public.forge_dot_records', new.record_id, new.organization_id, 'DOT record');
  end if;

  select count(*) into v_count
  from public.forge_dot_files f
  where f.removed_at is null
    and f.slot = new.slot
    and f.driver_file_id is not distinct from new.driver_file_id
    and f.company_driver_id is not distinct from new.company_driver_id
    and f.record_id is not distinct from new.record_id;

  if v_count >= 10 then
    raise exception 'At most 10 files per document. Remove an old copy first.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_dot_files_guard on public.forge_dot_files;
create trigger forge_dot_files_guard
before insert or update on public.forge_dot_files
for each row execute function public.forge_dot_files_guard();

-- ---------------------------------------------------------------------------
-- Personnel -> DQF and roster sync
-- ---------------------------------------------------------------------------

-- Before: someone who stops being an active employee stops being a DOT driver.
create or replace function public.forge_personnel_dot_before()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_dot_driver and (new.archived_at is not null or new.employment_status in ('terminated','inactive')) then
    new.is_dot_driver := false;
  end if;

  return new;
end;
$$;

drop trigger if exists forge_personnel_dot_before on public.forge_personnel;
create trigger forge_personnel_dot_before
before insert or update of is_dot_driver, employment_status, archived_at on public.forge_personnel
for each row execute function public.forge_personnel_dot_before();

create or replace function public.forge_personnel_dot_after()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_inactive boolean := new.archived_at is not null or new.employment_status in ('terminated','inactive');
  v_restore uuid;
begin
  -- A new person has no DQF yet; only the roster row below applies.
  if tg_op = 'INSERT' then
    if new.is_company_driver then
      insert into public.forge_dot_company_drivers (organization_id, personnel_id, driver_name, employee_number, created_by)
      values (new.organization_id, new.id, btrim(new.first_name || ' ' || new.last_name), new.employee_number, new.created_by);
    end if;

    return null;
  end if;

  -- Flag off: archive the open DQF, saying why so turning the flag back on can restore it.
  if old.is_dot_driver and not new.is_dot_driver then
    update public.forge_dot_driver_files
    set archived_at = now(),
        archived_reason = case when v_inactive then 'personnel_inactive' else 'dot_driver_off' end
    where personnel_id = new.id and archived_at is null;
  end if;

  -- Flag on: restore the most recent DQF closed by the flag or by termination (1.0 behaviour).
  if not old.is_dot_driver and new.is_dot_driver
     and not exists (select 1 from public.forge_dot_driver_files where personnel_id = new.id and archived_at is null) then
    select id into v_restore
    from public.forge_dot_driver_files
    where personnel_id = new.id and archived_reason in ('dot_driver_off','personnel_inactive')
    order by archived_at desc
    limit 1;

    if v_restore is not null then
      update public.forge_dot_driver_files
      set archived_at = null, archived_by = null, archived_reason = null
      where id = v_restore;
    end if;
  end if;

  -- Company driver flag keeps a roster row.
  if new.is_company_driver and not coalesce(old.is_company_driver, false) then
    if exists (select 1 from public.forge_dot_company_drivers where personnel_id = new.id) then
      update public.forge_dot_company_drivers
      set status = 'pending_mvr'
      where personnel_id = new.id and status = 'removed';
    else
      insert into public.forge_dot_company_drivers (organization_id, personnel_id, driver_name, employee_number, created_by)
      values (new.organization_id, new.id, btrim(new.first_name || ' ' || new.last_name), new.employee_number, new.updated_by);
    end if;
  elsif coalesce(old.is_company_driver, false) and not new.is_company_driver then
    update public.forge_dot_company_drivers
    set status = 'removed'
    where personnel_id = new.id and status <> 'removed';
  end if;

  return null;
end;
$$;

drop trigger if exists forge_personnel_dot_after on public.forge_personnel;
create trigger forge_personnel_dot_after
after insert or update of is_dot_driver, is_company_driver, employment_status, archived_at on public.forge_personnel
for each row execute function public.forge_personnel_dot_after();

-- People flagged as company drivers before this migration get a roster row.
insert into public.forge_dot_company_drivers (organization_id, personnel_id, driver_name, employee_number)
select p.organization_id, p.id, btrim(p.first_name || ' ' || p.last_name), p.employee_number
from public.forge_personnel p
where p.is_company_driver
  and not exists (select 1 from public.forge_dot_company_drivers d where d.personnel_id = p.id);

-- ---------------------------------------------------------------------------
-- Annual MVR sample (1.0: 10% of drivers, at least one, stable per year)
-- ---------------------------------------------------------------------------

create or replace function public.forge_dot_start_mvr_sample(
  p_organization_id uuid,
  p_year integer,
  p_force boolean,
  p_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_percent integer;
  v_eligible integer;
  v_size integer;
  v_existing integer;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Pick a sample year.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('forge_dot_mvr_sample:' || p_organization_id::text));

  select count(*) into v_existing
  from public.forge_dot_company_drivers
  where organization_id = p_organization_id and sample_year = p_year;

  if v_existing > 0 and not coalesce(p_force, false) then
    raise exception 'The % sample has already been drawn (% drivers). Redraw to replace it.', p_year, v_existing using errcode = '23514';
  end if;

  if v_existing > 0 and exists (
    select 1 from public.forge_dot_company_drivers
    where organization_id = p_organization_id and sample_year = p_year and sample_completed_at is not null
  ) then
    raise exception 'Some MVRs in the % sample are already done, so it cannot be redrawn.', p_year using errcode = '23514';
  end if;

  update public.forge_dot_company_drivers
  set sample_year = null, sample_selected_at = null, sample_completed_at = null
  where organization_id = p_organization_id and sample_year = p_year;

  select coalesce(mvr_sample_percent, 10) into v_percent from public.forge_dot_settings where organization_id = p_organization_id;
  v_percent := coalesce(v_percent, 10);

  select count(*) into v_eligible
  from public.forge_dot_company_drivers
  where organization_id = p_organization_id and status in ('on_insurance','pending_mvr');

  if v_eligible = 0 then
    raise exception 'No company drivers on insurance to sample.' using errcode = '23514';
  end if;

  v_size := greatest(1, ceil(v_eligible * v_percent / 100.0)::integer);

  with picked as (
    select id
    from public.forge_dot_company_drivers
    where organization_id = p_organization_id and status in ('on_insurance','pending_mvr')
    order by md5(p_year::text || ':' || id::text)
    limit v_size
  ),
  marked as (
    update public.forge_dot_company_drivers d
    set sample_year = p_year, sample_selected_at = now(), sample_completed_at = null, updated_by = p_actor_user_id
    from picked
    where d.id = picked.id
    returning d.id, d.organization_id
  )
  insert into public.forge_dot_mvr_events (organization_id, company_driver_id, kind, note, actor_user_id)
  select organization_id, id, 'sample_selected', 'Selected for the ' || p_year || ' MVR sample', p_actor_user_id
  from marked;

  return v_size;
end;
$$;

create or replace function public.forge_dot_complete_mvr_sample(
  p_organization_id uuid,
  p_company_driver_id uuid,
  p_completed_on date,
  p_note text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.forge_dot_company_drivers%rowtype;
begin
  select * into v_driver
  from public.forge_dot_company_drivers
  where id = p_company_driver_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Company driver not found.' using errcode = 'P0002';
  end if;

  if v_driver.sample_year is null then
    raise exception 'This driver is not in an MVR sample.' using errcode = '23514';
  end if;

  if v_driver.sample_completed_at is not null then
    raise exception 'This sampled MVR is already recorded.' using errcode = '23514';
  end if;

  if p_completed_on is null or p_completed_on > current_date then
    raise exception 'Enter the date the MVR was pulled (not in the future).' using errcode = '23514';
  end if;

  update public.forge_dot_company_drivers
  set sample_completed_at = now(),
      last_mvr_on = greatest(coalesce(last_mvr_on, p_completed_on), p_completed_on),
      next_mvr_due_on = (greatest(coalesce(last_mvr_on, p_completed_on), p_completed_on) + interval '1 year')::date,
      updated_by = p_actor_user_id
  where id = p_company_driver_id;

  insert into public.forge_dot_mvr_events (organization_id, company_driver_id, kind, occurred_on, note, actor_user_id)
  values (p_organization_id, p_company_driver_id, 'sample_completed', p_completed_on, nullif(btrim(coalesce(p_note, '')), ''), p_actor_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Access: service role only (the app checks dot.* permissions and scope)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'forge_dot_sequences','forge_dot_settings','forge_dot_driver_files','forge_dot_dqf_documents','forge_dot_company_drivers',
    'forge_dot_mvr_events','forge_dot_records','forge_dot_files'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.next_forge_dot_number(uuid, text)',
    'public.forge_dot_start_mvr_sample(uuid, integer, boolean, uuid)',
    'public.forge_dot_complete_mvr_sample(uuid, uuid, date, text, uuid)',
    'public.forge_dot_settings_guard()',
    'public.forge_dot_driver_files_guard()',
    'public.forge_dot_driver_files_sync()',
    'public.forge_dot_documents_guard()',
    'public.forge_dot_company_drivers_guard()',
    'public.forge_dot_records_guard()',
    'public.forge_dot_files_guard()',
    'public.forge_personnel_dot_before()',
    'public.forge_personnel_dot_after()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permission, menu and lookups
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('dot.settings', 'dot', 'Manage DOT Settings', 'Choose which DQF documents apply, the company-driver rule, the insurer and the MVR sample size.', 'DOT', 'configure', true, false, 'organization', true, false, true, 'sensitive', 50)
on conflict (permission_key) do update
set name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, default_scope = excluded.default_scope, is_sensitive = excluded.is_sensitive,
    danger_level = excluded.danger_level, sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key = 'dot.settings'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = 'organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key = 'dot.settings'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = 'organization';

update public.forge_experience_elements
set settings = coalesce(settings, '{}'::jsonb) || '{"route_live": true, "required_permission": "dot.view"}'::jsonb,
    updated_at = now()
where element_key = 'nav.dot' and element_type = 'menu';
