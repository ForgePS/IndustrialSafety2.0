-- Port slice 19: Forklifts (powered industrial trucks), OSHA 1910.178.
--
-- Industrial 1.0's Forklifts module was a table of titled rows with a free-text status, listed in the person's
-- qualifications as "Forklift qualification". There were no truck details, checklists, defects, evaluations or expiry.
-- This slice is built from the parity matrix and the standard:
--   1910.178(a)(4)   the nameplate must match the truck's attachments
--   1910.178(l)      operators are trained and evaluated before they operate, and re-evaluated at least every 3 years;
--                    refresher training after an accident or near miss, unsafe operation, a poor evaluation, a
--                    different type of truck, or a change in the workplace
--   1910.178(q)(7)   trucks are examined before being placed in service, at least daily (after each shift when used
--                    around the clock); a defect affecting safe operation takes the truck out of service until repaired
--
-- A forklift is an asset (forge_assets, type 'forklift') with a forklift profile. Its location, status, hour meter,
-- maintenance and QR codes are the asset's. Out of service / return to service use the asset status and its history.
--
-- Checks, defects, operators and their histories change only inside the functions below (they set
-- forge.forklift_workflow). A forklift with an open critical defect can't be put back in service by any route.

-- ---------------------------------------------------------------------------
-- Feature, menu, asset type
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('forklifts', 'Forklifts', 'Powered industrial trucks: truck register, pre-shift checks, defects and out of service, and operator training, evaluation and authorization.', 'Operations', 'module', 'enabled', true, true, true, true, false, 185)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'forklifts'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select 'nav.forklifts', f.id, 'menu', 'Forklifts', 'Forklifts', 'Powered industrial trucks, pre-shift checks, defects and operator authorizations.', '/forklifts', 'forklifts', 'Equipment & Operations', 185, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
  '{"route_live": true, "required_permission": "forklifts.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key = 'forklifts'
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description, sort_order = excluded.sort_order,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

insert into public.forge_lookup_options (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, 'forklift', 'Forklift / Powered Industrial Truck', 'Forklift, reach truck, order picker, pallet truck or other powered industrial truck.', 15, true, true
from public.forge_lookup_definitions d
where d.lookup_key = 'assets.type'
on conflict (lookup_id, option_key) do update
set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

-- Asset status history: two new sources.
alter table public.forge_asset_status_history drop constraint if exists forge_asset_status_history_source_check;
alter table public.forge_asset_status_history add constraint forge_asset_status_history_source_check
  check (source in ('record_edit','qr_scan','qr_issue','qr_inspection','inspection','import','forklift_check','forklift_defect'));

-- ---------------------------------------------------------------------------
-- Settings (one row per company; defaults apply when there is none)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_forklift_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- 1910.178(l)(4)(iii): an evaluation at least once every three years.
  evaluation_months integer not null default 36 check (evaluation_months between 6 and 36),
  -- Pre-shift checks may only be done by (and so trucks only released to) operators authorized for the truck's class.
  require_authorized_operator boolean not null default true,
  -- Authorization needs a current completion of this course (when set and required).
  require_training boolean not null default true,
  training_course_id uuid references public.forge_training_courses(id) on delete set null,
  -- A critical defect takes the truck out of service (1910.178(q)(7)). Non-critical defects stay open on the truck.
  critical_defect_out_of_service boolean not null default true,
  -- Reminder window for authorizations coming up for re-evaluation.
  expiry_notice_days integer not null default 30 check (expiry_notice_days between 1 and 120),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.forge_forklift_settings_for(p_organization_id uuid)
returns public.forge_forklift_settings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.forge_forklift_settings;
begin
  select * into v from public.forge_forklift_settings where organization_id = p_organization_id;
  if not found then
    v.organization_id := p_organization_id;
    v.evaluation_months := 36;
    v.require_authorized_operator := true;
    v.require_training := true;
    v.training_course_id := null;
    v.critical_defect_out_of_service := true;
    v.expiry_notice_days := 30;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Forklift profile (one per asset)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_forklifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null unique references public.forge_assets(id) on delete cascade,
  -- OSHA / ITA truck classes: I electric rider, II electric narrow aisle, III electric hand / hand-rider,
  -- IV IC cushion tires, V IC pneumatic tires, VI electric and IC tractors, VII rough terrain.
  truck_class text not null check (truck_class in ('I','II','III','IV','V','VI','VII')),
  truck_type text not null default 'sit_down_counterbalance'
    check (truck_type in ('sit_down_counterbalance','stand_up_counterbalance','reach','order_picker','turret','pallet_rider','pallet_walkie','stacker','tow_tractor','rough_terrain','telehandler','other')),
  power_source text not null check (power_source in ('electric','lpg','diesel','gasoline','cng','dual_fuel')),
  rated_capacity_lb integer check (rated_capacity_lb between 100 and 200000),
  load_center_in numeric(5,1) check (load_center_in between 1 and 120),
  max_lift_height_in numeric(6,1) check (max_lift_height_in between 1 and 1500),
  attachments text check (char_length(attachments) <= 500),
  -- UL 558 / 583 type designation (E, ES, EE, EX, D, DS, DY, G, GS, LP, LPS, CN, CNS ...): where the truck may be used.
  designation text check (char_length(designation) <= 20),
  -- 1910.178(a)(4): the nameplate shows the capacity with the attachments fitted.
  nameplate_verified_on date,
  notes text check (char_length(notes) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_forklifts_org_idx on public.forge_forklifts (organization_id, truck_class);

-- ---------------------------------------------------------------------------
-- Pre-shift checklist: built-in items (organization_id null) plus a company's own
-- ---------------------------------------------------------------------------

create table if not exists public.forge_forklift_check_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  item_key text,
  section text not null default 'visual' check (section in ('visual','operational')),
  label text not null check (char_length(label) between 1 and 300),
  -- null = every truck; otherwise the power sources the item applies to.
  power_sources text[],
  critical boolean not null default true,
  allow_na boolean not null default false,
  sort_order integer not null default 100,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (power_sources is null or power_sources <@ array['electric','lpg','diesel','gasoline','cng','dual_fuel']::text[])
);

create unique index if not exists forge_forklift_check_items_builtin_idx
  on public.forge_forklift_check_items (item_key) where organization_id is null;
create index if not exists forge_forklift_check_items_org_idx
  on public.forge_forklift_check_items (organization_id, sort_order);

select set_config('forge.forklift_seed', 'on', false);

insert into public.forge_forklift_check_items (organization_id, item_key, section, label, power_sources, critical, allow_na, sort_order)
values
  (null, 'data_plate', 'visual', 'Data plate is legible and matches the attachments fitted', null, true, false, 10),
  (null, 'tires', 'visual', 'Tires and wheels: inflation and condition, no cuts, chunks missing or loose lug nuts', null, true, false, 20),
  (null, 'forks', 'visual', 'Forks: no cracks, bends or heel wear; locking pins in place', null, true, false, 30),
  (null, 'mast_chains', 'visual', 'Mast, lift chains and cylinders: no damage, chains even and lubricated', null, true, false, 40),
  (null, 'guards', 'visual', 'Overhead guard and load backrest in place and undamaged', null, true, false, 50),
  (null, 'hydraulics', 'visual', 'Hydraulic fluid level correct; no hydraulic leaks under or on the truck', null, true, false, 60),
  (null, 'seat_belt', 'visual', 'Seat belt or operator restraint present and working', null, true, true, 70),
  (null, 'battery', 'visual', 'Battery charged; cables and connectors undamaged; cover secure; no electrolyte leaks', array['electric'], true, false, 80),
  (null, 'lpg_tank', 'visual', 'LPG cylinder secured, relief valve pointing up, hose and fittings sound, no leak or odor', array['lpg','dual_fuel'], true, false, 90),
  (null, 'engine_fluids', 'visual', 'Engine oil, coolant and fuel levels; no fuel or oil leaks', array['lpg','diesel','gasoline','cng','dual_fuel'], true, false, 100),
  (null, 'extinguisher', 'visual', 'Fire extinguisher present and charged (if fitted)', null, false, true, 110),
  (null, 'decals', 'visual', 'Warning decals and operator manual present', null, false, false, 120),
  (null, 'horn', 'operational', 'Horn works', null, true, false, 210),
  (null, 'lights_alarm', 'operational', 'Lights, strobe and travel / backup alarm work (if fitted)', null, false, true, 220),
  (null, 'service_brake', 'operational', 'Service brake stops the truck smoothly', null, true, false, 230),
  (null, 'parking_brake', 'operational', 'Parking brake holds', null, true, false, 240),
  (null, 'steering', 'operational', 'Steering works smoothly with no excess play', null, true, false, 250),
  (null, 'drive_controls', 'operational', 'Accelerator and direction controls work and return to neutral', null, true, false, 260),
  (null, 'hydraulic_controls', 'operational', 'Lift, lower, tilt, side-shift and attachment controls work smoothly', null, true, false, 270),
  (null, 'deadman', 'operational', 'Seat or deadman switch stops travel when released', array['electric'], true, true, 280),
  (null, 'gauges', 'operational', 'Gauges and warning lights normal; no unusual noise, smoke or vibration', null, false, false, 290)
on conflict (item_key) where organization_id is null do update
set section = excluded.section, label = excluded.label, power_sources = excluded.power_sources, critical = excluded.critical,
    allow_na = excluded.allow_na, sort_order = excluded.sort_order;

select set_config('forge.forklift_seed', 'off', false);

-- ---------------------------------------------------------------------------
-- Operator training, evaluation and authorization (one row per person)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_forklift_operators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  status text not null default 'authorized' check (status in ('authorized','suspended','revoked')),
  truck_classes text[] not null check (cardinality(truck_classes) > 0 and truck_classes <@ array['I','II','III','IV','V','VI','VII']::text[]),
  -- Formal instruction and practical training (1910.178(l)(2)(ii)).
  training_completed_on date not null,
  -- Evaluation of the operator's performance in the workplace (1910.178(l)(2)(ii), (l)(4)(iii)).
  evaluated_on date not null,
  evaluator_name text not null check (char_length(evaluator_name) between 1 and 200),
  evaluator_personnel_id uuid references public.forge_personnel(id) on delete set null,
  evaluation_notes text check (char_length(evaluation_notes) <= 4000),
  restrictions text check (char_length(restrictions) <= 1000),
  expires_on date not null,
  authorized_by uuid references auth.users(id) on delete set null,
  authorized_at timestamptz not null default now(),
  refresher_required boolean not null default false,
  refresher_reason text,
  refresher_required_at timestamptz,
  refresher_incident_id uuid references public.forge_incidents(id) on delete set null,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  suspend_reason text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, personnel_id),
  check (evaluated_on >= training_completed_on),
  check (expires_on > evaluated_on)
);

