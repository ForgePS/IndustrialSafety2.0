-- Port slice 11: Fleet & DVIR (Industrial 1.0 fleet module).
--
-- Vehicles, driver assignment history, mileage / engine hours, maintenance, vehicle documents, service status
-- history, and Driver Vehicle Inspection Reports (DVIR) with defects, mechanic certification and next-driver
-- review. Drivers themselves stay in DOT Compliance (forge_dot_company_drivers roster, forge_dot_driver_files).
--
-- Fixes over 1.0: assignment and meter history can't be skipped (triggers), a defective DVIR can take the
-- vehicle out of service and opens a repair, DVIRs are never purged while a defect is open, and a mechanic
-- certification is required before review.

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('fleet', 'Fleet', 'Vehicles, driver assignments, DVIRs, maintenance, mileage and renewals.', 'Operations', 'module', 'enabled', true, true, true, true, false, 180)
on conflict (feature_key) do update
set description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'fleet'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

update public.forge_experience_elements
set settings = coalesce(settings, '{}'::jsonb) || '{"route_live": true, "required_permission": "fleet.view"}'::jsonb,
    default_description = 'Vehicles, DVIRs, maintenance and renewals.',
    updated_at = now()
where element_key = 'nav.fleet';

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table if not exists public.forge_fleet_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- A DVIR with a defect takes the vehicle out of service until a mechanic certifies it (1.0 never did).
  defect_out_of_service boolean not null default true,
  -- A DVIR with a defect opens a repair maintenance record.
  defect_opens_repair boolean not null default true,
  renewal_warning_days integer not null default 30 check (renewal_warning_days between 1 and 180),
  -- Minimum DVIR retention (49 CFR 396.11 requires 3 months). DVIRs are archived, never deleted, after this.
  dvir_retention_days integer not null default 91 check (dvir_retention_days >= 91),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------

create table if not exists public.forge_fleet_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('vehicle', 'dvir', 'maintenance')),
  year integer not null default 0,
  next_value integer not null default 1,
  primary key (organization_id, kind, year)
);

-- VEH-000001, DVIR-2026-000001, FM-2026-000001.
create or replace function public.next_forge_fleet_number(p_organization_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := case when p_kind = 'vehicle' then 0 else extract(year from now())::integer end;
  v_number integer;
begin
  insert into public.forge_fleet_sequences (organization_id, kind, year, next_value)
  values (p_organization_id, p_kind, v_year, 2)
  on conflict (organization_id, kind, year)
  do update set next_value = public.forge_fleet_sequences.next_value + 1
  returning next_value - 1 into v_number;

  if p_kind = 'vehicle' then
    return 'VEH-' || lpad(v_number::text, 6, '0');
  elsif p_kind = 'dvir' then
    return 'DVIR-' || v_year || '-' || lpad(v_number::text, 6, '0');
  end if;

  return 'FM-' || v_year || '-' || lpad(v_number::text, 6, '0');
end;
$$;

revoke all on function public.next_forge_fleet_number(uuid, text) from public;
grant execute on function public.next_forge_fleet_number(uuid, text) to service_role;

create table if not exists public.forge_fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_number text not null,
  unit_number text,
  vehicle_type text not null default 'fleet_vehicle'
    check (vehicle_type in ('passenger_vehicle','fleet_vehicle','bob_truck','trash_truck','tractor_truck','dump_truck','construction_equipment','trailer','other')),
  custom_type_label text,
  year integer check (year is null or year between 1900 and 2100),
  make text,
  model text,
  trim text,
  color text,
  vin text,
  serial_number text,
  license_plate text,
  license_state text check (license_state is null or license_state ~ '^[A-Z]{2}$'),
  registration_renewal_date date,
  registration_renewal_month integer check (registration_renewal_month is null or registration_renewal_month between 1 and 12),
  location_id uuid references public.locations(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  assigned_driver_personnel_id uuid references public.forge_personnel(id) on delete set null,
  dot_regulated boolean not null default false,
  gvwr_lbs integer check (gvwr_lbs is null or gvwr_lbs > 0),
  status text not null default 'active'
    check (status in ('active','inactive','out_of_service','removed','sold','disposed')),
  out_of_service_reason text,
  mileage integer check (mileage is null or mileage >= 0),
  mileage_updated_at timestamptz,
  engine_hours numeric(10,1) check (engine_hours is null or engine_hours >= 0),
  engine_hours_updated_at timestamptz,
  annual_inspection_due_on date,
  insurance_status text not null default 'unknown' check (insurance_status in ('unknown','insured','not_insured','pending','lapsed')),
  insurance_company text,
  insurance_policy_number text,
  insurance_phone text,
  insurance_agent_name text,
  insurance_agent_phone text,
  insurance_agent_email text,
  insurance_effective_on date,
  insurance_expires_on date,
  county_assessment_status text not null default 'unknown' check (county_assessment_status in ('unknown','assessed','not_assessed','exempt','pending')),
  county_assessment_notes text,
  commute_use_status text not null default 'unknown' check (commute_use_status in ('unknown','yes','no','occasional')),
  commute_use_notes text,
  vehicle_fringe boolean not null default false,
  form_2290_status text not null default 'unknown' check (form_2290_status in ('unknown','required','filed','not_required','overdue')),
  form_2290_notes text,
  irp_status text not null default 'unknown' check (irp_status in ('unknown','required','filed','not_required','overdue')),
  irp_notes text,
  disposition_date date,
  disposition_notes text,
  notes text,
  source_system text,
  source_id text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, vehicle_number)
);

