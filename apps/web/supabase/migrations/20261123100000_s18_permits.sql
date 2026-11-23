-- Port slice 18: High-risk work permits on one shared Permit-to-Work engine.
--
-- Covers Industrial 1.0's Confined Space, Hot Work, Working at Heights and Electrical Safety modules. In 1.0 these
-- were four identical tables of titled rows with a free-text status: no transition rules, no approver, no expiry,
-- no gas limits, no fire watch, no training checks, and any field user could approve. This slice is built from the
-- parity matrix and the rules behind each permit:
--   confined space  OSHA 1910.146 (permit, entry supervisor / attendant / entrants, testing, rescue, entry log)
--   hot work        OSHA 1910.252(a) and NFPA 51B (35 ft rule, fire watch during and after the work)
--   heights         OSHA 1910.28 / 1910.140 and 1926.502 (fall protection, anchorage, prompt rescue)
--   electrical      NFPA 70E 130.2 (energized electrical work permit, justification, boundaries, PPE)
--
-- One table of permits with a type; one lifecycle:
--   draft -> requested -> approved -> active <-> suspended -> closed       (draft/requested/approved -> canceled)
-- A rejection sends a requested permit back to draft with a reason. Expiry is not a status: a permit past its
-- valid-until time can't be issued, resumed or entered, and can still be closed.
--
-- Status and workflow columns change only inside the workflow functions below (they set forge.permit_workflow).

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('work_permits', 'High-Risk Work Permits', 'Confined space, hot work, working at heights and energized electrical work permits with approval, issue, gas testing, entry logs and closeout.', 'High-Risk Work', 'module', 'enabled', true, true, true, true, false, 191)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'work_permits'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select v.element_key, f.id, 'menu', v.label, v.label, v.description, v.route, v.component_key, 'High-Risk Work', v.sort_order, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
  '{"route_live": true, "required_permission": "permits.view"}'::jsonb
from (values
  ('nav.permits', 'Work Permits', 'Every open permit: waiting for approval, active now, suspended, and who is inside a confined space.', '/permits', 'work-permits', 191),
  ('nav.confined_space', 'Confined Space', 'Permit-required confined spaces and entry permits.', '/permits/confined-space', 'confined-space', 192),
  ('nav.hot_work', 'Hot Work', 'Hot work permits with fire watch.', '/permits/hot-work', 'hot-work', 193),
  ('nav.working_at_heights', 'Working at Heights', 'Fall protection permits.', '/permits/working-at-heights', 'working-at-heights', 194),
  ('nav.electrical_safety', 'Electrical Safety', 'Energized electrical work permits.', '/permits/electrical', 'electrical-safety', 195)
) as v(element_key, label, description, route, component_key, sort_order)
cross join public.forge_feature_registry f
where f.feature_key = 'work_permits'
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description, sort_order = excluded.sort_order,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Settings (one row per company; defaults apply when there is none)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_permit_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  allow_self_approval boolean not null default false,
  require_training boolean not null default true,
  confined_space_max_hours integer not null default 12 check (confined_space_max_hours between 1 and 24),
  hot_work_max_hours integer not null default 12 check (hot_work_max_hours between 1 and 24),
  heights_max_hours integer not null default 12 check (heights_max_hours between 1 and 24),
  electrical_max_hours integer not null default 12 check (electrical_max_hours between 1 and 24),
  -- Atmospheric limits (1910.146(b) "hazardous atmosphere"; CO and H2S are common permit limits, change to suit).
  o2_min numeric(4,1) not null default 19.5 check (o2_min between 16 and 21),
  o2_max numeric(4,1) not null default 23.5 check (o2_max between 21 and 25),
  lel_max numeric(4,1) not null default 10 check (lel_max between 0 and 25),
  hot_work_lel_max numeric(4,1) not null default 10 check (hot_work_lel_max between 0 and 25),
  h2s_max numeric(6,1) not null default 10 check (h2s_max between 0 and 100),
  co_max numeric(6,1) not null default 35 check (co_max between 0 and 200),
  -- A test older than this no longer counts for issuing, resuming or signing someone in.
  gas_test_valid_minutes integer not null default 60 check (gas_test_valid_minutes between 5 and 480),
  -- OSHA 1910.252 asks for at least 30 minutes; NFPA 51B (2019) asks for 60.
  fire_watch_minutes integer not null default 60 check (fire_watch_minutes between 30 and 240),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint forge_permit_settings_o2 check (o2_min < o2_max)
);

-- ---------------------------------------------------------------------------
-- Numbering: CSE-2026-0001, HW-2026-0001, WAH-2026-0001, EEW-2026-0001 (per company, type and year)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_permit_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_type text not null check (permit_type in ('confined_space', 'hot_work', 'heights', 'electrical')),
  seq_year integer not null,
  next_value integer not null default 1,
  primary key (organization_id, permit_type, seq_year)
);

create or replace function public.forge_permit_prefix(p_type text)
returns text
language sql
immutable
as $$
  select case p_type when 'confined_space' then 'CSE' when 'hot_work' then 'HW' when 'heights' then 'WAH' when 'electrical' then 'EEW' end
$$;