create index if not exists forge_forklift_operators_expiry_idx on public.forge_forklift_operators (organization_id, expires_on);

-- ---------------------------------------------------------------------------
-- Pre-shift checks (append-only) and defects
-- ---------------------------------------------------------------------------

create table if not exists public.forge_forklift_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  forklift_id uuid not null references public.forge_forklifts(id) on delete cascade,
  asset_id uuid not null references public.forge_assets(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  operator_personnel_id uuid references public.forge_personnel(id) on delete set null,
  operator_name text not null,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_at timestamptz not null default clock_timestamp(),
  hour_meter numeric(10,1) check (hour_meter >= 0),
  result text not null check (result in ('pass','fail')),
  -- [{item_id, label, section, critical, answer: ok|defect|na, note}]
  answers jsonb not null,
  notes text check (char_length(notes) <= 4000),
  took_out_of_service boolean not null default false,
  source text not null default 'app' check (source in ('app','qr_scan')),
  qr_code_id uuid references public.forge_qr_codes(id) on delete set null
);

create index if not exists forge_forklift_checks_truck_idx on public.forge_forklift_checks (organization_id, forklift_id, performed_at desc);
create index if not exists forge_forklift_checks_operator_idx on public.forge_forklift_checks (organization_id, operator_personnel_id, performed_at desc);

create table if not exists public.forge_forklift_defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  forklift_id uuid not null references public.forge_forklifts(id) on delete cascade,
  check_id uuid references public.forge_forklift_checks(id) on delete set null,
  check_item_id uuid references public.forge_forklift_check_items(id) on delete set null,
  item_label text not null check (char_length(item_label) between 1 and 300),
  description text not null check (char_length(description) between 1 and 4000),
  critical boolean not null default true,
  status text not null default 'open' check (status in ('open','repaired','not_a_defect')),
  reported_by_user_id uuid references auth.users(id) on delete set null,
  reported_by_personnel_id uuid references public.forge_personnel(id) on delete set null,
  reported_by_name text,
  reported_at timestamptz not null default clock_timestamp(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  maintenance_id uuid references public.forge_asset_maintenance(id) on delete set null,
  check ((status = 'open') = (resolved_at is null))
);