create unique index if not exists forge_fleet_vehicles_vin_uidx
  on public.forge_fleet_vehicles (organization_id, upper(vin)) where vin is not null and archived_at is null;
create unique index if not exists forge_fleet_vehicles_unit_uidx
  on public.forge_fleet_vehicles (organization_id, lower(unit_number)) where unit_number is not null and archived_at is null;
create unique index if not exists forge_fleet_vehicles_source_uidx
  on public.forge_fleet_vehicles (organization_id, source_system, source_id) where source_id is not null;
create index if not exists forge_fleet_vehicles_org_status_idx on public.forge_fleet_vehicles (organization_id, status);
create index if not exists forge_fleet_vehicles_driver_idx on public.forge_fleet_vehicles (organization_id, assigned_driver_personnel_id);

create table if not exists public.forge_fleet_assignment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  action text not null check (action in ('assign','unassign')),
  effective_at timestamptz not null default now(),
  notes text,
  actor_user_id uuid references auth.users(id) on delete set null
);

create index if not exists forge_fleet_assignment_history_vehicle_idx on public.forge_fleet_assignment_history (vehicle_id, effective_at desc);

create table if not exists public.forge_fleet_meter_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete cascade,
  meter text not null check (meter in ('mileage','engine_hours')),
  value numeric(12,1) not null check (value >= 0),
  -- A lower reading than the current one must be marked as a correction (odometer replaced, typo fixed).
  is_correction boolean not null default false,
  source text not null default 'manual' check (source in ('manual','dvir','maintenance','import')),
  source_record_id uuid,
  notes text,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_by_personnel_id uuid references public.forge_personnel(id) on delete set null
);

create index if not exists forge_fleet_meter_readings_vehicle_idx on public.forge_fleet_meter_readings (vehicle_id, meter, recorded_at desc);

create table if not exists public.forge_fleet_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  source text not null default 'record_edit' check (source in ('record_edit','dvir','dvir_certified','qr_scan','qr_issue','import','disposal')),
  related_record_type text,
  related_record_id uuid,
  qr_code_id uuid references public.forge_qr_codes(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_personnel_id uuid references public.forge_personnel(id) on delete set null,
  actor_name text,
  changed_at timestamptz not null default now()
);

create index if not exists forge_fleet_status_history_vehicle_idx on public.forge_fleet_status_history (vehicle_id, changed_at desc);