create or replace function public.next_forge_permit_number(p_organization_id uuid, p_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_number integer;
begin
  if public.forge_permit_prefix(p_type) is null then
    raise exception 'Unknown permit type.' using errcode = '22023';
  end if;

  insert into public.forge_permit_sequences (organization_id, permit_type, seq_year, next_value)
  values (p_organization_id, p_type, v_year, 2)
  on conflict (organization_id, permit_type, seq_year)
  do update set next_value = public.forge_permit_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return public.forge_permit_prefix(p_type) || '-' || v_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public.next_forge_permit_number(uuid, text) from public, anon, authenticated;
grant execute on function public.next_forge_permit_number(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Confined space register
-- ---------------------------------------------------------------------------

create table if not exists public.forge_confined_spaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  space_code text check (space_code is null or char_length(btrim(space_code)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  permit_required boolean not null default true,
  hazards text[] not null default '{}'
    check (hazards <@ array['oxygen_deficiency', 'oxygen_enrichment', 'flammable', 'toxic', 'engulfment', 'entrapment', 'mechanical', 'electrical', 'thermal', 'other']::text[]),
  entry_points text check (entry_points is null or char_length(entry_points) <= 2000),
  isolation_notes text check (isolation_notes is null or char_length(isolation_notes) <= 5000),
  rescue_plan text check (rescue_plan is null or char_length(rescue_plan) <= 5000),
  last_evaluated_on date,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_confined_spaces_code_idx on public.forge_confined_spaces (organization_id, lower(space_code)) where space_code is not null;
create index if not exists forge_confined_spaces_location_idx on public.forge_confined_spaces (organization_id, location_id);

-- ---------------------------------------------------------------------------
-- Permits
-- ---------------------------------------------------------------------------

create table if not exists public.forge_permits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_number text not null check (permit_number ~ '^(CSE|HW|WAH|EEW)-[0-9]{4}-[0-9]{4,}$'),
  permit_type text not null check (permit_type in ('confined_space', 'hot_work', 'heights', 'electrical')),
  location_id uuid not null references public.locations(id) on delete restrict,
  space_id uuid references public.forge_confined_spaces(id) on delete restrict,
  asset_id uuid references public.forge_assets(id) on delete set null,
  contractor_company_id uuid references public.forge_contractor_companies(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  work_description text not null check (char_length(btrim(work_description)) between 1 and 5000),
  work_area text check (work_area is null or char_length(work_area) <= 300),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'requested', 'approved', 'active', 'suspended', 'closed', 'canceled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approval_note text check (approval_note is null or char_length(approval_note) <= 2000),
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 2000),
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  suspended_at timestamptz,
  suspend_reason text check (suspend_reason is null or char_length(suspend_reason) <= 2000),
  work_completed_by uuid references auth.users(id) on delete set null,
  work_completed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  close_note text check (close_note is null or char_length(close_note) <= 2000),
  canceled_by uuid references auth.users(id) on delete set null,
  canceled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_permits_number_unique unique (organization_id, permit_number),
  constraint forge_permits_window check (valid_until > valid_from),
  constraint forge_permits_space check ((permit_type = 'confined_space') = (space_id is not null)),
  constraint forge_permits_prefix check (split_part(permit_number, '-', 1) = public.forge_permit_prefix(permit_type)),
  constraint forge_permits_requested check (status = 'draft' or status = 'canceled' or requested_at is not null),
  constraint forge_permits_approved check ((approved_at is not null) = (status in ('approved', 'active', 'suspended', 'closed') or (status = 'canceled' and approved_at is not null))),
  constraint forge_permits_issued check ((issued_at is not null) = (status in ('active', 'suspended', 'closed'))),
  constraint forge_permits_suspended check ((status = 'suspended') = (suspended_at is not null and suspend_reason is not null)),
  constraint forge_permits_closed check ((status = 'closed') = (closed_at is not null)),
  constraint forge_permits_canceled check ((status = 'canceled') = (canceled_at is not null and cancel_reason is not null)),
  constraint forge_permits_work_done check (work_completed_at is null or permit_type = 'hot_work')
);

create index if not exists forge_permits_org_status_idx on public.forge_permits (organization_id, permit_type, status);
create index if not exists forge_permits_location_idx on public.forge_permits (organization_id, location_id);
create index if not exists forge_permits_space_idx on public.forge_permits (space_id) where space_id is not null;
create index if not exists forge_permits_open_idx on public.forge_permits (organization_id, valid_until) where status in ('approved', 'active', 'suspended');

-- ---------------------------------------------------------------------------
-- Checklists: built-in items (organization_id null) plus a company's own, and each permit's answers
-- ---------------------------------------------------------------------------

create table if not exists public.forge_permit_check_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  permit_type text not null check (permit_type in ('confined_space', 'hot_work', 'heights', 'electrical')),
  check_key text not null check (check_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  label text not null check (char_length(btrim(label)) between 1 and 300),
  required boolean not null default true,
  allow_na boolean not null default false,
  sort_order integer not null default 100,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists forge_permit_check_definitions_builtin_idx
  on public.forge_permit_check_definitions (permit_type, check_key) where organization_id is null;
create unique index if not exists forge_permit_check_definitions_org_idx
  on public.forge_permit_check_definitions (organization_id, permit_type, check_key) where organization_id is not null;

insert into public.forge_permit_check_definitions (organization_id, permit_type, check_key, label, required, allow_na, sort_order)
select null, v.permit_type, v.check_key, v.label, true, v.allow_na, v.sort_order
from (values
  ('confined_space', 'hazards_reviewed', 'Hazards of the space reviewed with everyone on the permit', false, 10),
  ('confined_space', 'isolation_complete', 'Energy and lines isolated (lockout, blanking, blinding or disconnecting)', true, 20),
  ('confined_space', 'purged_ventilated', 'Space purged, flushed or ventilated before entry', true, 30),
  ('confined_space', 'continuous_ventilation', 'Ventilation keeps running during entry', true, 40),
  ('confined_space', 'rescue_available', 'Rescue service is available and can respond in time', false, 50),
  ('confined_space', 'communication', 'Attendant and entrants can communicate', false, 60),
  ('confined_space', 'retrieval_equipment', 'Retrieval system or harness in place for vertical entries', true, 70),
  ('confined_space', 'ppe_provided', 'Required PPE provided and checked', false, 80),
  ('confined_space', 'safe_lighting', 'Lighting and tools suitable for the atmosphere', true, 90),
  ('confined_space', 'barriers_posted', 'Barriers and signs keep others out of the entry', false, 100),
  ('hot_work', 'combustibles_cleared', 'Combustibles within 35 ft moved away or protected', false, 10),
  ('hot_work', 'floors_swept', 'Floors swept clean; combustible floors wet down or covered', false, 20),
  ('hot_work', 'openings_covered', 'Floor and wall openings within 35 ft covered', true, 30),
  ('hot_work', 'walls_ceilings_protected', 'Combustible walls, ceilings or roofs protected', true, 40),
  ('hot_work', 'ducts_conveyors_protected', 'Ducts and conveyors that could carry sparks shut down or protected', true, 50),
  ('hot_work', 'sprinklers_in_service', 'Sprinklers and fire detection in service', true, 60),
  ('hot_work', 'extinguisher_ready', 'Suitable fire extinguisher or hose ready at the work', false, 70),
  ('hot_work', 'equipment_checked', 'Welding, cutting or grinding equipment in good repair', false, 80),
  ('hot_work', 'containers_cleaned', 'Containers and piping cleaned and purged of flammables', true, 90),
  ('heights', 'fall_hazards_assessed', 'Fall hazards and leading edges assessed', false, 10),
  ('heights', 'anchorage_rated', 'Anchorage rated for 5,000 lb per person or designed by a qualified person', true, 20),
  ('heights', 'equipment_inspected', 'Harness, lanyard, lifeline or SRL inspected before use', true, 30),
  ('heights', 'clearance_checked', 'Fall clearance checked for the system in use', true, 40),
  ('heights', 'rescue_ready', 'Rescue plan in place and rescue equipment at the work', false, 50),
  ('heights', 'area_below_protected', 'Area below barricaded or protected from falling objects', false, 60),
  ('heights', 'access_inspected', 'Ladders, scaffolds or aerial lifts inspected', true, 70),
  ('heights', 'weather_ok', 'Weather and wind acceptable for the work', true, 80),
  ('electrical', 'deenergizing_infeasible', 'De-energizing confirmed infeasible or a greater hazard, and documented', false, 10),
  ('electrical', 'shock_assessment', 'Shock risk assessment done and approach boundaries set', false, 20),
  ('electrical', 'arc_flash_assessment', 'Arc flash risk assessment done and arc flash boundary set', false, 30),
  ('electrical', 'ppe_selected', 'Arc-rated clothing and PPE selected, inspected and worn', false, 40),
  ('electrical', 'insulated_tools', 'Insulated tools and test equipment rated for the voltage', false, 50),
  ('electrical', 'boundaries_marked', 'Boundaries marked; unqualified people kept out', false, 60),
  ('electrical', 'job_briefing', 'Job briefing held with everyone on the permit', false, 70)
) as v(permit_type, check_key, label, allow_na, sort_order)
on conflict (permit_type, check_key) where organization_id is null do update
set label = excluded.label, allow_na = excluded.allow_na, sort_order = excluded.sort_order;

create table if not exists public.forge_permit_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid not null references public.forge_permits(id) on delete cascade,
  check_key text not null,
  answer text not null check (answer in ('yes', 'no', 'na')),
  note text check (note is null or char_length(note) <= 1000),
  answered_by uuid references auth.users(id) on delete set null,
  answered_at timestamptz not null default now(),
  constraint forge_permit_checks_unique unique (permit_id, check_key),
  constraint forge_permit_checks_na_note check (answer <> 'na' or (note is not null and char_length(btrim(note)) > 0))
);

-- ---------------------------------------------------------------------------
-- People on a permit (company personnel or contractor workers)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_permit_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid not null references public.forge_permits(id) on delete cascade,
  role text not null check (role in ('entry_supervisor', 'attendant', 'entrant', 'rescuer', 'hot_work_operator', 'fire_watch', 'worker', 'competent_person', 'qualified_person', 'safety_watch')),
  personnel_id uuid references public.forge_personnel(id) on delete restrict,
  contractor_worker_id uuid references public.forge_contractor_workers(id) on delete restrict,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  constraint forge_permit_people_one_person check ((personnel_id is null) <> (contractor_worker_id is null))
);

create unique index if not exists forge_permit_people_personnel_idx
  on public.forge_permit_people (permit_id, role, personnel_id) where removed_at is null and personnel_id is not null;
create unique index if not exists forge_permit_people_worker_idx
  on public.forge_permit_people (permit_id, role, contractor_worker_id) where removed_at is null and contractor_worker_id is not null;
create index if not exists forge_permit_people_permit_idx on public.forge_permit_people (permit_id);

-- Which roles each type may use
create or replace function public.forge_permit_role_allowed(p_type text, p_role text)
returns boolean
language sql
immutable
as $$
  select case p_type
    when 'confined_space' then p_role in ('entry_supervisor', 'attendant', 'entrant', 'rescuer')
    when 'hot_work' then p_role in ('hot_work_operator', 'fire_watch')
    when 'heights' then p_role in ('worker', 'competent_person', 'rescuer')
    when 'electrical' then p_role in ('qualified_person', 'safety_watch')
    else false
  end
$$;

-- Training the company requires for a role on a permit type
create table if not exists public.forge_permit_training_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_type text not null check (permit_type in ('confined_space', 'hot_work', 'heights', 'electrical')),
  role text not null,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_permit_training_requirements_unique unique (organization_id, permit_type, role, course_id),
  constraint forge_permit_training_requirements_role check (public.forge_permit_role_allowed(permit_type, role))
);

-- ---------------------------------------------------------------------------
-- Gas tests (append-only) and the confined space entry log
-- ---------------------------------------------------------------------------

create table if not exists public.forge_permit_gas_tests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid not null references public.forge_permits(id) on delete cascade,
  tested_at timestamptz not null default clock_timestamp(),
  tested_by uuid references auth.users(id) on delete set null,
  instrument text check (instrument is null or char_length(instrument) <= 200),
  bump_tested boolean not null default false,
  test_point text check (test_point is null or char_length(test_point) <= 200),
  o2_pct numeric(4,1) check (o2_pct is null or o2_pct between 0 and 100),
  lel_pct numeric(4,1) check (lel_pct is null or lel_pct between 0 and 100),
  h2s_ppm numeric(7,1) check (h2s_ppm is null or h2s_ppm between 0 and 10000),
  co_ppm numeric(7,1) check (co_ppm is null or co_ppm between 0 and 10000),
  other_gas text check (other_gas is null or char_length(other_gas) <= 80),
  other_value numeric(9,2),
  other_limit numeric(9,2),
  passed boolean not null,
  problems text[] not null default '{}',
  note text check (note is null or char_length(note) <= 1000),
  constraint forge_permit_gas_tests_other check ((other_gas is null) = (other_value is null) and (other_limit is null or other_gas is not null))
);