create index if not exists forge_forklift_defects_open_idx on public.forge_forklift_defects (organization_id, forklift_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Incident links, activity, notice log
-- ---------------------------------------------------------------------------

create table if not exists public.forge_forklift_incident_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.forge_incidents(id) on delete cascade,
  forklift_id uuid references public.forge_forklifts(id) on delete cascade,
  operator_id uuid references public.forge_forklift_operators(id) on delete cascade,
  note text check (char_length(note) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (forklift_id is not null or operator_id is not null)
);

create unique index if not exists forge_forklift_incident_links_unique_idx
  on public.forge_forklift_incident_links (incident_id, coalesce(forklift_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(operator_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.forge_forklift_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  forklift_id uuid references public.forge_forklifts(id) on delete cascade,
  operator_id uuid references public.forge_forklift_operators(id) on delete cascade,
  action text not null,
  message text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists forge_forklift_activity_truck_idx on public.forge_forklift_activity (forklift_id, created_at desc);
create index if not exists forge_forklift_activity_operator_idx on public.forge_forklift_activity (operator_id, created_at desc);

create table if not exists public.forge_forklift_notice_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operator_id uuid not null references public.forge_forklift_operators(id) on delete cascade,
  kind text not null check (kind in ('expiring','expired')),
  due_on date not null,
  sent_at timestamptz not null default now(),
  unique (operator_id, kind, due_on)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.forge_forklift_log(
  p_organization_id uuid, p_forklift_id uuid, p_operator_id uuid, p_action text, p_message text,
  p_actor_user_id uuid, p_actor_name text default null, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.forge_forklift_activity (organization_id, forklift_id, operator_id, action, message, actor_user_id, actor_name, metadata)
  values (p_organization_id, p_forklift_id, p_operator_id, p_action, p_message, p_actor_user_id, p_actor_name, coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function public.forge_forklift_class_label(p_class text)
returns text
language sql
immutable
as $$
  select 'Class ' || p_class;
$$;

-- Why a person can't operate (or check out) a truck of this class today; null when they can.
-- Mirrors forgeForkliftRules.operatorStanding.
create or replace function public.forge_forklift_operator_problem(p_organization_id uuid, p_personnel_id uuid, p_truck_class text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_op public.forge_forklift_operators;
  v_settings public.forge_forklift_settings := public.forge_forklift_settings_for(p_organization_id);
  v_name text;
  v_course text;
begin
  select btrim(first_name || ' ' || last_name) into v_name from public.forge_personnel where id = p_personnel_id and organization_id = p_organization_id;
  if v_name is null then
    return 'That person is not in this company.';
  end if;

  select * into v_op from public.forge_forklift_operators where organization_id = p_organization_id and personnel_id = p_personnel_id;
  if not found then
    return v_name || ' is not an authorized forklift operator.';
  end if;
  if v_op.status = 'revoked' then
    return v_name || '''s forklift authorization was revoked.';
  end if;
  if v_op.status = 'suspended' then
    return v_name || '''s forklift authorization is suspended.';
  end if;
  if v_op.refresher_required then
    return v_name || ' needs refresher training and a new evaluation before operating.';
  end if;
  if v_op.expires_on < current_date then
    return v_name || '''s forklift evaluation expired on ' || to_char(v_op.expires_on, 'FMMonth FMDD, YYYY') || '.';
  end if;
  if p_truck_class is not null and not (p_truck_class = any (v_op.truck_classes)) then
    return v_name || ' is not authorized for ' || public.forge_forklift_class_label(p_truck_class) || ' trucks.';
  end if;

  if v_settings.require_training and v_settings.training_course_id is not null then
    select title into v_course from public.forge_training_courses where id = v_settings.training_course_id;
    if v_course is not null and not exists (
      select 1 from public.forge_training_completions tc
      where tc.organization_id = p_organization_id
        and tc.personnel_id = p_personnel_id
        and tc.course_id = v_settings.training_course_id
        and tc.result in ('passed', 'completed')
        and tc.approval_status = 'approved'
        and tc.archived_at is null
        and (tc.expires_at is null or tc.expires_at >= current_date)
    ) then
      return v_name || ' has no current ' || v_course || ' training.';
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trucks
-- ---------------------------------------------------------------------------

-- Create a forklift: a new asset with its profile, or a profile on an existing asset (p_data.asset_id).
create or replace function public.forge_forklift_create(p_organization_id uuid, p_actor_user_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid := nullif(p_data->>'asset_id', '')::uuid;
  v_asset public.forge_assets;
  v_location uuid := nullif(p_data->>'location_id', '')::uuid;
  v_name text := nullif(btrim(coalesce(p_data->>'name', '')), '');
  v_id uuid;
begin
  if v_asset_id is not null then
    select * into v_asset from public.forge_assets where id = v_asset_id and organization_id = p_organization_id for update;
    if not found then
      raise exception 'That equipment record was not found.' using errcode = 'P0002';
    end if;
    if v_asset.retired_at is not null or v_asset.status = 'retired' then
      raise exception 'Retired equipment can''t be made a forklift.' using errcode = '22023';
    end if;
    if exists (select 1 from public.forge_forklifts where asset_id = v_asset_id) then
      raise exception 'That equipment is already a forklift.' using errcode = '23505';
    end if;
    update public.forge_assets set asset_type = 'forklift', updated_at = now(), updated_by = p_actor_user_id where id = v_asset_id;
  else
    if v_name is null then
      raise exception 'Give the forklift a name or unit number.' using errcode = '22023';
    end if;
    if v_location is null or not exists (select 1 from public.locations where id = v_location and organization_id = p_organization_id) then
      raise exception 'Choose the forklift''s location.' using errcode = '22023';
    end if;
    insert into public.forge_assets (
      organization_id, asset_number, asset_type, name, description, status, condition, criticality,
      manufacturer, model, serial_number, location_id, in_service_date, created_by, updated_by
    )
    values (
      p_organization_id, public.next_forge_asset_number(p_organization_id), 'forklift', v_name, nullif(p_data->>'description', ''),
      'active', 'good', 'important',
      nullif(p_data->>'manufacturer', ''), nullif(p_data->>'model', ''), nullif(p_data->>'serial_number', ''),
      v_location, nullif(p_data->>'in_service_date', '')::date, p_actor_user_id, p_actor_user_id
    )
    returning id into v_asset_id;
  end if;

  insert into public.forge_forklifts (
    organization_id, asset_id, truck_class, truck_type, power_source, rated_capacity_lb, load_center_in, max_lift_height_in,
    attachments, designation, nameplate_verified_on, notes, created_by, updated_by
  )
  values (
    p_organization_id, v_asset_id, p_data->>'truck_class', coalesce(nullif(p_data->>'truck_type', ''), 'sit_down_counterbalance'), p_data->>'power_source',
    nullif(p_data->>'rated_capacity_lb', '')::integer, nullif(p_data->>'load_center_in', '')::numeric, nullif(p_data->>'max_lift_height_in', '')::numeric,
    nullif(p_data->>'attachments', ''), nullif(p_data->>'designation', ''), nullif(p_data->>'nameplate_verified_on', '')::date,
    nullif(p_data->>'notes', ''), p_actor_user_id, p_actor_user_id
  )
  returning id into v_id;

  insert into public.forge_asset_activity (organization_id, asset_id, activity_type, message, actor_user_id)
  values (p_organization_id, v_asset_id, 'forklift_profile', 'Set up as a forklift', p_actor_user_id);
  perform public.forge_forklift_log(p_organization_id, v_id, null, 'created', 'Forklift added', p_actor_user_id);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pre-shift checks
-- ---------------------------------------------------------------------------

-- Record a pre-shift check. p_answers: [{item_id, answer: ok|defect|na, note}]. Every item that applies to the truck
-- must be answered once. A defect needs a note; N/A only where the item allows it. Each defect opens a defect row;
-- a critical one takes the truck out of service when settings say so. Returns {check_id, result, out_of_service, defects}.
create or replace function public.forge_forklift_record_check(
  p_organization_id uuid,
  p_forklift_id uuid,
  p_operator_personnel_id uuid,
  p_actor_user_id uuid,
  p_hour_meter numeric,
  p_answers jsonb,
  p_notes text default null,
  p_source text default 'app',
  p_qr_code_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_truck public.forge_forklifts;
  v_asset public.forge_assets;
  v_settings public.forge_forklift_settings := public.forge_forklift_settings_for(p_organization_id);
  v_operator_name text;
  v_problem text;
  v_item record;
  v_answer jsonb;
  v_value text;
  v_note text;
  v_count integer;
  v_snapshot jsonb := '[]'::jsonb;
  v_defects jsonb := '[]'::jsonb;
  v_critical_labels text[] := '{}';
  v_last numeric;
  v_check_id uuid;
  v_result text := 'pass';
  v_oos boolean := false;
begin
  perform set_config('forge.forklift_workflow', 'on', true);

  select * into v_truck from public.forge_forklifts where id = p_forklift_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Forklift not found.' using errcode = 'P0002';
  end if;
  select * into v_asset from public.forge_assets where id = v_truck.asset_id for update;
  if v_asset.retired_at is not null or v_asset.status = 'retired' then
    raise exception 'This forklift is retired.' using errcode = '22023';
  end if;
  if v_asset.status = 'out_of_service' then
    raise exception 'This forklift is out of service. Do not use it until it is returned to service.' using errcode = '22023';
  end if;

  if p_operator_personnel_id is null then
    raise exception 'Name the operator doing the check.' using errcode = '22023';
  end if;
  select btrim(first_name || ' ' || last_name) into v_operator_name
  from public.forge_personnel where id = p_operator_personnel_id and organization_id = p_organization_id and archived_at is null;
  if v_operator_name is null then
    raise exception 'That operator is not in this company.' using errcode = '22023';
  end if;

  if v_settings.require_authorized_operator then
    v_problem := public.forge_forklift_operator_problem(p_organization_id, p_operator_personnel_id, v_truck.truck_class);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = '42501';
    end if;
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answer the checklist.' using errcode = '22023';
  end if;

  for v_item in
    select i.*
    from public.forge_forklift_check_items i
    where (i.organization_id is null or i.organization_id = p_organization_id)
      and i.archived_at is null
      and (i.power_sources is null or v_truck.power_source = any (i.power_sources))
    order by case when i.section = 'visual' then 0 else 1 end, i.sort_order, i.label
  loop
    select count(*) into v_count from jsonb_array_elements(p_answers) a where a->>'item_id' = v_item.id::text;
    if v_count = 0 then
      raise exception 'Answer every item: "%" is missing.', v_item.label using errcode = '22023';
    end if;
    if v_count > 1 then
      raise exception '"%" is answered more than once.', v_item.label using errcode = '22023';
    end if;
    select a into v_answer from jsonb_array_elements(p_answers) a where a->>'item_id' = v_item.id::text;
    v_value := v_answer->>'answer';
    v_note := nullif(btrim(coalesce(v_answer->>'note', '')), '');
    if v_value is null or v_value not in ('ok','defect','na') then
      raise exception 'Answer "%" OK, defect or N/A.', v_item.label using errcode = '22023';
    end if;
    if v_value = 'na' and not v_item.allow_na then
      raise exception '"%" can''t be marked N/A.', v_item.label using errcode = '22023';
    end if;
    if v_value = 'defect' and v_note is null then
      raise exception 'Describe the defect for "%".', v_item.label using errcode = '22023';
    end if;
    if v_note is not null and char_length(v_note) > 1000 then
      raise exception 'The note for "%" is too long.', v_item.label using errcode = '22023';
    end if;

    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      'item_id', v_item.id, 'label', v_item.label, 'section', v_item.section, 'critical', v_item.critical,
      'answer', v_value, 'note', v_note
    ));
    if v_value = 'defect' then
      v_result := 'fail';
      v_defects := v_defects || jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'label', v_item.label, 'critical', v_item.critical, 'note', v_note));
      if v_item.critical then
        v_critical_labels := v_critical_labels || v_item.label;
      end if;
    end if;
  end loop;

  -- Answers for items that don't exist or don't apply are refused, so nothing is silently dropped.
  if exists (
    select 1 from jsonb_array_elements(p_answers) a
    where not exists (select 1 from jsonb_array_elements(v_snapshot) s where s->>'item_id' = a->>'item_id')
  ) then
    raise exception 'The checklist changed. Reload the page and answer it again.' using errcode = '22023';
  end if;

  if p_hour_meter is not null then
    if p_hour_meter < 0 then
      raise exception 'The hour meter can''t be negative.' using errcode = '22023';
    end if;
    select reading into v_last from public.forge_asset_meter_readings
    where asset_id = v_truck.asset_id and meter_type = 'hours' order by recorded_at desc, created_at desc limit 1;
    if v_last is not null and p_hour_meter < v_last then
      raise exception 'The hour meter reading (%) is lower than the last reading (%).', p_hour_meter, v_last using errcode = '22023';
    end if;
  end if;

  v_oos := cardinality(v_critical_labels) > 0 and v_settings.critical_defect_out_of_service;

  insert into public.forge_forklift_checks (
    organization_id, forklift_id, asset_id, location_id, operator_personnel_id, operator_name, performed_by_user_id,
    hour_meter, result, answers, notes, took_out_of_service, source, qr_code_id
  )
  values (
    p_organization_id, v_truck.id, v_truck.asset_id, v_asset.location_id, p_operator_personnel_id, v_operator_name, p_actor_user_id,
    p_hour_meter, v_result, v_snapshot, nullif(btrim(coalesce(p_notes, '')), ''), v_oos,
    case when p_source = 'qr_scan' then 'qr_scan' else 'app' end, p_qr_code_id
  )
  returning id into v_check_id;

  insert into public.forge_forklift_defects (
    organization_id, forklift_id, check_id, check_item_id, item_label, description, critical,
    reported_by_user_id, reported_by_personnel_id, reported_by_name
  )
  select p_organization_id, v_truck.id, v_check_id, (d->>'item_id')::uuid, d->>'label', d->>'note', (d->>'critical')::boolean,
    p_actor_user_id, p_operator_personnel_id, v_operator_name
  from jsonb_array_elements(v_defects) d;

  if p_hour_meter is not null then
    insert into public.forge_asset_meter_readings (organization_id, asset_id, meter_type, reading, unit, notes, recorded_by)
    values (p_organization_id, v_truck.asset_id, 'hours', p_hour_meter, 'hours', 'Pre-shift check', p_actor_user_id);
  end if;

  if v_oos then
    perform public.forge_set_asset_service_status(
      p_organization_id, v_truck.asset_id, 'out_of_service',
      'Pre-shift check failed: ' || array_to_string(v_critical_labels, '; '), null,
      'forklift_check', p_qr_code_id, p_actor_user_id, p_operator_personnel_id, v_operator_name,
      'forklift_check', v_check_id
    );
  end if;

  perform public.forge_forklift_log(
    p_organization_id, v_truck.id, null, 'check',
    case when v_result = 'pass' then 'Pre-shift check passed'
         when v_oos then 'Pre-shift check failed; taken out of service'
         else 'Pre-shift check found ' || jsonb_array_length(v_defects) || ' non-critical defect(s)' end,
    p_actor_user_id, v_operator_name, jsonb_build_object('check_id', v_check_id)
  );

  return jsonb_build_object('check_id', v_check_id, 'result', v_result, 'out_of_service', v_oos, 'defects', jsonb_array_length(v_defects));
end;
$$;

-- ---------------------------------------------------------------------------
-- Defects
-- ---------------------------------------------------------------------------

-- Report a defect outside a check (anyone who can check the truck). A critical defect takes it out of service.
create or replace function public.forge_forklift_report_defect(
  p_organization_id uuid,
  p_forklift_id uuid,
  p_actor_user_id uuid,
  p_actor_personnel_id uuid,
  p_actor_name text,
  p_label text,
  p_description text,
  p_critical boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_truck public.forge_forklifts;
  v_asset public.forge_assets;
  v_id uuid;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  perform set_config('forge.forklift_workflow', 'on', true);

  select * into v_truck from public.forge_forklifts where id = p_forklift_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Forklift not found.' using errcode = 'P0002';
  end if;
  select * into v_asset from public.forge_assets where id = v_truck.asset_id for update;
  if v_asset.retired_at is not null or v_asset.status = 'retired' then
    raise exception 'This forklift is retired.' using errcode = '22023';
  end if;
  if v_label is null then
    raise exception 'Say what is wrong (for example "Horn").' using errcode = '22023';
  end if;
  if v_description is null then
    raise exception 'Describe the defect.' using errcode = '22023';
  end if;

  insert into public.forge_forklift_defects (
    organization_id, forklift_id, item_label, description, critical, reported_by_user_id, reported_by_personnel_id, reported_by_name
  )
  values (p_organization_id, v_truck.id, left(v_label, 300), left(v_description, 4000), coalesce(p_critical, true), p_actor_user_id, p_actor_personnel_id, p_actor_name)
  returning id into v_id;

  if coalesce(p_critical, true) and (public.forge_forklift_settings_for(p_organization_id)).critical_defect_out_of_service and v_asset.status <> 'out_of_service' then
    perform public.forge_set_asset_service_status(
      p_organization_id, v_truck.asset_id, 'out_of_service', 'Defect reported: ' || v_label, v_description,
      'forklift_defect', null, p_actor_user_id, p_actor_personnel_id, p_actor_name, 'forklift_defect', v_id
    );
  end if;

  perform public.forge_forklift_log(p_organization_id, v_truck.id, null, 'defect',
    case when coalesce(p_critical, true) then 'Critical defect reported: ' else 'Defect reported: ' end || v_label,
    p_actor_user_id, p_actor_name, jsonb_build_object('defect_id', v_id));

  return v_id;
end;
$$;

-- Close a defect as repaired or not a defect, optionally recording the repair as asset maintenance.
create or replace function public.forge_forklift_resolve_defect(
  p_organization_id uuid,
  p_defect_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_note text,
  p_record_repair boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_defect public.forge_forklift_defects;
  v_truck public.forge_forklifts;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_maintenance uuid;
begin
  perform set_config('forge.forklift_workflow', 'on', true);

  select * into v_defect from public.forge_forklift_defects where id = p_defect_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'Defect not found.' using errcode = 'P0002';
  end if;
  if v_defect.status <> 'open' then
    raise exception 'This defect is already closed.' using errcode = '22023';
  end if;
  if p_status not in ('repaired','not_a_defect') then
    raise exception 'Close the defect as repaired or not a defect.' using errcode = '22023';
  end if;
  if v_note is null then
    raise exception '%', case when p_status = 'repaired' then 'Say what was repaired.' else 'Say why this is not a defect.' end using errcode = '22023';
  end if;

  select * into v_truck from public.forge_forklifts where id = v_defect.forklift_id;

  if p_status = 'repaired' and p_record_repair then
    insert into public.forge_asset_maintenance (organization_id, asset_id, maintenance_type, status, performed_on, description, findings, corrective_action, created_by, updated_by)
    values (p_organization_id, v_truck.asset_id, 'corrective', 'completed', current_date, 'Forklift defect: ' || v_defect.item_label, v_defect.description, v_note, p_actor_user_id, p_actor_user_id)
    returning id into v_maintenance;
  end if;

  update public.forge_forklift_defects
  set status = p_status, resolved_by = p_actor_user_id, resolved_at = clock_timestamp(), resolution_note = left(v_note, 4000), maintenance_id = v_maintenance
  where id = v_defect.id;

  perform public.forge_forklift_log(p_organization_id, v_defect.forklift_id, null, 'defect_closed',
    case when p_status = 'repaired' then 'Defect repaired: ' else 'Not a defect: ' end || v_defect.item_label,
    p_actor_user_id, null, jsonb_build_object('defect_id', v_defect.id));
end;
$$;

-- Return a forklift to service: refused while a critical defect is open (the asset guard enforces this everywhere).
create or replace function public.forge_forklift_return_to_service(p_organization_id uuid, p_forklift_id uuid, p_actor_user_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_truck public.forge_forklifts;
begin
  select * into v_truck from public.forge_forklifts where id = p_forklift_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Forklift not found.' using errcode = 'P0002';
  end if;
  if (select status from public.forge_assets where id = v_truck.asset_id) <> 'out_of_service' then
    raise exception 'This forklift is not out of service.' using errcode = '22023';
  end if;
  perform public.forge_set_asset_service_status(
    p_organization_id, v_truck.asset_id, 'active', 'Returned to service', nullif(btrim(coalesce(p_notes, '')), ''),
    'forklift_defect', null, p_actor_user_id, null, null, null, null
  );
  perform public.forge_forklift_log(p_organization_id, v_truck.id, null, 'returned', 'Returned to service', p_actor_user_id);
end;
$$;

-- Take a forklift out of service by hand (no defect needed).
create or replace function public.forge_forklift_take_out_of_service(p_organization_id uuid, p_forklift_id uuid, p_actor_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_truck public.forge_forklifts;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'Say why the forklift is out of service.' using errcode = '22023';
  end if;
  select * into v_truck from public.forge_forklifts where id = p_forklift_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Forklift not found.' using errcode = 'P0002';
  end if;
  if (select status from public.forge_assets where id = v_truck.asset_id) <> 'active' then
    raise exception 'Only a forklift in service can be taken out of service.' using errcode = '22023';
  end if;
  perform public.forge_set_asset_service_status(
    p_organization_id, v_truck.asset_id, 'out_of_service', left(v_reason, 500), null,
    'forklift_defect', null, p_actor_user_id, null, null, null, null
  );
  perform public.forge_forklift_log(p_organization_id, v_truck.id, null, 'out_of_service', 'Taken out of service: ' || v_reason, p_actor_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Operators
-- ---------------------------------------------------------------------------

-- Authorize (or re-evaluate) an operator. A new evaluation clears a refresher requirement and restarts the clock;
-- it also re-authorizes a suspended or revoked operator. Returns the operator row id.
create or replace function public.forge_forklift_authorize(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_personnel_id uuid,
  p_truck_classes text[],
  p_training_completed_on date,
  p_evaluated_on date,
  p_evaluator_name text,
  p_evaluator_personnel_id uuid default null,
  p_evaluation_notes text default null,
  p_restrictions text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.forge_forklift_settings := public.forge_forklift_settings_for(p_organization_id);
  v_person public.forge_personnel;
  v_existing public.forge_forklift_operators;
  v_classes text[];
  v_expires date;
  v_course text;
  v_id uuid;
  v_evaluator text := nullif(btrim(coalesce(p_evaluator_name, '')), '');
  v_action text;
begin
  perform set_config('forge.forklift_workflow', 'on', true);

  select * into v_person from public.forge_personnel where id = p_personnel_id and organization_id = p_organization_id and archived_at is null;
  if not found then
    raise exception 'That person is not in this company.' using errcode = '22023';
  end if;
  if coalesce(v_person.employment_status, 'active') <> 'active' then
    raise exception 'Only active personnel can be authorized.' using errcode = '22023';
  end if;
  if v_person.auth_user_id is not null and v_person.auth_user_id = p_actor_user_id then
    raise exception 'You can''t authorize yourself.' using errcode = '42501';
  end if;

  select array_agg(distinct c order by c) into v_classes from unnest(coalesce(p_truck_classes, '{}')) c where c is not null;
  if v_classes is null or cardinality(v_classes) = 0 then
    raise exception 'Choose the truck classes this operator is authorized for.' using errcode = '22023';
  end if;
  if not (v_classes <@ array['I','II','III','IV','V','VI','VII']::text[]) then
    raise exception 'Unknown truck class.' using errcode = '22023';
  end if;

  if p_training_completed_on is null then
    raise exception 'Enter the date training was completed.' using errcode = '22023';
  end if;
  if p_evaluated_on is null then
    raise exception 'Enter the date of the evaluation.' using errcode = '22023';
  end if;
  if p_training_completed_on > current_date or p_evaluated_on > current_date then
    raise exception 'Training and evaluation dates can''t be in the future.' using errcode = '22023';
  end if;
  if p_evaluated_on < p_training_completed_on then
    raise exception 'The evaluation can''t be before the training.' using errcode = '22023';
  end if;
  v_expires := (p_evaluated_on + make_interval(months => v_settings.evaluation_months))::date;
  if v_expires < current_date then
    raise exception 'That evaluation is more than % months old. Evaluate the operator again.', v_settings.evaluation_months using errcode = '22023';
  end if;

  if v_evaluator is null then
    raise exception 'Name the person who evaluated the operator.' using errcode = '22023';
  end if;
  if p_evaluator_personnel_id is not null then
    if p_evaluator_personnel_id = p_personnel_id then
      raise exception 'Operators can''t evaluate themselves.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.forge_personnel where id = p_evaluator_personnel_id and organization_id = p_organization_id) then
      raise exception 'The evaluator is not in this company.' using errcode = '22023';
    end if;
  end if;

  if v_settings.require_training and v_settings.training_course_id is not null then
    select title into v_course from public.forge_training_courses where id = v_settings.training_course_id;
    if v_course is not null and not exists (
      select 1 from public.forge_training_completions tc
      where tc.organization_id = p_organization_id
        and tc.personnel_id = p_personnel_id
        and tc.course_id = v_settings.training_course_id
        and tc.result in ('passed', 'completed')
        and tc.approval_status = 'approved'
        and tc.archived_at is null
        and (tc.expires_at is null or tc.expires_at >= current_date)
    ) then
      raise exception '% has no current % training.', btrim(v_person.first_name || ' ' || v_person.last_name), v_course using errcode = '22023';
    end if;
  end if;

  select * into v_existing from public.forge_forklift_operators where organization_id = p_organization_id and personnel_id = p_personnel_id for update;

  if found then
    v_action := case when v_existing.status = 'authorized' and not v_existing.refresher_required then 'renewed' else 'authorized' end;
    update public.forge_forklift_operators
    set status = 'authorized', truck_classes = v_classes, training_completed_on = p_training_completed_on, evaluated_on = p_evaluated_on,
        evaluator_name = left(v_evaluator, 200), evaluator_personnel_id = p_evaluator_personnel_id,
        evaluation_notes = nullif(btrim(coalesce(p_evaluation_notes, '')), ''), restrictions = nullif(btrim(coalesce(p_restrictions, '')), ''),
        expires_on = v_expires, authorized_by = p_actor_user_id, authorized_at = now(),
        refresher_required = false, refresher_reason = null, refresher_required_at = null, refresher_incident_id = null,
        suspended_at = null, suspended_by = null, suspend_reason = null, revoked_at = null, revoked_by = null, revoke_reason = null,
        updated_at = now()
    where id = v_existing.id
    returning id into v_id;
  else
    v_action := 'authorized';
    insert into public.forge_forklift_operators (
      organization_id, personnel_id, status, truck_classes, training_completed_on, evaluated_on, evaluator_name, evaluator_personnel_id,
      evaluation_notes, restrictions, expires_on, authorized_by, created_by
    )
    values (
      p_organization_id, p_personnel_id, 'authorized', v_classes, p_training_completed_on, p_evaluated_on, left(v_evaluator, 200), p_evaluator_personnel_id,
      nullif(btrim(coalesce(p_evaluation_notes, '')), ''), nullif(btrim(coalesce(p_restrictions, '')), ''), v_expires, p_actor_user_id, p_actor_user_id
    )
    returning id into v_id;
  end if;

  perform public.forge_forklift_log(p_organization_id, null, v_id, v_action,
    case when v_action = 'renewed' then 'Re-evaluated; authorized until ' else 'Authorized until ' end
      || to_char(v_expires, 'FMMonth FMDD, YYYY') || ' for ' || array_to_string(v_classes, ', ') || ' (evaluated by ' || v_evaluator || ')',
    p_actor_user_id, null,
    jsonb_build_object('truck_classes', to_jsonb(v_classes), 'evaluated_on', p_evaluated_on, 'training_completed_on', p_training_completed_on, 'expires_on', v_expires));

  return v_id;
end;
$$;

-- suspend / reinstate / revoke / require_refresher. A reason is needed for all but reinstate.
-- A refresher is cleared only by a new evaluation (forge_forklift_authorize).
create or replace function public.forge_forklift_set_operator_status(
  p_organization_id uuid,
  p_operator_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_reason text default null,
  p_incident_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op public.forge_forklift_operators;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_self uuid;
begin
  perform set_config('forge.forklift_workflow', 'on', true);

  select * into v_op from public.forge_forklift_operators where id = p_operator_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'Operator not found.' using errcode = 'P0002';
  end if;
  select auth_user_id into v_self from public.forge_personnel where id = v_op.personnel_id;
  if v_self is not null and v_self = p_actor_user_id and p_action = 'reinstate' then
    raise exception 'You can''t reinstate yourself.' using errcode = '42501';
  end if;
  if p_action <> 'reinstate' and v_reason is null then
    raise exception 'Give a reason.' using errcode = '22023';
  end if;
  if p_incident_id is not null and not exists (select 1 from public.forge_incidents where id = p_incident_id and organization_id = p_organization_id) then
    raise exception 'Incident not found.' using errcode = 'P0002';
  end if;

  if p_action = 'suspend' then
    if v_op.status <> 'authorized' then
      raise exception 'Only an authorized operator can be suspended.' using errcode = '22023';
    end if;
    update public.forge_forklift_operators
    set status = 'suspended', suspended_at = now(), suspended_by = p_actor_user_id, suspend_reason = left(v_reason, 1000), updated_at = now()
    where id = v_op.id;
    perform public.forge_forklift_log(p_organization_id, null, v_op.id, 'suspended', 'Suspended: ' || v_reason, p_actor_user_id);
  elsif p_action = 'reinstate' then
    if v_op.status <> 'suspended' then
      raise exception 'Only a suspended operator can be reinstated.' using errcode = '22023';
    end if;
    update public.forge_forklift_operators
    set status = 'authorized', suspended_at = null, suspended_by = null, suspend_reason = null, updated_at = now()
    where id = v_op.id;
    perform public.forge_forklift_log(p_organization_id, null, v_op.id, 'reinstated', 'Reinstated' || coalesce(': ' || v_reason, ''), p_actor_user_id);
  elsif p_action = 'revoke' then
    if v_op.status = 'revoked' then
      raise exception 'This authorization is already revoked.' using errcode = '22023';
    end if;
    update public.forge_forklift_operators
    set status = 'revoked', revoked_at = now(), revoked_by = p_actor_user_id, revoke_reason = left(v_reason, 1000), updated_at = now()
    where id = v_op.id;
    perform public.forge_forklift_log(p_organization_id, null, v_op.id, 'revoked', 'Revoked: ' || v_reason, p_actor_user_id);
  elsif p_action = 'require_refresher' then
    if v_op.status = 'revoked' then
      raise exception 'This authorization is revoked.' using errcode = '22023';
    end if;
    update public.forge_forklift_operators
    set refresher_required = true, refresher_reason = left(v_reason, 1000), refresher_required_at = now(),
        refresher_incident_id = coalesce(p_incident_id, refresher_incident_id), updated_at = now()
    where id = v_op.id;
    perform public.forge_forklift_log(p_organization_id, null, v_op.id, 'refresher_required', 'Refresher training required: ' || v_reason, p_actor_user_id,
      null, jsonb_build_object('incident_id', p_incident_id));
  else
    raise exception 'Unknown action.' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Workflow-only tables: writes need forge.forklift_workflow; deletes only via the organization cascade.
create or replace function public.forge_forklift_workflow_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception '% records can''t be deleted.', replace(replace(tg_table_name, 'forge_forklift_', ''), '_', ' ') using errcode = '42501';
  end if;
  -- ON DELETE SET NULL from personnel, incidents and maintenance arrives from a foreign-key trigger.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  if coalesce(current_setting('forge.forklift_workflow', true), '') <> 'on' then
    raise exception 'Use the forklift workflow to change %.', replace(replace(tg_table_name, 'forge_forklift_', ''), '_', ' ') using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'A record can''t move to another company.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Checks: insert only through the workflow, never changed.
create or replace function public.forge_forklift_checks_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Pre-shift checks can''t be deleted.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    -- ON DELETE SET NULL from personnel / QR codes / locations is allowed; nothing else changes.
    if pg_trigger_depth() > 1 then
      return new;
    end if;
    raise exception 'Pre-shift checks can''t be changed.' using errcode = '42501';
  end if;
  if coalesce(current_setting('forge.forklift_workflow', true), '') <> 'on' then
    raise exception 'Use the forklift workflow to record a check.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Activity is append-only.
create or replace function public.forge_forklift_activity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  raise exception 'Forklift history can''t be changed.' using errcode = '42501';
end;
$$;

-- Profiles: same company as the asset; the asset never changes.
create or replace function public.forge_forklifts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
begin
  if tg_op = 'UPDATE' and (new.asset_id is distinct from old.asset_id or new.organization_id is distinct from old.organization_id) then
    raise exception 'A forklift profile can''t move to other equipment.' using errcode = '42501';
  end if;
  select organization_id into v_org from public.forge_assets where id = new.asset_id;
  if v_org is distinct from new.organization_id then
    raise exception 'The equipment belongs to another company.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Built-in checklist items are fixed; company items stay in their company.
create or replace function public.forge_forklift_check_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('forge.forklift_seed', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'Archive a checklist item instead of deleting it.' using errcode = '42501';
  end if;
  if (tg_op = 'INSERT' and new.organization_id is null) or (tg_op = 'UPDATE' and old.organization_id is null) then
    raise exception 'Built-in checklist items can''t be changed.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'A checklist item can''t move to another company.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Defects, operators, incident links: every reference stays inside one company.
create or replace function public.forge_forklift_company_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'forge_forklift_defects' then
    if not exists (select 1 from public.forge_forklifts where id = new.forklift_id and organization_id = new.organization_id) then
      raise exception 'The forklift belongs to another company.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'forge_forklift_operators' then
    if not exists (select 1 from public.forge_personnel where id = new.personnel_id and organization_id = new.organization_id) then
      raise exception 'The operator belongs to another company.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'forge_forklift_incident_links' then
    if not exists (select 1 from public.forge_incidents where id = new.incident_id and organization_id = new.organization_id)
       or (new.forklift_id is not null and not exists (select 1 from public.forge_forklifts where id = new.forklift_id and organization_id = new.organization_id))
       or (new.operator_id is not null and not exists (select 1 from public.forge_forklift_operators where id = new.operator_id and organization_id = new.organization_id)) then
      raise exception 'Links stay inside one company.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'forge_forklift_checks' then
    if not exists (select 1 from public.forge_forklifts where id = new.forklift_id and organization_id = new.organization_id and asset_id = new.asset_id) then
      raise exception 'The forklift belongs to another company.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- A forklift with an open critical defect stays out of service, whichever screen or scan tries to return it.
create or replace function public.forge_forklift_asset_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_label text;
begin
  if old.status = 'out_of_service' and new.status is distinct from old.status and new.status <> 'retired' then
    select d.item_label into v_label
    from public.forge_forklifts f
    join public.forge_forklift_defects d on d.forklift_id = f.id and d.status = 'open' and d.critical
    where f.asset_id = new.id
    order by d.reported_at
    limit 1;
    if v_label is not null then
      raise exception 'This forklift has an open critical defect (%). Close it as repaired before returning the forklift to service.', v_label using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists forge_forklifts_guard on public.forge_forklifts;
create trigger forge_forklifts_guard before insert or update on public.forge_forklifts
for each row execute function public.forge_forklifts_guard();

drop trigger if exists forge_forklift_check_items_guard on public.forge_forklift_check_items;
create trigger forge_forklift_check_items_guard before insert or update or delete on public.forge_forklift_check_items
for each row execute function public.forge_forklift_check_items_guard();

drop trigger if exists forge_forklift_checks_guard on public.forge_forklift_checks;
create trigger forge_forklift_checks_guard before insert or update or delete on public.forge_forklift_checks
for each row execute function public.forge_forklift_checks_guard();

drop trigger if exists forge_forklift_checks_company on public.forge_forklift_checks;
create trigger forge_forklift_checks_company before insert on public.forge_forklift_checks
for each row execute function public.forge_forklift_company_guard();

drop trigger if exists forge_forklift_defects_guard on public.forge_forklift_defects;
create trigger forge_forklift_defects_guard before insert or update or delete on public.forge_forklift_defects
for each row execute function public.forge_forklift_workflow_guard();

drop trigger if exists forge_forklift_defects_company on public.forge_forklift_defects;
create trigger forge_forklift_defects_company before insert or update on public.forge_forklift_defects
for each row execute function public.forge_forklift_company_guard();

drop trigger if exists forge_forklift_operators_guard on public.forge_forklift_operators;
create trigger forge_forklift_operators_guard before insert or update or delete on public.forge_forklift_operators
for each row execute function public.forge_forklift_workflow_guard();

drop trigger if exists forge_forklift_operators_company on public.forge_forklift_operators;
create trigger forge_forklift_operators_company before insert or update on public.forge_forklift_operators
for each row execute function public.forge_forklift_company_guard();

drop trigger if exists forge_forklift_incident_links_company on public.forge_forklift_incident_links;
create trigger forge_forklift_incident_links_company before insert or update on public.forge_forklift_incident_links
for each row execute function public.forge_forklift_company_guard();

drop trigger if exists forge_forklift_activity_guard on public.forge_forklift_activity;
create trigger forge_forklift_activity_guard before update or delete on public.forge_forklift_activity
for each row execute function public.forge_forklift_activity_guard();

drop trigger if exists forge_forklift_asset_guard on public.forge_assets;
create trigger forge_forklift_asset_guard before update of status on public.forge_assets
for each row execute function public.forge_forklift_asset_guard();

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

alter table public.forge_forklift_settings enable row level security;
alter table public.forge_forklifts enable row level security;
alter table public.forge_forklift_check_items enable row level security;
alter table public.forge_forklift_operators enable row level security;
alter table public.forge_forklift_checks enable row level security;
alter table public.forge_forklift_defects enable row level security;
alter table public.forge_forklift_incident_links enable row level security;
alter table public.forge_forklift_activity enable row level security;
alter table public.forge_forklift_notice_log enable row level security;

revoke all on public.forge_forklift_settings, public.forge_forklifts, public.forge_forklift_check_items, public.forge_forklift_operators,
  public.forge_forklift_checks, public.forge_forklift_defects, public.forge_forklift_incident_links, public.forge_forklift_activity,
  public.forge_forklift_notice_log
  from anon, authenticated;

grant all on public.forge_forklift_settings, public.forge_forklifts, public.forge_forklift_check_items, public.forge_forklift_operators,
  public.forge_forklift_checks, public.forge_forklift_defects, public.forge_forklift_incident_links, public.forge_forklift_activity,
  public.forge_forklift_notice_log
  to service_role;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'forge_forklift_settings_for(uuid)',
    'forge_forklift_log(uuid, uuid, uuid, text, text, uuid, text, jsonb)',
    'forge_forklift_operator_problem(uuid, uuid, text)',
    'forge_forklift_create(uuid, uuid, jsonb)',
    'forge_forklift_record_check(uuid, uuid, uuid, uuid, numeric, jsonb, text, text, uuid)',
    'forge_forklift_report_defect(uuid, uuid, uuid, uuid, text, text, text, boolean)',
    'forge_forklift_resolve_defect(uuid, uuid, uuid, text, text, boolean)',
    'forge_forklift_return_to_service(uuid, uuid, uuid, text)',
    'forge_forklift_take_out_of_service(uuid, uuid, uuid, text)',
    'forge_forklift_authorize(uuid, uuid, uuid, text[], date, date, text, uuid, text, text)',
    'forge_forklift_set_operator_status(uuid, uuid, uuid, text, text, uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', v_fn);
    execute format('grant execute on function public.%s to service_role', v_fn);
  end loop;
end;
$$;

revoke all on function public.forge_forklift_workflow_guard() from public, anon, authenticated;
revoke all on function public.forge_forklift_checks_guard() from public, anon, authenticated;
revoke all on function public.forge_forklift_activity_guard() from public, anon, authenticated;
revoke all on function public.forge_forklifts_guard() from public, anon, authenticated;
revoke all on function public.forge_forklift_check_items_guard() from public, anon, authenticated;
revoke all on function public.forge_forklift_company_guard() from public, anon, authenticated;
revoke all on function public.forge_forklift_asset_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('forklifts.view', 'forklifts', 'View Forklifts', 'See forklifts, pre-shift checks, defects and operator authorizations. Location scope sees its own locations.', 'Forklifts', 'view', true, true, 'organization', false, false, true, 'normal', 10),
  ('forklifts.check', 'forklifts', 'Do Forklift Pre-Shift Checks', 'Do pre-shift checks and report defects on forklifts.', 'Forklifts', 'check', true, true, 'organization', false, false, true, 'normal', 20),
  ('forklifts.manage', 'forklifts', 'Manage Forklifts', 'Add and edit forklifts, close defects, take forklifts out of service and return them, link incidents, and change the checklist and settings.', 'Forklifts', 'manage', true, true, 'organization', false, true, true, 'sensitive', 30),
  ('forklifts.authorize', 'forklifts', 'Authorize Forklift Operators', 'Record operator training and evaluations, authorize operators for truck classes, require refresher training, suspend and revoke.', 'Forklifts', 'authorize', true, true, 'organization', true, true, true, 'sensitive', 40)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    requires_confirmation = excluded.requires_confirmation, is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level,
    sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, v.scope
from (values
  ('read-only', 'forklifts.view', 'organization'),
  ('standard-user', 'forklifts.view', 'location'),
  ('standard-user', 'forklifts.check', 'location'),
  ('supervisor', 'forklifts.view', 'location'),
  ('supervisor', 'forklifts.check', 'location'),
  ('safety-manager', 'forklifts.view', 'organization'),
  ('safety-manager', 'forklifts.check', 'organization'),
  ('safety-manager', 'forklifts.manage', 'organization'),
  ('safety-manager', 'forklifts.authorize', 'organization'),
  ('company-admin', 'forklifts.view', 'organization'),
  ('company-admin', 'forklifts.check', 'organization'),
  ('company-admin', 'forklifts.manage', 'organization'),
  ('company-admin', 'forklifts.authorize', 'organization')
) as v(template_key, permission_key, scope)
join public.forge_role_templates rt on rt.template_key = v.template_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, v.scope
from (values
  ('read-only', 'forklifts.view', 'organization'),
  ('employee', 'forklifts.view', 'location'),
  ('employee', 'forklifts.check', 'location'),
  ('supervisor', 'forklifts.view', 'location'),
  ('supervisor', 'forklifts.check', 'location'),
  ('location-administrator', 'forklifts.view', 'location'),
  ('location-administrator', 'forklifts.check', 'location'),
  ('location-administrator', 'forklifts.manage', 'location'),
  ('location-administrator', 'forklifts.authorize', 'location'),
  ('company-administrator', 'forklifts.view', 'organization'),
  ('company-administrator', 'forklifts.check', 'organization'),
  ('company-administrator', 'forklifts.manage', 'organization'),
  ('company-administrator', 'forklifts.authorize', 'organization'),
  ('company-owner', 'forklifts.view', 'organization'),
  ('company-owner', 'forklifts.check', 'organization'),
  ('company-owner', 'forklifts.manage', 'organization'),
  ('company-owner', 'forklifts.authorize', 'organization')
) as v(role_key, permission_key, scope)
join public.forge_tenant_roles r on r.role_key = v.role_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