create table if not exists public.forge_fleet_activity (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete cascade,
  activity_type text not null,
  message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_fleet_activity_vehicle_idx on public.forge_fleet_activity (vehicle_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Vehicle guards and history triggers
-- ---------------------------------------------------------------------------

create or replace function public.forge_fleet_vehicle_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.locations', new.location_id, new.organization_id, 'Location');
  perform public.forge_assert_same_org('public.divisions', new.division_id, new.organization_id, 'Division');
  perform public.forge_assert_same_org('public.forge_personnel', new.assigned_driver_personnel_id, new.organization_id, 'Driver');

  new.vin := nullif(upper(regexp_replace(coalesce(new.vin, ''), '\s', '', 'g')), '');
  new.license_state := nullif(upper(trim(coalesce(new.license_state, ''))), '');
  new.updated_at := now();

  if new.status <> 'out_of_service' then
    new.out_of_service_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists forge_fleet_vehicles_guard on public.forge_fleet_vehicles;
create trigger forge_fleet_vehicles_guard
  before insert or update on public.forge_fleet_vehicles
  for each row execute function public.forge_fleet_vehicle_guard();

-- Assignment history is written for every driver change, however it is made (1.0 skipped it on edit).
-- Status history is written for every status change; forge_fleet_set_status supplies the reason and source.
create or replace function public.forge_fleet_vehicle_track()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := new.updated_by;
begin
  if tg_op = 'INSERT' then
    if new.assigned_driver_personnel_id is not null then
      insert into public.forge_fleet_assignment_history (organization_id, vehicle_id, personnel_id, action, actor_user_id)
      values (new.organization_id, new.id, new.assigned_driver_personnel_id, 'assign', coalesce(new.created_by, v_actor));
    end if;

    return new;
  end if;

  if new.assigned_driver_personnel_id is distinct from old.assigned_driver_personnel_id then
    if old.assigned_driver_personnel_id is not null then
      insert into public.forge_fleet_assignment_history (organization_id, vehicle_id, personnel_id, action, actor_user_id)
      values (new.organization_id, new.id, old.assigned_driver_personnel_id, 'unassign', v_actor);
    end if;

    if new.assigned_driver_personnel_id is not null then
      insert into public.forge_fleet_assignment_history (organization_id, vehicle_id, personnel_id, action, actor_user_id)
      values (new.organization_id, new.id, new.assigned_driver_personnel_id, 'assign', v_actor);
    end if;
  end if;

  if new.status is distinct from old.status and coalesce(current_setting('forge.fleet_status_logged', true), '') <> 'on' then
    insert into public.forge_fleet_status_history (organization_id, vehicle_id, from_status, to_status, reason, source, actor_user_id)
    values (new.organization_id, new.id, old.status, new.status, new.out_of_service_reason, 'record_edit', v_actor);
  end if;

  return new;
end;
$$;

drop trigger if exists forge_fleet_vehicles_track on public.forge_fleet_vehicles;
create trigger forge_fleet_vehicles_track
  after insert or update on public.forge_fleet_vehicles
  for each row execute function public.forge_fleet_vehicle_track();

-- A meter reading updates the vehicle's current value. Lower than the current value needs is_correction.
create or replace function public.forge_fleet_meter_apply()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current numeric;
begin
  perform public.forge_assert_same_org('public.forge_fleet_vehicles', new.vehicle_id, new.organization_id, 'Vehicle');

  if new.meter = 'mileage' then
    select mileage into v_current from public.forge_fleet_vehicles where id = new.vehicle_id for update;
  else
    select engine_hours into v_current from public.forge_fleet_vehicles where id = new.vehicle_id for update;
  end if;

  if v_current is not null and new.value < v_current and not new.is_correction then
    raise exception 'The reading (%) is lower than the current % (%). Mark it as a correction if the meter was replaced or the last reading was wrong.',
      new.value, replace(new.meter, '_', ' '), v_current using errcode = '23514';
  end if;

  if new.meter = 'mileage' then
    update public.forge_fleet_vehicles
    set mileage = round(new.value)::integer, mileage_updated_at = new.recorded_at, updated_by = coalesce(new.recorded_by, updated_by)
    where id = new.vehicle_id and (mileage is null or new.is_correction or new.value >= mileage);
  else
    update public.forge_fleet_vehicles
    set engine_hours = new.value, engine_hours_updated_at = new.recorded_at, updated_by = coalesce(new.recorded_by, updated_by)
    where id = new.vehicle_id and (engine_hours is null or new.is_correction or new.value >= engine_hours);
  end if;

  return new;
end;
$$;

drop trigger if exists forge_fleet_meter_readings_apply on public.forge_fleet_meter_readings;
create trigger forge_fleet_meter_readings_apply
  before insert on public.forge_fleet_meter_readings
  for each row execute function public.forge_fleet_meter_apply();

-- Sets a vehicle in or out of service with a status history row, in one transaction.
-- Returns the history id, or null when nothing changed.
create or replace function public.forge_fleet_set_status(
  p_organization_id uuid,
  p_vehicle_id uuid,
  p_status text,
  p_reason text default null,
  p_source text default 'record_edit',
  p_related_record_type text default null,
  p_related_record_id uuid default null,
  p_qr_code_id uuid default null,
  p_actor_user_id uuid default null,
  p_actor_personnel_id uuid default null,
  p_actor_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_id uuid;
begin
  if p_status not in ('active','out_of_service') then
    raise exception 'A vehicle can only be set in service or out of service here.' using errcode = '22023';
  end if;

  select status into v_old from public.forge_fleet_vehicles
  where id = p_vehicle_id and organization_id = p_organization_id and archived_at is null
  for update;

  if not found then
    raise exception 'Vehicle not found.' using errcode = 'P0002';
  end if;

  if v_old in ('removed','sold','disposed') then
    raise exception 'A removed vehicle cannot change service status.' using errcode = '22023';
  end if;

  if v_old = p_status then
    return null;
  end if;

  perform set_config('forge.fleet_status_logged', 'on', true);

  update public.forge_fleet_vehicles
  set status = p_status,
      out_of_service_reason = case when p_status = 'out_of_service' then p_reason else null end,
      updated_by = coalesce(p_actor_user_id, updated_by)
  where id = p_vehicle_id;

  perform set_config('forge.fleet_status_logged', 'off', true);

  insert into public.forge_fleet_status_history (
    organization_id, vehicle_id, from_status, to_status, reason, source, related_record_type, related_record_id,
    qr_code_id, actor_user_id, actor_personnel_id, actor_name
  )
  values (
    p_organization_id, p_vehicle_id, v_old, p_status, p_reason, p_source, p_related_record_type, p_related_record_id,
    p_qr_code_id, p_actor_user_id, p_actor_personnel_id, p_actor_name
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.forge_fleet_set_status(uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.forge_fleet_set_status(uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- DVIRs and defects
-- ---------------------------------------------------------------------------

create table if not exists public.forge_fleet_dvirs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dvir_number text not null,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete restrict,
  trip_type text not null check (trip_type in ('pre_trip','post_trip')),
  inspection_date date not null,
  odometer integer check (odometer is null or odometer >= 0),
  trailer_numbers text,
  location_id uuid references public.locations(id) on delete set null,
  -- [{id, answer: yes|no|na, notes}] for the fixed 1.0 checklist (forgeFleetDvirRules.ts).
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  remarks text,
  condition_satisfactory boolean not null,
  -- open: defects waiting for a mechanic; needs_review: certified, waiting for the next driver's review; closed.
  status text not null check (status in ('open','needs_review','closed')),
  driver_personnel_id uuid references public.forge_personnel(id) on delete set null,
  driver_user_id uuid references auth.users(id) on delete set null,
  driver_name text not null,
  -- {image (data:image/png;base64), signedAt, signedByName, signedByUserId, method}
  driver_signature jsonb not null,
  mechanic_action text check (mechanic_action is null or mechanic_action in ('corrected','not_needed')),
  mechanic_name text,
  mechanic_notes text,
  mechanic_signature jsonb,
  mechanic_user_id uuid references auth.users(id) on delete set null,
  mechanic_signed_at timestamptz,
  review_name text,
  review_signature jsonb,
  review_personnel_id uuid references public.forge_personnel(id) on delete set null,
  review_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  repair_maintenance_id uuid,
  submitted_via text not null default 'office' check (submitted_via in ('office','scan','import')),
  qr_code_id uuid references public.forge_qr_codes(id) on delete set null,
  source_system text,
  source_id text,
  created_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, dvir_number)
);

create index if not exists forge_fleet_dvirs_vehicle_idx on public.forge_fleet_dvirs (vehicle_id, inspection_date desc);
create index if not exists forge_fleet_dvirs_open_idx on public.forge_fleet_dvirs (organization_id, status) where status <> 'closed';
create unique index if not exists forge_fleet_dvirs_source_uidx
  on public.forge_fleet_dvirs (organization_id, source_system, source_id) where source_id is not null;

create table if not exists public.forge_fleet_dvir_defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dvir_id uuid not null references public.forge_fleet_dvirs(id) on delete cascade,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete cascade,
  item_id text not null,
  item_label text not null,
  section text not null check (section in ('truck','safety','trailer')),
  notes text not null,
  status text not null default 'open' check (status in ('open','corrected','not_needed')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dvir_id, item_id)
);

create index if not exists forge_fleet_dvir_defects_vehicle_idx on public.forge_fleet_dvir_defects (vehicle_id, status);

-- Signed parts of a DVIR never change: the driver's report once submitted, the mechanic's certification and
-- the review once signed. Only the follow-up columns move forward, and only in order.
create or replace function public.forge_fleet_dvir_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_fleet_vehicles', new.vehicle_id, new.organization_id, 'Vehicle');

  if tg_op = 'UPDATE' then
    if new.vehicle_id <> old.vehicle_id or new.trip_type <> old.trip_type or new.inspection_date <> old.inspection_date
       or new.items <> old.items or new.driver_signature <> old.driver_signature or new.driver_name <> old.driver_name
       or new.condition_satisfactory <> old.condition_satisfactory or new.odometer is distinct from old.odometer
       or new.remarks is distinct from old.remarks or new.trailer_numbers is distinct from old.trailer_numbers then
      raise exception 'A submitted DVIR cannot be changed.' using errcode = '23514';
    end if;

    if old.mechanic_signature is not null and (new.mechanic_signature is distinct from old.mechanic_signature
       or new.mechanic_action is distinct from old.mechanic_action or new.mechanic_name is distinct from old.mechanic_name) then
      raise exception 'The mechanic certification cannot be changed once signed.' using errcode = '23514';
    end if;

    if old.review_signature is not null and new.review_signature is distinct from old.review_signature then
      raise exception 'The driver review cannot be changed once signed.' using errcode = '23514';
    end if;

    if new.review_signature is not null and old.review_signature is null and new.mechanic_signature is null then
      raise exception 'A mechanic must certify the defects before the driver review.' using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists forge_fleet_dvirs_guard on public.forge_fleet_dvirs;
create trigger forge_fleet_dvirs_guard
  before insert or update on public.forge_fleet_dvirs
  for each row execute function public.forge_fleet_dvir_guard();

-- DVIRs are records: never hard-deleted while a defect is open, and never within the retention period.
create or replace function public.forge_fleet_dvir_delete_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'closed' then
    raise exception 'A DVIR with open defects cannot be deleted.' using errcode = '23514';
  end if;

  if old.inspection_date > current_date - 91 then
    raise exception 'DVIRs must be kept for at least 3 months.' using errcode = '23514';
  end if;

  return old;
end;
$$;

drop trigger if exists forge_fleet_dvirs_delete_guard on public.forge_fleet_dvirs;
create trigger forge_fleet_dvirs_delete_guard
  before delete on public.forge_fleet_dvirs
  for each row execute function public.forge_fleet_dvir_delete_guard();

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------

create table if not exists public.forge_fleet_maintenance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  maintenance_number text not null,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  maintenance_type text not null default 'pm'
    check (maintenance_type in ('pm','repair','recall','tires','inspection_followup','annual_inspection','other')),
  status text not null default 'open' check (status in ('open','completed','canceled')),
  due_on date,
  due_mileage integer check (due_mileage is null or due_mileage >= 0),
  completed_on date,
  completed_mileage integer check (completed_mileage is null or completed_mileage >= 0),
  vendor text,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  notes text,
  dvir_id uuid references public.forge_fleet_dvirs(id) on delete set null,
  -- Repeat: when completed, the next record is opened this many days / miles later.
  repeat_days integer check (repeat_days is null or repeat_days between 1 and 3650),
  repeat_miles integer check (repeat_miles is null or repeat_miles between 1 and 1000000),
  completed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  source_system text,
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, maintenance_number)
);

create index if not exists forge_fleet_maintenance_vehicle_idx on public.forge_fleet_maintenance (vehicle_id, status, due_on);
create index if not exists forge_fleet_maintenance_open_idx on public.forge_fleet_maintenance (organization_id, due_on) where status = 'open';

alter table public.forge_fleet_dvirs drop constraint if exists forge_fleet_dvirs_repair_fk;
alter table public.forge_fleet_dvirs
  add constraint forge_fleet_dvirs_repair_fk foreign key (repair_maintenance_id) references public.forge_fleet_maintenance(id) on delete set null;

create or replace function public.forge_fleet_maintenance_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_fleet_vehicles', new.vehicle_id, new.organization_id, 'Vehicle');
  perform public.forge_assert_same_org('public.forge_fleet_dvirs', new.dvir_id, new.organization_id, 'DVIR');
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists forge_fleet_maintenance_guard on public.forge_fleet_maintenance;
create trigger forge_fleet_maintenance_guard
  before insert or update on public.forge_fleet_maintenance
  for each row execute function public.forge_fleet_maintenance_guard();

-- ---------------------------------------------------------------------------
-- Vehicle documents (private bucket forge-fleet; 1.0 kept them inline in jsonb)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-fleet', 'forge-fleet', false, 12582912)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create table if not exists public.forge_fleet_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.forge_fleet_vehicles(id) on delete cascade,
  document_type text not null check (document_type in ('title','registration','insurance_card','insurance_policy','inspection','maintenance','other')),
  title text,
  expires_on date,
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 12582912),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists forge_fleet_documents_vehicle_idx on public.forge_fleet_documents (vehicle_id, document_type) where archived_at is null;