create index if not exists forge_permit_gas_tests_permit_idx on public.forge_permit_gas_tests (permit_id, tested_at desc);

create table if not exists public.forge_permit_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid not null references public.forge_permits(id) on delete cascade,
  person_id uuid not null references public.forge_permit_people(id) on delete restrict,
  entered_at timestamptz not null default clock_timestamp(),
  entered_recorded_by uuid references auth.users(id) on delete set null,
  exited_at timestamptz,
  exited_recorded_by uuid references auth.users(id) on delete set null,
  constraint forge_permit_entries_order check (exited_at is null or exited_at >= entered_at)
);

create unique index if not exists forge_permit_entries_inside_idx on public.forge_permit_entries (person_id) where exited_at is null;
create index if not exists forge_permit_entries_permit_idx on public.forge_permit_entries (permit_id, entered_at);

-- ---------------------------------------------------------------------------
-- Links (LOTO procedures, controlled documents), activity history, notice log
-- ---------------------------------------------------------------------------

create table if not exists public.forge_permit_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid not null references public.forge_permits(id) on delete cascade,
  loto_procedure_id uuid references public.forge_loto_procedures(id) on delete cascade,
  document_id uuid references public.forge_documents(id) on delete cascade,
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  constraint forge_permit_links_one check ((loto_procedure_id is null) <> (document_id is null))
);

create unique index if not exists forge_permit_links_loto_idx on public.forge_permit_links (permit_id, loto_procedure_id) where loto_procedure_id is not null;
create unique index if not exists forge_permit_links_document_idx on public.forge_permit_links (permit_id, document_id) where document_id is not null;

create table if not exists public.forge_permit_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid references public.forge_permits(id) on delete cascade,
  space_id uuid references public.forge_confined_spaces(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 60),
  detail text check (detail is null or char_length(detail) <= 2000),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint forge_permit_activity_target check (permit_id is not null or space_id is not null)
);

create index if not exists forge_permit_activity_permit_idx on public.forge_permit_activity (permit_id, created_at) where permit_id is not null;
create index if not exists forge_permit_activity_space_idx on public.forge_permit_activity (space_id, created_at) where space_id is not null;

create table if not exists public.forge_permit_notice_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permit_id uuid not null references public.forge_permits(id) on delete cascade,
  kind text not null check (kind in ('expiring', 'expired', 'fire_watch_done', 'gas_retest_due')),
  window_key text not null,
  sent_at timestamptz not null default now(),
  constraint forge_permit_notice_log_unique unique (permit_id, kind, window_key)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.forge_permit_settings_for(p_organization_id uuid)
returns public.forge_permit_settings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.forge_permit_settings;
begin
  select * into v from public.forge_permit_settings where organization_id = p_organization_id;
  if not found then
    v := row(p_organization_id, false, true, 12, 12, 12, 12, 19.5, 23.5, 10, 10, 10, 35, 60, 60, null, now())::public.forge_permit_settings;
  end if;
  return v;
end;
$$;

create or replace function public.forge_permit_max_hours(s public.forge_permit_settings, p_type text)
returns integer
language sql
immutable
as $$
  select case p_type
    when 'confined_space' then s.confined_space_max_hours
    when 'hot_work' then s.hot_work_max_hours
    when 'heights' then s.heights_max_hours
    else s.electrical_max_hours
  end
$$;

-- What is missing from a permit's type-specific details (null when complete). Mirrors forgePermitRules.detailsProblems.
create or replace function public.forge_permit_details_problem(p_type text, d jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_text text;
  v_num numeric;
  v_fp text[];
begin
  if p_type = 'confined_space' then
    if coalesce(btrim(d->>'rescue_service'), '') = '' then return 'Name the rescue service for this entry.'; end if;
    if coalesce(btrim(d->>'communication'), '') = '' then return 'Say how the attendant and entrants will communicate.'; end if;
    if d ? 'entry_type' and d->>'entry_type' not in ('horizontal', 'vertical') then return 'Entry type must be horizontal or vertical.'; end if;
  elsif p_type = 'hot_work' then
    if coalesce(d->>'work_type', '') not in ('welding', 'cutting', 'brazing', 'soldering', 'grinding', 'torch', 'other') then
      return 'Pick the kind of hot work.';
    end if;
    if jsonb_typeof(d->'gas_test_required') is distinct from 'boolean' then return 'Say whether a gas test is needed before the work.'; end if;
  elsif p_type = 'heights' then
    begin
      v_num := (d->>'working_height_ft')::numeric;
    exception when others then
      v_num := null;
    end;
    if v_num is null or v_num <= 0 or v_num > 2000 then return 'Enter the working height in feet.'; end if;
    if jsonb_typeof(d->'fall_protection') is distinct from 'array' or jsonb_array_length(d->'fall_protection') = 0 then
      return 'Pick at least one fall protection method.';
    end if;
    select array_agg(x) into v_fp from jsonb_array_elements_text(d->'fall_protection') x;
    if not v_fp <@ array['guardrail', 'personal_fall_arrest', 'travel_restraint', 'positioning', 'safety_net', 'aerial_lift', 'scaffold', 'ladder']::text[] then
      return 'Unknown fall protection method.';
    end if;
    if v_fp && array['personal_fall_arrest', 'travel_restraint', 'positioning']::text[] and coalesce(btrim(d->>'anchorage'), '') = '' then
      return 'Describe the anchorage for the personal fall protection.';
    end if;
    if coalesce(btrim(d->>'rescue_plan'), '') = '' then return 'Write the rescue plan for a fallen worker.'; end if;
  elsif p_type = 'electrical' then
    begin
      v_num := (d->>'voltage')::numeric;
    exception when others then
      v_num := null;
    end;
    if v_num is null or v_num <= 0 then return 'Enter the voltage of the exposed parts.'; end if;
    if coalesce(d->>'justification', '') not in ('infeasible', 'greater_hazard') then return 'Say why the work must be done energized.'; end if;
    if coalesce(btrim(d->>'justification_detail'), '') = '' then return 'Explain why the equipment cannot be de-energized.'; end if;
    if coalesce(btrim(d->>'equipment'), '') = '' then return 'Name the equipment being worked on.'; end if;
    if coalesce(btrim(d->>'limited_approach'), '') = '' or coalesce(btrim(d->>'restricted_approach'), '') = '' then
      return 'Enter the limited and restricted approach boundaries.';
    end if;
    if coalesce(btrim(d->>'arc_flash_boundary'), '') = '' then return 'Enter the arc flash boundary.'; end if;
    v_text := coalesce(d->>'incident_energy', '') || coalesce(d->>'ppe_category', '');
    if v_text = '' then return 'Enter the incident energy or the PPE category.'; end if;
    if d ? 'ppe_category' and coalesce(d->>'ppe_category', '') not in ('', '1', '2', '3', '4') then return 'PPE category must be 1 to 4.'; end if;
    if coalesce(btrim(d->>'ppe'), '') = '' then return 'List the PPE required.'; end if;
  end if;
  return null;
end;
$$;

-- Who is missing from a permit (null when the required roles are filled)
create or replace function public.forge_permit_people_problem(p_permit public.forge_permits)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_roles text[];
  v_clash boolean;
begin
  select coalesce(array_agg(distinct role), '{}') into v_roles
  from public.forge_permit_people where permit_id = p_permit.id and removed_at is null;

  if p_permit.permit_type = 'confined_space' then
    if not ('entry_supervisor' = any (v_roles)) then return 'Add an entry supervisor.'; end if;
    if not ('attendant' = any (v_roles)) then return 'Add an attendant.'; end if;
    if not ('entrant' = any (v_roles)) then return 'Add at least one entrant.'; end if;
    -- The attendant stays outside: nobody is both attendant and entrant.
    select exists (
      select 1 from public.forge_permit_people a join public.forge_permit_people e
        on e.permit_id = a.permit_id and e.role = 'entrant' and e.removed_at is null
       and (e.personnel_id = a.personnel_id or e.contractor_worker_id = a.contractor_worker_id)
      where a.permit_id = p_permit.id and a.role = 'attendant' and a.removed_at is null
    ) into v_clash;
    if v_clash then return 'The attendant can''t also be an entrant.'; end if;
  elsif p_permit.permit_type = 'hot_work' then
    if not ('hot_work_operator' = any (v_roles)) then return 'Add the person doing the hot work.'; end if;
    if not ('fire_watch' = any (v_roles)) then return 'Add a fire watch.'; end if;
    select exists (
      select 1 from public.forge_permit_people a join public.forge_permit_people e
        on e.permit_id = a.permit_id and e.role = 'hot_work_operator' and e.removed_at is null
       and (e.personnel_id = a.personnel_id or e.contractor_worker_id = a.contractor_worker_id)
      where a.permit_id = p_permit.id and a.role = 'fire_watch' and a.removed_at is null
    ) into v_clash;
    if v_clash then return 'The fire watch can''t also do the hot work.'; end if;
  elsif p_permit.permit_type = 'heights' then
    if not ('worker' = any (v_roles)) then return 'Add at least one worker.'; end if;
    if not ('competent_person' = any (v_roles)) then return 'Add a competent person.'; end if;
  elsif p_permit.permit_type = 'electrical' then
    if not ('qualified_person' = any (v_roles)) then return 'Add at least one qualified person.'; end if;
  end if;
  return null;
end;
$$;

-- People on the permit missing a required, current training completion. Contractor workers are not checked here.
create or replace function public.forge_permit_training_gaps(p_permit_id uuid)
returns table (person_row_id uuid, personnel_id uuid, person_name text, role text, course_id uuid, course_title text)
language sql
stable
security definer
set search_path = public
as $$
  select pp.id, pp.personnel_id, btrim(pe.first_name || ' ' || pe.last_name), pp.role, c.id, c.title
  from public.forge_permits p
  join public.forge_permit_people pp on pp.permit_id = p.id and pp.removed_at is null and pp.personnel_id is not null
  join public.forge_personnel pe on pe.id = pp.personnel_id
  join public.forge_permit_training_requirements r
    on r.organization_id = p.organization_id and r.permit_type = p.permit_type and r.role = pp.role
  join public.forge_training_courses c on c.id = r.course_id
  where p.id = p_permit_id
    and not exists (
      select 1 from public.forge_training_completions tc
      where tc.organization_id = p.organization_id
        and tc.personnel_id = pp.personnel_id
        and tc.course_id = r.course_id
        and tc.result in ('passed', 'completed')
        and tc.approval_status = 'approved'
        and tc.archived_at is null
        and (tc.expires_at is null or tc.expires_at >= current_date)
    )
$$;

create or replace function public.forge_permit_training_problem(p_permit public.forge_permits)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gap record;
begin
  if not (public.forge_permit_settings_for(p_permit.organization_id)).require_training then
    return null;
  end if;
  select * into v_gap from public.forge_permit_training_gaps(p_permit.id) limit 1;
  if found then
    return v_gap.person_name || ' has no current ' || v_gap.course_title || ' training.';
  end if;
  return null;
end;
$$;

-- Checklist problem (null when every required item is answered yes, or not applicable with a note where allowed)
create or replace function public.forge_permit_checks_problem(p_permit public.forge_permits)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_def record;
  v_answer public.forge_permit_checks;
begin
  for v_def in
    select d.* from public.forge_permit_check_definitions d
    where d.permit_type = p_permit.permit_type and d.archived_at is null and d.required
      and (d.organization_id is null or d.organization_id = p_permit.organization_id)
    order by d.sort_order, d.label
  loop
    select * into v_answer from public.forge_permit_checks where permit_id = p_permit.id and check_key = v_def.check_key;
    if not found then
      return 'Answer the checklist: ' || v_def.label || '.';
    end if;
    if v_answer.answer = 'no' then
      return 'Not ready: ' || v_def.label || '.';
    end if;
    if v_answer.answer = 'na' and not v_def.allow_na then
      return v_def.label || ' can''t be marked not applicable.';
    end if;
  end loop;
  return null;
end;
$$;

-- Whether a permit needs a passing gas test before issue, resume and entry
create or replace function public.forge_permit_needs_gas_test(p_permit public.forge_permits)
returns boolean
language sql
immutable
as $$
  select p_permit.permit_type = 'confined_space'
      or (p_permit.permit_type = 'hot_work' and coalesce((p_permit.details->>'gas_test_required')::boolean, false))
$$;

-- Gas test problem: the latest test must pass, be recent enough and (if given) be later than p_after
create or replace function public.forge_permit_gas_problem(p_permit public.forge_permits, p_after timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_test public.forge_permit_gas_tests;
  v_minutes integer := (public.forge_permit_settings_for(p_permit.organization_id)).gas_test_valid_minutes;
begin
  if not public.forge_permit_needs_gas_test(p_permit) then
    return null;
  end if;
  select * into v_test from public.forge_permit_gas_tests where permit_id = p_permit.id order by tested_at desc, id desc limit 1;
  if not found then
    return 'Record a gas test first.';
  end if;
  if not v_test.passed then
    return 'The last gas test failed. Ventilate and test again.';
  end if;
  if v_test.tested_at < now() - make_interval(mins => v_minutes) then
    return 'The last gas test is more than ' || v_minutes || ' minutes old. Test again.';
  end if;
  if p_after is not null and v_test.tested_at < p_after then
    return 'Test again after the suspension.';
  end if;
  return null;
end;
$$;

create or replace function public.forge_permit_log(p_permit public.forge_permits, p_action text, p_detail text, p_actor uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.forge_permit_activity (organization_id, permit_id, action, detail, actor_user_id)
  values (p_permit.organization_id, p_permit.id, p_action, p_detail, p_actor)
$$;

-- Load a permit for a workflow step, locked, and turn the workflow flag on for this transaction
create or replace function public.forge_permit_lock(p_organization_id uuid, p_permit_id uuid)
returns public.forge_permits
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.forge_permits;
begin
  select * into v from public.forge_permits where id = p_permit_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'Permit not found.' using errcode = 'P0002';
  end if;
  perform set_config('forge.permit_workflow', 'on', true);
  return v;
end;
$$;

-- Everything a permit needs before it can be requested or approved (null when ready)
create or replace function public.forge_permit_ready_problem(p public.forge_permits)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.forge_permit_settings := public.forge_permit_settings_for(p.organization_id);
  v_max integer := public.forge_permit_max_hours(v_settings, p.permit_type);
  v_space public.forge_confined_spaces;
  v_problem text;
begin
  if p.valid_until <= now() then
    return 'The valid-until time has passed. Change the times.';
  end if;
  if p.valid_until - p.valid_from > make_interval(hours => v_max) then
    return 'A permit of this type can be valid for at most ' || v_max || ' hours.';
  end if;
  if p.permit_type = 'confined_space' then
    select * into v_space from public.forge_confined_spaces where id = p.space_id;
    if v_space.archived_at is not null then return 'This space is archived.'; end if;
    if not v_space.permit_required then return 'This space is not a permit-required space.'; end if;
    if v_space.location_id <> p.location_id then return 'The space is at a different location.'; end if;
  end if;
  v_problem := public.forge_permit_details_problem(p.permit_type, p.details);
  if v_problem is not null then return v_problem; end if;
  return public.forge_permit_people_problem(p);
end;
$$;

-- ---------------------------------------------------------------------------
-- Workflow functions (service role only). Each raises a plain-language error the app shows as-is.
-- ---------------------------------------------------------------------------

create or replace function public.forge_permit_submit(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_problem text;
begin
  if p.status <> 'draft' then
    raise exception 'Only a draft permit can be sent for approval.' using errcode = 'P0001';
  end if;
  v_problem := public.forge_permit_ready_problem(p);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'requested', requested_by = p_actor_user_id, requested_at = now(),
      rejected_by = null, rejected_at = null, reject_reason = null, updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'submitted', null, p_actor_user_id);
end;
$$;

create or replace function public.forge_permit_withdraw(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
begin
  if p.status <> 'requested' then
    raise exception 'Only a permit waiting for approval can be withdrawn.' using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'draft', requested_at = null, requested_by = null, updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'withdrawn', null, p_actor_user_id);
end;
$$;

create or replace function public.forge_permit_approve(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_problem text;
begin
  if p.status <> 'requested' then
    raise exception 'Only a permit waiting for approval can be approved.' using errcode = 'P0001';
  end if;
  if p.requested_by = p_actor_user_id and not (public.forge_permit_settings_for(p_organization_id)).allow_self_approval then
    raise exception 'You requested this permit, so someone else must approve it.' using errcode = 'P0001';
  end if;
  v_problem := coalesce(public.forge_permit_ready_problem(p), public.forge_permit_training_problem(p));
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'approved', approved_by = p_actor_user_id, approved_at = now(), approval_note = nullif(btrim(coalesce(p_note, '')), ''),
      updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'approved', nullif(btrim(coalesce(p_note, '')), ''), p_actor_user_id);
end;
$$;

create or replace function public.forge_permit_reject(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p.status <> 'requested' then
    raise exception 'Only a permit waiting for approval can be sent back.' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the permit is being sent back.' using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'draft', requested_at = null, rejected_by = p_actor_user_id, rejected_at = now(), reject_reason = left(v_reason, 2000),
      updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'sent_back', left(v_reason, 2000), p_actor_user_id);
end;
$$;

-- Issue: the permit goes live at the work. Checklist, training, gas test and (confined space) attendant all needed.
create or replace function public.forge_permit_issue(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_problem text;
begin
  if p.status <> 'approved' then
    raise exception 'Only an approved permit can be issued.' using errcode = 'P0001';
  end if;
  if now() >= p.valid_until then
    raise exception 'This permit has expired. Cancel it and raise a new one.' using errcode = 'P0001';
  end if;
  if now() < p.valid_from - interval '1 hour' then
    raise exception 'This permit isn''t valid until %.', to_char(p.valid_from at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') using errcode = 'P0001';
  end if;
  v_problem := coalesce(
    public.forge_permit_people_problem(p),
    public.forge_permit_checks_problem(p),
    public.forge_permit_training_problem(p),
    public.forge_permit_gas_problem(p, null)
  );
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'active', issued_by = p_actor_user_id, issued_at = now(), updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'issued', null, p_actor_user_id);
end;
$$;

-- Anyone working under the permit may stop the work.
create or replace function public.forge_permit_suspend(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p.status <> 'active' then
    raise exception 'Only an active permit can be suspended.' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the work is being stopped.' using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'suspended', suspended_by = p_actor_user_id, suspended_at = clock_timestamp(), suspend_reason = left(v_reason, 2000),
      updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'suspended', left(v_reason, 2000), p_actor_user_id);
end;
$$;

create or replace function public.forge_permit_resume(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_problem text;
begin
  if p.status <> 'suspended' then
    raise exception 'Only a suspended permit can be resumed.' using errcode = 'P0001';
  end if;
  if now() >= p.valid_until then
    raise exception 'This permit has expired. Close it and raise a new one.' using errcode = 'P0001';
  end if;
  v_problem := coalesce(public.forge_permit_people_problem(p), public.forge_permit_training_problem(p), public.forge_permit_gas_problem(p, p.suspended_at));
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'active', suspended_by = null, suspended_at = null, suspend_reason = null, updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'resumed', null, p_actor_user_id);
end;
$$;

-- Hot work only: the work is finished and the fire watch period starts.
create or replace function public.forge_permit_complete_work(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_minutes integer := (public.forge_permit_settings_for(p_organization_id)).fire_watch_minutes;
begin
  if p.permit_type <> 'hot_work' then
    raise exception 'Only hot work has a fire watch period.' using errcode = 'P0001';
  end if;
  if p.status not in ('active', 'suspended') then
    raise exception 'Only an issued permit can be marked work complete.' using errcode = 'P0001';
  end if;
  if p.work_completed_at is not null then
    raise exception 'The work is already marked complete.' using errcode = 'P0001';
  end if;
  update public.forge_permits
  set work_completed_by = p_actor_user_id, work_completed_at = now(), updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'work_completed', 'Fire watch for ' || v_minutes || ' minutes.', p_actor_user_id);
  return now() + make_interval(mins => v_minutes);
end;
$$;

create or replace function public.forge_permit_close(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_minutes integer := (public.forge_permit_settings_for(p_organization_id)).fire_watch_minutes;
  v_inside integer;
begin
  if p.status not in ('active', 'suspended') then
    raise exception 'Only an issued permit can be closed.' using errcode = 'P0001';
  end if;
  if p.permit_type = 'confined_space' then
    select count(*) into v_inside from public.forge_permit_entries where permit_id = p.id and exited_at is null;
    if v_inside > 0 then
      raise exception '% still inside the space. Sign everyone out first.', case when v_inside = 1 then '1 person is' else v_inside || ' people are' end
        using errcode = 'P0001';
    end if;
  end if;
  if p.permit_type = 'hot_work' then
    if p.work_completed_at is null then
      raise exception 'Mark the work complete first; the fire watch then runs for % minutes.', v_minutes using errcode = 'P0001';
    end if;
    if now() < p.work_completed_at + make_interval(mins => v_minutes) then
      raise exception 'The fire watch runs until %. Close the permit after that.',
        to_char((p.work_completed_at + make_interval(mins => v_minutes)) at time zone 'UTC', 'HH24:MI "UTC"') using errcode = 'P0001';
    end if;
  end if;
  update public.forge_permits
  set status = 'closed', closed_by = p_actor_user_id, closed_at = now(), close_note = nullif(btrim(coalesce(p_note, '')), ''),
      suspended_at = null, suspended_by = null, suspend_reason = null, updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'closed', nullif(btrim(coalesce(p_note, '')), ''), p_actor_user_id);
end;
$$;

create or replace function public.forge_permit_cancel(p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p.status not in ('draft', 'requested', 'approved') then
    raise exception 'Only a permit that hasn''t been issued can be canceled. Close an issued permit instead.' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the permit is being canceled.' using errcode = 'P0001';
  end if;
  update public.forge_permits
  set status = 'canceled', canceled_by = p_actor_user_id, canceled_at = now(), cancel_reason = left(v_reason, 2000),
      updated_by = p_actor_user_id, updated_at = now()
  where id = p.id;
  perform public.forge_permit_log(p, 'canceled', left(v_reason, 2000), p_actor_user_id);
end;
$$;

-- Record a gas test. A failing test on an active permit suspends it at once.
create or replace function public.forge_permit_record_gas_test(
  p_organization_id uuid, p_permit_id uuid, p_actor_user_id uuid,
  p_o2 numeric, p_lel numeric, p_h2s numeric, p_co numeric,
  p_other_gas text, p_other_value numeric, p_other_limit numeric,
  p_instrument text, p_bump_tested boolean, p_test_point text, p_note text
)
returns public.forge_permit_gas_tests
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  s public.forge_permit_settings := public.forge_permit_settings_for(p_organization_id);
  v_lel_max numeric;
  v_problems text[] := '{}';
  v_row public.forge_permit_gas_tests;
begin
  if p.permit_type not in ('confined_space', 'hot_work') then
    raise exception 'Gas tests are recorded on confined space and hot work permits.' using errcode = 'P0001';
  end if;
  if p.status not in ('approved', 'active', 'suspended') then
    raise exception 'Gas tests are recorded once the permit is approved and until it is closed.' using errcode = 'P0001';
  end if;
  if p_o2 is null and p_lel is null and p_h2s is null and p_co is null and p_other_gas is null then
    raise exception 'Enter at least one reading.' using errcode = 'P0001';
  end if;
  if p.permit_type = 'confined_space' and (p_o2 is null or p_lel is null) then
    raise exception 'A confined space test needs oxygen and LEL readings.' using errcode = 'P0001';
  end if;
  if p.permit_type = 'hot_work' and p_lel is null then
    raise exception 'A hot work gas test needs an LEL reading.' using errcode = 'P0001';
  end if;
  v_lel_max := case when p.permit_type = 'hot_work' then s.hot_work_lel_max else s.lel_max end;

  if p_o2 is not null and p_o2 < s.o2_min then v_problems := v_problems || ('Oxygen ' || p_o2 || '% is below ' || s.o2_min || '%'); end if;
  if p_o2 is not null and p_o2 > s.o2_max then v_problems := v_problems || ('Oxygen ' || p_o2 || '% is above ' || s.o2_max || '%'); end if;
  if p_lel is not null and p_lel >= v_lel_max and not (v_lel_max = 0 and p_lel = 0) then
    v_problems := v_problems || ('LEL ' || p_lel || '% is at or above ' || v_lel_max || '%');
  end if;
  if p_h2s is not null and p_h2s >= s.h2s_max then v_problems := v_problems || ('H2S ' || p_h2s || ' ppm is at or above ' || s.h2s_max || ' ppm'); end if;
  if p_co is not null and p_co >= s.co_max then v_problems := v_problems || ('CO ' || p_co || ' ppm is at or above ' || s.co_max || ' ppm'); end if;
  if p_other_gas is not null and p_other_limit is not null and p_other_value >= p_other_limit then
    v_problems := v_problems || (p_other_gas || ' ' || p_other_value || ' is at or above ' || p_other_limit);
  end if;

  insert into public.forge_permit_gas_tests
    (organization_id, permit_id, tested_by, instrument, bump_tested, test_point, o2_pct, lel_pct, h2s_ppm, co_ppm,
     other_gas, other_value, other_limit, passed, problems, note)
  values
    (p_organization_id, p.id, p_actor_user_id, nullif(btrim(coalesce(p_instrument, '')), ''), coalesce(p_bump_tested, false),
     nullif(btrim(coalesce(p_test_point, '')), ''), p_o2, p_lel, p_h2s, p_co,
     nullif(btrim(coalesce(p_other_gas, '')), ''), case when nullif(btrim(coalesce(p_other_gas, '')), '') is null then null else p_other_value end,
     case when nullif(btrim(coalesce(p_other_gas, '')), '') is null then null else p_other_limit end,
     cardinality(v_problems) = 0, v_problems, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_row;

  perform public.forge_permit_log(p, case when v_row.passed then 'gas_test_passed' else 'gas_test_failed' end,
    case when v_row.passed then null else array_to_string(v_problems, '; ') end, p_actor_user_id);

  if not v_row.passed and p.status = 'active' then
    update public.forge_permits
    set status = 'suspended', suspended_by = p_actor_user_id, suspended_at = v_row.tested_at,
        suspend_reason = left('Gas test failed: ' || array_to_string(v_problems, '; '), 2000),
        updated_by = p_actor_user_id, updated_at = now()
    where id = p.id;
    perform public.forge_permit_log(p, 'suspended', 'Gas test failed. Get everyone out of the space.', p_actor_user_id);
  end if;

  return v_row;
end;
$$;

-- Confined space entry log
create or replace function public.forge_permit_sign_in(p_organization_id uuid, p_permit_id uuid, p_person_id uuid, p_actor_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
  v_person public.forge_permit_people;
  v_problem text;
  v_id uuid;
begin
  if p.permit_type <> 'confined_space' then
    raise exception 'Only confined space permits keep an entry log.' using errcode = 'P0001';
  end if;
  if p.status <> 'active' then
    raise exception 'Entry is only allowed while the permit is active.' using errcode = 'P0001';
  end if;
  if now() >= p.valid_until then
    raise exception 'This permit has expired. No one may enter.' using errcode = 'P0001';
  end if;
  select * into v_person from public.forge_permit_people where id = p_person_id and permit_id = p.id and removed_at is null;
  if not found or v_person.role <> 'entrant' then
    raise exception 'Only entrants named on the permit may enter.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.forge_permit_people where permit_id = p.id and role = 'attendant' and removed_at is null) then
    raise exception 'An attendant must be on the permit before anyone enters.' using errcode = 'P0001';
  end if;
  v_problem := public.forge_permit_gas_problem(p, null);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'P0001';
  end if;
  if exists (select 1 from public.forge_permit_entries where person_id = p_person_id and exited_at is null) then
    raise exception 'This entrant is already signed in.' using errcode = 'P0001';
  end if;
  insert into public.forge_permit_entries (organization_id, permit_id, person_id, entered_recorded_by)
  values (p_organization_id, p.id, p_person_id, p_actor_user_id)
  returning id into v_id;
  perform public.forge_permit_log(p, 'entered', null, p_actor_user_id);
  return v_id;
end;
$$;

-- Signing out is always allowed, even when the permit is suspended or expired.
create or replace function public.forge_permit_sign_out(p_organization_id uuid, p_permit_id uuid, p_person_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.forge_permits := public.forge_permit_lock(p_organization_id, p_permit_id);
begin
  update public.forge_permit_entries
  set exited_at = clock_timestamp(), exited_recorded_by = p_actor_user_id
  where permit_id = p.id and person_id = p_person_id and exited_at is null;
  if not found then
    raise exception 'This person isn''t signed in.' using errcode = 'P0001';
  end if;
  perform public.forge_permit_log(p, 'exited', null, p_actor_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_permits_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_workflow boolean := coalesce(current_setting('forge.permit_workflow', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.requested_at is not null or new.approved_at is not null or new.issued_at is not null
       or new.closed_at is not null or new.canceled_at is not null or new.work_completed_at is not null then
      raise exception 'A new permit starts as a draft.' using errcode = 'P0001';
    end if;
  else
    if new.organization_id <> old.organization_id or new.permit_number <> old.permit_number or new.permit_type <> old.permit_type
       or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'A permit''s number, type and company can''t change.' using errcode = 'P0001';
    end if;
    if old.status in ('closed', 'canceled') then
      raise exception 'This permit is % and can''t be changed.', old.status using errcode = 'P0001';
    end if;
    if not v_workflow and (
      new.status <> old.status
      or new.requested_by is distinct from old.requested_by or new.requested_at is distinct from old.requested_at
      or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or new.approval_note is distinct from old.approval_note
      or new.rejected_by is distinct from old.rejected_by or new.rejected_at is distinct from old.rejected_at
      or new.reject_reason is distinct from old.reject_reason
      or new.issued_by is distinct from old.issued_by or new.issued_at is distinct from old.issued_at
      or new.suspended_by is distinct from old.suspended_by or new.suspended_at is distinct from old.suspended_at
      or new.suspend_reason is distinct from old.suspend_reason
      or new.work_completed_by is distinct from old.work_completed_by or new.work_completed_at is distinct from old.work_completed_at
      or new.closed_by is distinct from old.closed_by or new.closed_at is distinct from old.closed_at or new.close_note is distinct from old.close_note
      or new.canceled_by is distinct from old.canceled_by or new.canceled_at is distinct from old.canceled_at
      or new.cancel_reason is distinct from old.cancel_reason
    ) then
      raise exception 'Permit status changes go through the permit workflow.' using errcode = 'P0001';
    end if;
    -- The permit's content is fixed once it leaves draft.
    if old.status <> 'draft' and (
      new.location_id <> old.location_id or new.space_id is distinct from old.space_id or new.asset_id is distinct from old.asset_id
      or new.contractor_company_id is distinct from old.contractor_company_id or new.title <> old.title
      or new.work_description <> old.work_description or new.work_area is distinct from old.work_area
      or new.valid_from <> old.valid_from or new.valid_until <> old.valid_until or new.details <> old.details
    ) then
      raise exception 'Only a draft permit can be edited. Withdraw it first.' using errcode = 'P0001';
    end if;
  end if;

  if not exists (select 1 from public.locations l where l.id = new.location_id and l.organization_id = new.organization_id) then
    raise exception 'Location not found.' using errcode = 'P0001';
  end if;
  if new.space_id is not null and not exists (
    select 1 from public.forge_confined_spaces s where s.id = new.space_id and s.organization_id = new.organization_id
  ) then
    raise exception 'Confined space not found.' using errcode = 'P0001';
  end if;
  if new.asset_id is not null and not exists (
    select 1 from public.forge_assets a where a.id = new.asset_id and a.organization_id = new.organization_id
  ) then
    raise exception 'Equipment not found.' using errcode = 'P0001';
  end if;
  if new.contractor_company_id is not null and not exists (
    select 1 from public.forge_contractor_companies c where c.id = new.contractor_company_id and c.organization_id = new.organization_id
  ) then
    raise exception 'Contractor not found.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_permits_guard on public.forge_permits;
create trigger forge_permits_guard before insert or update on public.forge_permits for each row execute function public.forge_permits_guard();

-- Deleting the organization cascades; pg_trigger_depth() > 0 means we're inside that cascade.
create or replace function public.forge_permits_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.status <> 'draft' then
    raise exception 'Only a draft permit can be deleted. Cancel it instead.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists forge_permits_delete_guard on public.forge_permits;
create trigger forge_permits_delete_guard before delete on public.forge_permits for each row execute function public.forge_permits_delete_guard();

-- Children: same company as the permit; frozen once the permit is closed or canceled.
create or replace function public.forge_permit_child_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_row record;
  v_permit public.forge_permits;
  v_workflow boolean := coalesce(current_setting('forge.permit_workflow', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    -- A cascade from deleting the permit or the company.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    v_row := old;
  else
    v_row := new;
  end if;

  select * into v_permit from public.forge_permits where id = v_row.permit_id;
  if not found then
    -- The permit itself is being deleted (cascade).
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_permit.organization_id <> v_row.organization_id then
    raise exception 'Permit not found.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.permit_id <> old.permit_id then
    raise exception 'Records can''t move between permits.' using errcode = 'P0001';
  end if;

  if tg_table_name = 'forge_permit_gas_tests' then
    if not v_workflow or tg_op <> 'INSERT' then
      raise exception 'Gas tests can''t be changed once recorded.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_table_name = 'forge_permit_entries' then
    if not v_workflow or tg_op = 'DELETE' then
      raise exception 'The entry log is kept through the sign-in and sign-out steps only.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if v_permit.status in ('closed', 'canceled') then
    raise exception 'This permit is % and can''t be changed.', v_permit.status using errcode = 'P0001';
  end if;

  if tg_table_name = 'forge_permit_checks' then
    if v_permit.status not in ('draft', 'requested', 'approved') then
      raise exception 'The checklist is fixed once the permit is issued.' using errcode = 'P0001';
    end if;
    if tg_op <> 'DELETE' and not exists (
      select 1 from public.forge_permit_check_definitions d
      where d.permit_type = v_permit.permit_type and d.check_key = new.check_key and d.archived_at is null
        and (d.organization_id is null or d.organization_id = v_permit.organization_id)
    ) then
      raise exception 'Unknown checklist item.' using errcode = 'P0001';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'forge_permit_people' then
    if tg_op = 'DELETE' then
      if v_permit.status <> 'draft' then
        raise exception 'Remove people from the permit instead of deleting them.' using errcode = 'P0001';
      end if;
      return old;
    end if;
    if not public.forge_permit_role_allowed(v_permit.permit_type, new.role) then
      raise exception 'That role isn''t used on this kind of permit.' using errcode = 'P0001';
    end if;
    if new.personnel_id is not null and not exists (
      select 1 from public.forge_personnel pe
      where pe.id = new.personnel_id and pe.organization_id = new.organization_id and pe.archived_at is null and pe.employment_status = 'active'
    ) and tg_op = 'INSERT' then
      raise exception 'Person not found or not active.' using errcode = 'P0001';
    end if;
    if new.contractor_worker_id is not null and not exists (
      select 1 from public.forge_contractor_workers w
      where w.id = new.contractor_worker_id and w.organization_id = new.organization_id and w.archived_at is null and w.active
    ) and tg_op = 'INSERT' then
      raise exception 'Contractor worker not found or not active.' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then
      if new.role <> old.role or new.personnel_id is distinct from old.personnel_id
         or new.contractor_worker_id is distinct from old.contractor_worker_id or old.removed_at is not null then
        raise exception 'Remove the person and add them again instead.' using errcode = 'P0001';
      end if;
      if new.removed_at is not null and exists (
        select 1 from public.forge_permit_entries e where e.person_id = new.id and e.exited_at is null
      ) then
        raise exception 'Sign this person out of the space before removing them.' using errcode = 'P0001';
      end if;
      if new.removed_at is not null and new.role = 'attendant' and exists (
        select 1 from public.forge_permit_entries e where e.permit_id = new.permit_id and e.exited_at is null
      ) and not exists (
        select 1 from public.forge_permit_people a
        where a.permit_id = new.permit_id and a.role = 'attendant' and a.removed_at is null and a.id <> new.id
      ) then
        raise exception 'Add another attendant before removing the last one while people are inside.' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- forge_permit_links
  if tg_op = 'INSERT' then
    if new.loto_procedure_id is not null and not exists (
      select 1 from public.forge_loto_procedures l where l.id = new.loto_procedure_id and l.organization_id = new.organization_id
    ) then
      raise exception 'Lockout procedure not found.' using errcode = 'P0001';
    end if;
    if new.document_id is not null and not exists (
      select 1 from public.forge_documents d where d.id = new.document_id and d.organization_id = new.organization_id
    ) then
      raise exception 'Document not found.' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' then
    raise exception 'Remove the link and add it again instead.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists forge_permit_checks_guard on public.forge_permit_checks;
create trigger forge_permit_checks_guard before insert or update or delete on public.forge_permit_checks for each row execute function public.forge_permit_child_guard();
drop trigger if exists forge_permit_people_guard on public.forge_permit_people;
create trigger forge_permit_people_guard before insert or update or delete on public.forge_permit_people for each row execute function public.forge_permit_child_guard();
drop trigger if exists forge_permit_gas_tests_guard on public.forge_permit_gas_tests;
create trigger forge_permit_gas_tests_guard before insert or update or delete on public.forge_permit_gas_tests for each row execute function public.forge_permit_child_guard();
drop trigger if exists forge_permit_entries_guard on public.forge_permit_entries;
create trigger forge_permit_entries_guard before insert or update or delete on public.forge_permit_entries for each row execute function public.forge_permit_child_guard();
drop trigger if exists forge_permit_links_guard on public.forge_permit_links;
create trigger forge_permit_links_guard before insert or update or delete on public.forge_permit_links for each row execute function public.forge_permit_child_guard();

-- Activity is append-only.
create or replace function public.forge_permit_activity_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Permit history can''t be changed.' using errcode = 'P0001';
end;
$$;

drop trigger if exists forge_permit_activity_guard on public.forge_permit_activity;
create trigger forge_permit_activity_guard before update or delete on public.forge_permit_activity for each row execute function public.forge_permit_activity_guard();

-- A space keeps its company; one with open permits can't be archived or reclassified as non-permit.
create or replace function public.forge_confined_spaces_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.locations l where l.id = new.location_id and l.organization_id = new.organization_id) then
    raise exception 'Location not found.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'A space can''t move between companies.' using errcode = 'P0001';
    end if;
    if ((new.archived_at is not null and old.archived_at is null) or (old.permit_required and not new.permit_required) or new.location_id <> old.location_id)
       and exists (select 1 from public.forge_permits p where p.space_id = new.id and p.status in ('requested', 'approved', 'active', 'suspended')) then
      raise exception 'This space has open permits. Close or cancel them first.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists forge_confined_spaces_guard on public.forge_confined_spaces;
create trigger forge_confined_spaces_guard before insert or update on public.forge_confined_spaces for each row execute function public.forge_confined_spaces_guard();

-- ---------------------------------------------------------------------------
-- Access: server only
-- ---------------------------------------------------------------------------

alter table public.forge_permit_settings enable row level security;
alter table public.forge_permit_sequences enable row level security;
alter table public.forge_confined_spaces enable row level security;
alter table public.forge_permits enable row level security;
alter table public.forge_permit_check_definitions enable row level security;
alter table public.forge_permit_checks enable row level security;
alter table public.forge_permit_people enable row level security;
alter table public.forge_permit_training_requirements enable row level security;
alter table public.forge_permit_gas_tests enable row level security;
alter table public.forge_permit_entries enable row level security;
alter table public.forge_permit_links enable row level security;
alter table public.forge_permit_activity enable row level security;
alter table public.forge_permit_notice_log enable row level security;

revoke all on public.forge_permit_settings, public.forge_permit_sequences, public.forge_confined_spaces, public.forge_permits,
  public.forge_permit_check_definitions, public.forge_permit_checks, public.forge_permit_people, public.forge_permit_training_requirements,
  public.forge_permit_gas_tests, public.forge_permit_entries, public.forge_permit_links, public.forge_permit_activity, public.forge_permit_notice_log
  from anon, authenticated;

grant all on public.forge_permit_settings, public.forge_permit_sequences, public.forge_confined_spaces, public.forge_permits,
  public.forge_permit_check_definitions, public.forge_permit_checks, public.forge_permit_people, public.forge_permit_training_requirements,
  public.forge_permit_gas_tests, public.forge_permit_entries, public.forge_permit_links, public.forge_permit_activity, public.forge_permit_notice_log
  to service_role;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'forge_permit_settings_for(uuid)',
    'forge_permit_people_problem(public.forge_permits)',
    'forge_permit_training_gaps(uuid)',
    'forge_permit_training_problem(public.forge_permits)',
    'forge_permit_checks_problem(public.forge_permits)',
    'forge_permit_gas_problem(public.forge_permits, timestamptz)',
    'forge_permit_log(public.forge_permits, text, text, uuid)',
    'forge_permit_lock(uuid, uuid)',
    'forge_permit_ready_problem(public.forge_permits)',
    'forge_permit_submit(uuid, uuid, uuid)',
    'forge_permit_withdraw(uuid, uuid, uuid)',
    'forge_permit_approve(uuid, uuid, uuid, text)',
    'forge_permit_reject(uuid, uuid, uuid, text)',
    'forge_permit_issue(uuid, uuid, uuid)',
    'forge_permit_suspend(uuid, uuid, uuid, text)',
    'forge_permit_resume(uuid, uuid, uuid)',
    'forge_permit_complete_work(uuid, uuid, uuid)',
    'forge_permit_close(uuid, uuid, uuid, text)',
    'forge_permit_cancel(uuid, uuid, uuid, text)',
    'forge_permit_record_gas_test(uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, text, boolean, text, text)',
    'forge_permit_sign_in(uuid, uuid, uuid, uuid)',
    'forge_permit_sign_out(uuid, uuid, uuid, uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', v_fn);
    execute format('grant execute on function public.%s to service_role', v_fn);
  end loop;
end;
$$;

revoke all on function public.forge_permits_guard() from public, anon, authenticated;
revoke all on function public.forge_permit_child_guard() from public, anon, authenticated;
revoke all on function public.forge_confined_spaces_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('permits.view', 'work_permits', 'View Work Permits', 'See confined space, hot work, heights and electrical permits, the confined space register, gas tests and entry logs. Location scope sees its own locations.', 'Work Permits', 'view', true, true, 'organization', false, false, true, 'normal', 10),
  ('permits.request', 'work_permits', 'Request Work Permits', 'Raise and edit draft permits, name the people and answer the checklist, send for approval, record gas tests, sign entrants in and out, stop work, and close permits they requested.', 'Work Permits', 'request', true, true, 'organization', false, false, true, 'normal', 20),
  ('permits.approve', 'work_permits', 'Approve and Issue Work Permits', 'Approve or send back permits, issue them at the work, resume suspended work and close permits. Nobody approves a permit they requested unless settings allow it.', 'Work Permits', 'approve', true, true, 'organization', false, true, true, 'sensitive', 30),
  ('permits.manage', 'work_permits', 'Manage Work Permit Setup', 'Keep the confined space register, cancel permits, and set limits, checklists and training requirements.', 'Work Permits', 'manage', true, true, 'organization', false, true, true, 'sensitive', 40)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    requires_confirmation = excluded.requires_confirmation, is_sensitive = excluded.is_sensitive, danger_level = excluded.danger_level,
    sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, v.scope
from (values
  ('read-only', 'permits.view', 'organization'),
  ('standard-user', 'permits.view', 'location'),
  ('supervisor', 'permits.view', 'location'),
  ('supervisor', 'permits.request', 'location'),
  ('safety-manager', 'permits.view', 'organization'),
  ('safety-manager', 'permits.request', 'organization'),
  ('safety-manager', 'permits.approve', 'organization'),
  ('safety-manager', 'permits.manage', 'organization'),
  ('company-admin', 'permits.view', 'organization'),
  ('company-admin', 'permits.request', 'organization'),
  ('company-admin', 'permits.approve', 'organization'),
  ('company-admin', 'permits.manage', 'organization')
) as v(template_key, permission_key, scope)
join public.forge_role_templates rt on rt.template_key = v.template_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, v.scope
from (values
  ('read-only', 'permits.view', 'organization'),
  ('employee', 'permits.view', 'location'),
  ('supervisor', 'permits.view', 'location'),
  ('supervisor', 'permits.request', 'location'),
  ('location-administrator', 'permits.view', 'location'),
  ('location-administrator', 'permits.request', 'location'),
  ('location-administrator', 'permits.approve', 'location'),
  ('location-administrator', 'permits.manage', 'location'),
  ('company-administrator', 'permits.view', 'organization'),
  ('company-administrator', 'permits.request', 'organization'),
  ('company-administrator', 'permits.approve', 'organization'),
  ('company-administrator', 'permits.manage', 'organization'),
  ('company-owner', 'permits.view', 'organization'),
  ('company-owner', 'permits.request', 'organization'),
  ('company-owner', 'permits.approve', 'organization'),
  ('company-owner', 'permits.manage', 'organization')
) as v(role_key, permission_key, scope)
join public.forge_tenant_roles r on r.role_key = v.role_key
join public.forge_permission_registry p on p.permission_key = v.permission_key
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;