-- ---------------------------------------------------------------------------
-- Reminder log (each reminder goes out once per subject, recipient and due date)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_fleet_notice_log (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('registration','insurance','annual_inspection','maintenance_due','maintenance_overdue','dvir_defect','document_expiring')),
  subject_id uuid not null,
  due_key text not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid,
  created_at timestamptz not null default now(),
  unique (kind, subject_id, due_key, recipient_user_id)
);

-- ---------------------------------------------------------------------------
-- QR: vehicles can carry a QR (scan menu with pre-trip / post-trip DVIR)
-- ---------------------------------------------------------------------------

alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_target_type_check;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_target_type_check check (target_type in ('asset','location','form','vehicle'));

create or replace function public.forge_guard_qr_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.target_type = 'asset' then
    if not exists (select 1 from public.forge_assets where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target asset does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'location' then
    if not exists (select 1 from public.locations where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target location does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'form' then
    if not exists (select 1 from public.forge_form_templates where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target form does not belong to this company.' using errcode = '23503';
    end if;
  elsif new.target_type = 'vehicle' then
    if not exists (select 1 from public.forge_fleet_vehicles where id = new.target_id and organization_id = new.organization_id) then
      raise exception 'QR target vehicle does not belong to this company.' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.forge_guard_fleet_vehicle_qr_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.forge_qr_codes where target_type = 'vehicle' and target_id = old.id) then
    raise exception 'This vehicle has QR codes. Archive it instead of deleting it.' using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists forge_fleet_vehicles_guard_qr_delete on public.forge_fleet_vehicles;
create trigger forge_fleet_vehicles_guard_qr_delete
  before delete on public.forge_fleet_vehicles
  for each row execute function public.forge_guard_fleet_vehicle_qr_delete();

alter table public.forge_qr_issue_reports
  add column if not exists vehicle_id uuid references public.forge_fleet_vehicles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'forge_fleet_settings','forge_fleet_sequences','forge_fleet_vehicles','forge_fleet_assignment_history',
    'forge_fleet_meter_readings','forge_fleet_status_history','forge_fleet_activity','forge_fleet_dvirs',
    'forge_fleet_dvir_defects','forge_fleet_maintenance','forge_fleet_documents','forge_fleet_notice_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

grant usage, select on sequence public.forge_fleet_activity_id_seq to service_role;
grant usage, select on sequence public.forge_fleet_notice_log_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('fleet.dvir', 'fleet', 'Submit DVIRs', 'Fill out and sign pre-trip and post-trip Driver Vehicle Inspection Reports, and sign the next-driver review.', 'Fleet', 'create', true, true, 'own', false, false, true, 'normal', 60),
  ('fleet.dvir_certify', 'fleet', 'Certify DVIR Repairs', 'Sign the mechanic certification that DVIR defects were corrected or need no correction.', 'Fleet', 'approve', true, true, 'organization', true, false, true, 'sensitive', 70),
  ('fleet.export', 'fleet', 'Print and Export Fleet', 'Print DVIRs and export fleet reports.', 'Fleet', 'export', true, true, 'organization', false, false, true, 'normal', 80),
  ('fleet.settings', 'fleet', 'Fleet Settings', 'Change fleet settings such as DVIR defect handling and reminder windows.', 'Fleet', 'configure', true, false, 'organization', true, false, true, 'sensitive', 90)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, default_scope = excluded.default_scope, is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level,
    sort_order = excluded.sort_order, updated_at = now();

-- Role templates.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('fleet.view', 'fleet.dvir')
where rt.template_key = 'standard-user'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('fleet.view', 'fleet.dvir', 'fleet.maintenance', 'fleet.dvir_certify', 'fleet.export')
where rt.template_key = 'supervisor'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.feature_key = 'fleet'
where rt.template_key in ('safety-manager', 'company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key = 'fleet.view'
where rt.template_key = 'read-only'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

-- Existing tenant roles.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('fleet.view', 'fleet.dvir')
where r.role_key = 'employee'
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'location'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('fleet.view', 'fleet.dvir', 'fleet.maintenance', 'fleet.dvir_certify', 'fleet.export')
where r.role_key in ('supervisor', 'location-administrator')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.feature_key = 'fleet'
where r.role_key in ('company-administrator', 'company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key = 'fleet.view'
where r.role_key = 'read-only'
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
