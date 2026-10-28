-- =============================================================================
-- Demo plant: Cypress Bend Rice Mill — Risk & Prevention modules.
--   Observations (~3 months of plant-floor reporting, two anonymous)
--   Risk Register (tenant 5x5 matrix, inherent/residual scoring, controls, treatments, reviews)
--   JSAs (mill jobs with steps/hazards/controls/PPE, one revised lineage, crew executions)
-- Local development and sales-demo data only. Loaded after 10_cypress_bend_plant.sql.
--
-- Records are written the way the app writes them: inserted as draft (JSA inserts must be
-- draft, risk children are locked once a risk is closed, observation content is locked once
-- closed), then moved to their final state in one update together with the workflow
-- instance/events, module activity and record activity the lifecycle RPCs would have written.
-- Ids: 62000000-0000-4000-8000-xxxxxxxxxxxx.
--   000000000001 tenant matrix   0000000010NN observations   0000000011NN obs workflow
--   0000000020NN risks           00000021RRNN controls        00000022RRNN treatments
--   00000023RRNN reviews         0000000024NN risk workflow   0000000030NN JSAs
--   0000031JJSS0 steps           0000032JJSSH hazards         000033JJSSHC controls
--   00000034JJNN PPE             0000000035NN JSA revisions   0000000036NN JSA workflow
--   0000000040NN executions      00000041EENN participants    0000000050NN record links
--   0000000012NN anonymous reporters   0000070MNNSS workflow events (M: 1 obs, 2 risk, 3 JSA)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Session helpers (temporary; dropped at the end of this file)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.f62_id(p text) returns uuid
language sql immutable as $$ select ('62000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;

-- Person by roster number (0 = the seeded "Forge Demo User" personnel record).
create or replace function pg_temp.f62_p(nn integer) returns uuid
language sql immutable as $$
  select case when nn is null then null
              when nn = 0 then '20000000-0000-4000-8000-000000000600'::uuid
              else ('60000000-0000-4000-8000-0000000030' || lpad(nn::text, 2, '0'))::uuid end
$$;

-- Auth user: 'U' = demo user (user@forge2.local), anything else = admin (Company Owner).
create or replace function pg_temp.f62_u(code text) returns uuid
language sql immutable as $$
  select case when code is null then null
              when code = 'U' then '20000000-0000-4000-8000-000000000002'::uuid
              else '20000000-0000-4000-8000-000000000001'::uuid end
$$;

-- Plant-local (America/Chicago) wall-clock time, d days ago (negative d = in the future).
create or replace function pg_temp.f62_ts(d integer, t text) returns timestamptz
language sql stable as $$
  select ((date_trunc('day', now() at time zone 'America/Chicago') - make_interval(days => d))
          + t::interval) at time zone 'America/Chicago'
$$;

-- ---------------------------------------------------------------------------
-- Tenant risk matrix: what ensureTenantDefaultRiskMatrix() creates the first time a risk is
-- assessed or a JSA is created (clone of forge.core.5x5, activated as the tenant default).
-- ---------------------------------------------------------------------------
insert into public.forge_risk_matrices (
  id, organization_id, matrix_key, name, description, version, is_core, is_default, is_active,
  created_by, created_at, updated_at
)
select pg_temp.f62_id('1'), '20000000-0000-4000-8000-000000000100', 'tenant.default.5x5',
       'Organization Risk Matrix', c.description, 1, false, true, true,
       pg_temp.f62_u('A'), pg_temp.f62_ts(92, '09:12'), pg_temp.f62_ts(92, '09:12')
from public.forge_risk_matrices c
where c.organization_id is null and c.matrix_key = 'forge.core.5x5' and c.is_active
  and not exists (
    select 1 from public.forge_risk_matrices t
    where t.organization_id = '20000000-0000-4000-8000-000000000100'
      and (t.matrix_key = 'tenant.default.5x5' or (t.is_default and t.is_active))
  )
order by c.version desc
limit 1;

insert into public.forge_risk_likelihood_levels (risk_matrix_id, level_key, label, description, numeric_value, sort_order)
select pg_temp.f62_id('1'), l.level_key, l.label, l.description, l.numeric_value, l.sort_order
from public.forge_risk_likelihood_levels l
join public.forge_risk_matrices c on c.id = l.risk_matrix_id
where c.organization_id is null and c.matrix_key = 'forge.core.5x5' and c.version = 1
  and exists (select 1 from public.forge_risk_matrices where id = pg_temp.f62_id('1'))
  and not exists (select 1 from public.forge_risk_likelihood_levels where risk_matrix_id = pg_temp.f62_id('1'));

insert into public.forge_risk_severity_levels (risk_matrix_id, level_key, label, description, numeric_value, sort_order)
select pg_temp.f62_id('1'), s.level_key, s.label, s.description, s.numeric_value, s.sort_order
from public.forge_risk_severity_levels s
join public.forge_risk_matrices c on c.id = s.risk_matrix_id
where c.organization_id is null and c.matrix_key = 'forge.core.5x5' and c.version = 1
  and exists (select 1 from public.forge_risk_matrices where id = pg_temp.f62_id('1'))
  and not exists (select 1 from public.forge_risk_severity_levels where risk_matrix_id = pg_temp.f62_id('1'));

insert into public.forge_risk_bands (risk_matrix_id, band_key, label, description, sort_order, requires_review, requires_approval)
select pg_temp.f62_id('1'), b.band_key, b.label, b.description, b.sort_order, b.requires_review, b.requires_approval
from public.forge_risk_bands b
join public.forge_risk_matrices c on c.id = b.risk_matrix_id
where c.organization_id is null and c.matrix_key = 'forge.core.5x5' and c.version = 1
  and exists (select 1 from public.forge_risk_matrices where id = pg_temp.f62_id('1'))
  and not exists (select 1 from public.forge_risk_bands where risk_matrix_id = pg_temp.f62_id('1'));

insert into public.forge_risk_matrix_cells (risk_matrix_id, likelihood_level_id, severity_level_id, score, risk_band_id)
select pg_temp.f62_id('1'), tl.id, ts.id, cell.score, tb.id
from public.forge_risk_matrix_cells cell
join public.forge_risk_matrices c on c.id = cell.risk_matrix_id
join public.forge_risk_likelihood_levels cl on cl.id = cell.likelihood_level_id
join public.forge_risk_severity_levels cs on cs.id = cell.severity_level_id
join public.forge_risk_bands cb on cb.id = cell.risk_band_id
join public.forge_risk_likelihood_levels tl on tl.risk_matrix_id = pg_temp.f62_id('1') and tl.level_key = cl.level_key
join public.forge_risk_severity_levels ts on ts.risk_matrix_id = pg_temp.f62_id('1') and ts.level_key = cs.level_key
join public.forge_risk_bands tb on tb.risk_matrix_id = pg_temp.f62_id('1') and tb.band_key = cb.band_key
where c.organization_id is null and c.matrix_key = 'forge.core.5x5' and c.version = 1
  and not exists (select 1 from public.forge_risk_matrix_cells where risk_matrix_id = pg_temp.f62_id('1'));

-- Scoring against the tenant default matrix (same lookup the app's calculateRisk() does).
create or replace function pg_temp.f62_matrix() returns uuid
language sql stable as $$
  select id from public.forge_risk_matrices
  where organization_id = '20000000-0000-4000-8000-000000000100' and is_default and is_active
  order by version desc limit 1
$$;

create or replace function pg_temp.f62_matrix_version() returns integer
language sql stable as $$ select version from public.forge_risk_matrices where id = pg_temp.f62_matrix() $$;

create or replace function pg_temp.f62_score(lk text, sk text) returns integer
language sql stable as $$
  select c.score
  from public.forge_risk_matrix_cells c
  join public.forge_risk_likelihood_levels l on l.id = c.likelihood_level_id
  join public.forge_risk_severity_levels s on s.id = c.severity_level_id
  where c.risk_matrix_id = pg_temp.f62_matrix() and l.level_key = lk and s.level_key = sk
$$;

create or replace function pg_temp.f62_band(lk text, sk text) returns text
language sql stable as $$
  select b.band_key
  from public.forge_risk_matrix_cells c
  join public.forge_risk_likelihood_levels l on l.id = c.likelihood_level_id
  join public.forge_risk_severity_levels s on s.id = c.severity_level_id
  join public.forge_risk_bands b on b.id = c.risk_band_id
  where c.risk_matrix_id = pg_temp.f62_matrix() and l.level_key = lk and s.level_key = sk
$$;

-- =============================================================================
-- OBSERVATIONS
-- =============================================================================
insert into public.forge_observations (
  id, organization_id, observation_number, status, observation_type, category_key, work_area,
  title, description, occurred_at, reporting_mode, immediate_action, location_id, division_id,
  risk_matrix_id, risk_matrix_version, initial_likelihood_key, initial_severity_key,
  initial_risk_score, initial_risk_band_key, reported_by_user_id, reported_by_personnel_id,
  assigned_to_personnel_id, created_by, updated_by, created_at, updated_at
)
select
  pg_temp.f62_id('10' || lpad(v.n::text, 2, '0')),
  '20000000-0000-4000-8000-000000000100',
  'OBS-' || extract(year from v.created_at)::int || '-' || lpad(v.n::text, 6, '0'),
  'draft', v.otype, v.cat, v.area, v.title, v.descr, v.occurred_at, v.mode, v.immediate,
  '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200',
  case when v.lk is not null then pg_temp.f62_matrix() end,
  case when v.lk is not null then pg_temp.f62_matrix_version() end,
  v.lk, v.sk, pg_temp.f62_score(v.lk, v.sk), pg_temp.f62_band(v.lk, v.sk),
  case when v.mode = 'named' then pg_temp.f62_u(v.creator) end,
  case when v.mode = 'named' then pg_temp.f62_p(v.reporter) end,
  pg_temp.f62_p(v.assignee),
  pg_temp.f62_u(v.creator), pg_temp.f62_u(v.creator), v.created_at, v.created_at
from (values
  (1, 'UNSAFE', 'unsafe_condition', 'Milling - Hull grinder room, top of grinder motor',
   'Heavy layer of rice dust on top of hull grinder motor',
   'About 1/4 inch of fine hull dust has built up on top of the hull grinder motor and the conduit running to it. Motor housing was warm to the touch. This is above our housekeeping limit and could ignite.',
   pg_temp.f62_ts(86, '06:40'), pg_temp.f62_ts(86, '07:05'), 'named',
   'Vacuumed motor top with the approved dust vacuum at the end of the run. No blowing down.', 5, 'A', 2, 'possible', 'major'),
  (2, 'NEAR_MISS', 'near_miss', 'Shipping - Bag warehouse, dock door 3',
   'Forklift and pedestrian near miss at dock door 3',
   'Forklift backing out of trailer at door 3 with a full pallet of 50 lb bags came within about 3 feet of a packaging operator walking to the break room. Operator did not see the person; no horn used. Pedestrian walkway is not marked at this door.',
   pg_temp.f62_ts(82, '14:10'), pg_temp.f62_ts(82, '14:35'), 'named',
   'Stopped forklift traffic at door 3 for the rest of the shift change. Talked with both employees.', 20, 'A', 3, 'likely', 'major'),
  (3, 'SAFE', 'positive_recognition', 'Shipping - Rail loadout track 2',
   'Spotter used during rail car repositioning',
   'Curtis set up a spotter and blue flag before moving hopper cars with the car puller. Radio check done before every move and nobody stood between cars. Good example for the newer crew.',
   pg_temp.f62_ts(78, '10:20'), pg_temp.f62_ts(78, '10:25'), 'named', null, 4, 'A', 2, null, null),
  (4, 'UNSAFE', 'ppe', 'Milling - Whitener room, Line 2',
   'Operator in whitener room without hearing protection',
   'Observed an operator working at the Line 2 whiteners for about 10 minutes without ear plugs. The room is posted as hearing protection required. Operator said the dispenser at the east door was empty.',
   pg_temp.f62_ts(74, '13:30'), pg_temp.f62_ts(74, '13:35'), 'named',
   'Gave operator ear plugs from my kit and coached on the posting.', 2, 'A', 3, 'likely', 'moderate'),
  (5, 'UNSAFE', 'unsafe_condition', 'Drying & Storage - Bin 6 discharge screw conveyor',
   'Missing guard on screw conveyor tail section at Bin 6',
   'Tail-end guard is off the Bin 6 discharge screw conveyor. Rotating flight and shaft are exposed at knee height next to the walkway. Guard was found leaning against the wall; it looks like it was left off after the last bearing change.',
   pg_temp.f62_ts(69, '07:50'), pg_temp.f62_ts(69, '08:05'), 'named',
   'Conveyor locked out and barricaded until maintenance can reinstall the guard.', 13, 'A', 9, 'possible', 'catastrophic'),
  (6, 'NEAR_MISS', 'process_safety', 'Drying & Storage - Column Dryer 2',
   'Dryer 2 high-temperature alarm, plenum reached 230 F',
   'Night shift: Dryer 2 plenum temperature alarm at 02:15, peaked at 230 F before the burner tripped on high limit. Found heavy fines and hulls packed in the lower column screens. No fire, but this is how dryer fires start.',
   pg_temp.f62_ts(63, '02:15'), pg_temp.f62_ts(63, '07:20'), 'named',
   'Burner left off, dryer emptied and column inspected with a thermal camera before restart.', 15, 'A', 2, 'possible', 'major'),
  (7, 'UNSAFE', 'unsafe_act', 'Shipping - Bagging line 1 bagger',
   'Bagger jam cleared without lockout on second shift',
   'Saw a jam cleared on the bagger by reaching into the bag clamp area with the machine in stop but not locked out. This happens most nights when the line is behind. I do not want to name anyone, but it needs to stop before someone loses a hand.',
   pg_temp.f62_ts(58, '22:40'), pg_temp.f62_ts(57, '06:10'), 'anonymous', null, null, 'U', 4, 'possible', 'catastrophic'),
  (8, 'SAFE', 'housekeeping', 'Milling - Whitener floor',
   'Whitener floor left clean after screen change',
   'Brianna and the day crew changed screens on whitener 3 and left the floor swept, old screens bagged and tools put back on the shadow board. Area was ready for the next shift.',
   pg_temp.f62_ts(52, '15:30'), pg_temp.f62_ts(52, '15:35'), 'named', null, 3, 'A', 2, null, null),
  (9, 'UNSAFE', 'housekeeping', 'Drying & Storage - Bin 4 catwalk stairs',
   'Rough rice spilled on catwalk stairs to Bin 4',
   'Loose rough rice on the stairs and landing to the Bin 4 catwalk, enough to roll under a boot. Source looks like a leaking spout on the Bin 4 fill conveyor.',
   pg_temp.f62_ts(47, '09:10'), pg_temp.f62_ts(47, '09:20'), 'named',
   'Swept the stairs and set a wet floor sign at the bottom.', 14, 'A', 13, 'possible', 'minor'),
  (10, 'IMPROVEMENT', 'process_safety', 'Receiving - Belt conveyor B-3',
   'Add a second pull-cord stop switch on belt conveyor B-3',
   'B-3 runs about 140 feet and has one pull-cord switch at the head end. From the tail end you would have to walk the whole length to stop it. Recommend a second switch at the tail and cord along the full walkway side.',
   pg_temp.f62_ts(41, '11:00'), pg_temp.f62_ts(41, '11:15'), 'named', null, 10, 'A', 9, null, null),
  (11, 'UNSAFE', 'unsafe_condition', 'Receiving - Inbound truck scale',
   'Truck scale ramp guardrail bent',
   'Guardrail on the north side of the inbound scale ramp is bent outward, probably from a trailer tire. The top rail is loose on two posts. Drivers walk this ramp to the scale house window.',
   pg_temp.f62_ts(36, '16:20'), pg_temp.f62_ts(36, '16:35'), 'named', null, 22, 'A', 3, 'possible', 'moderate'),
  (12, 'NEAR_MISS', 'near_miss', 'Receiving - Elevator Leg 1 head platform',
   'Wrench dropped from elevator head platform',
   'While adjusting the head pulley take-up on Leg 1, a 15/16 wrench slid off the platform grating and fell about 60 feet to the drive-through below. No one was in the drive at the time. Toe board has a gap at the corner.',
   pg_temp.f62_ts(30, '10:05'), pg_temp.f62_ts(30, '10:25'), 'named',
   'Barricaded the drive-through under the leg until the job was finished.', 11, 'A', 9, 'unlikely', 'major'),
  (13, 'UNSAFE', 'environmental', 'Milling - Baghouse 2 roof',
   'Baghouse 2 discharge leaking dust onto roof',
   'Rotary airlock under Baghouse 2 is leaking fines onto the roof and into the gutter. Visible dust when the wind picks up. Could be an air permit issue and it adds to dust on the roof.',
   pg_temp.f62_ts(24, '13:50'), pg_temp.f62_ts(24, '14:05'), 'named', null, 12, 'A', 2, 'likely', 'minor'),
  (14, 'IMPROVEMENT', 'other', 'Shipping - Rail loadout',
   'Need shade and cold water at rail loadout',
   'Afternoons at the rail loadout are brutal. No shade on the car deck and the nearest water is in the warehouse. People are skipping breaks to keep the cars moving.',
   pg_temp.f62_ts(18, '15:45'), pg_temp.f62_ts(18, '16:00'), 'anonymous', null, null, 'U', 2, null, null),
  (15, 'SAFE', 'ppe', 'Drying & Storage - Bin 7 roof',
   'Contractor crew tied off on bin roof without prompting',
   'Roofing contractor crew working on the Bin 7 roof vents had harnesses on and were tied off to the ring anchor before stepping off the ladder cage. Their foreman did a toolbox talk before starting.',
   pg_temp.f62_ts(12, '11:30'), pg_temp.f62_ts(12, '11:40'), 'named', null, 24, 'A', 2, null, null),
  (16, 'UNSAFE', 'unsafe_act', 'Shipping - Bag warehouse',
   'Employee riding on forklift forks',
   'Observed an employee standing on the forks of a forklift to reach a torn bag on the top tier of a stack. Forklift raised him about 6 feet. Stopped the job.',
   pg_temp.f62_ts(7, '05:50'), pg_temp.f62_ts(7, '07:30'), 'named',
   'Stopped the job and brought the order picker over for the rest of the shift.', 4, 'A', 3, 'possible', 'major'),
  (17, 'UNSAFE', 'unsafe_condition', 'Quality & Lab - Sample prep room',
   'Emergency eyewash blocked by sample bags',
   'Eyewash station by the sample prep bench is blocked by a stack of retained sample bags. You would have to move about six bags to use it.',
   pg_temp.f62_ts(4, '10:15'), pg_temp.f62_ts(4, '10:25'), 'named',
   'Moved the bags off to the side for now.', 0, 'U', 2, 'possible', 'moderate'),
  (18, 'NEAR_MISS', 'near_miss', 'Shipping - Rail loadout car deck',
   'Rail car hatch lid slammed shut in wind',
   'Gust of wind caught an open hatch lid on a hopper car and slammed it shut while I was reaching to latch the next one. Missed my hand by a few inches.',
   pg_temp.f62_ts(2, '14:30'), pg_temp.f62_ts(2, '14:50'), 'named', null, 0, 'U', null, null, null)
) as v(n, otype, cat, area, title, descr, occurred_at, created_at, mode, immediate, reporter, creator, assignee, lk, sk);

-- Anonymous reporter identities (restricted table; same rows createObservation() writes).
insert into public.forge_observation_reporters (id, observation_id, organization_id, auth_user_id, personnel_id, created_at)
select pg_temp.f62_id('12' || lpad(o.n::text, 2, '0')), pg_temp.f62_id('10' || lpad(o.n::text, 2, '0')),
       '20000000-0000-4000-8000-000000000100', pg_temp.f62_u('U'), pg_temp.f62_p(0), ob.created_at
from (values (7), (14)) as o(n)
join public.forge_observations ob on ob.id = pg_temp.f62_id('10' || lpad(o.n::text, 2, '0'));

-- Observation lifecycle transitions (observations.lifecycle).
create temp table f62_obs_tx (n integer, seq integer, tkey text, at timestamptz, actor text, comment text);
insert into f62_obs_tx (n, seq, tkey, at, actor, comment) values
  (1, 1, 'submit', pg_temp.f62_ts(86, '07:06'), 'A', null),
  (1, 2, 'begin_review', pg_temp.f62_ts(85, '09:15'), 'A', null),
  (1, 3, 'require_action', pg_temp.f62_ts(85, '10:30'), 'A', 'Add motor tops in the hull grinder room to the high-level dust cleaning route.'),
  (1, 4, 'close_from_action', pg_temp.f62_ts(71, '14:20'), 'A', 'Motor tops and conduit runs in the hull grinder room added to the weekly high-level dust cleaning route. Tracked under the combustible dust risk.'),
  (2, 1, 'submit', pg_temp.f62_ts(82, '14:36'), 'A', null),
  (2, 2, 'begin_review', pg_temp.f62_ts(81, '08:00'), 'A', null),
  (2, 3, 'require_action', pg_temp.f62_ts(81, '08:40'), 'A', 'Raised to the risk register for forklift and pedestrian separation in the bag warehouse.'),
  (2, 4, 'close_from_action', pg_temp.f62_ts(50, '15:00'), 'A', 'Pedestrian walkway painted at doors 1-4, convex mirror installed at door 3 and blue spot lights fitted to all forklifts. Remaining work tracked on the linked risk.'),
  (3, 1, 'submit', pg_temp.f62_ts(78, '10:26'), 'A', null),
  (3, 2, 'begin_review', pg_temp.f62_ts(77, '09:00'), 'A', null),
  (3, 3, 'no_action', pg_temp.f62_ts(77, '09:05'), 'A', null),
  (3, 4, 'close_no_action', pg_temp.f62_ts(77, '09:10'), 'A', 'Recognition shared at the shift huddle. No further action needed.'),
  (4, 1, 'submit', pg_temp.f62_ts(74, '13:36'), 'A', null),
  (4, 2, 'begin_review', pg_temp.f62_ts(74, '15:00'), 'A', null),
  (4, 3, 'require_action', pg_temp.f62_ts(74, '15:10'), 'A', 'Restock and add a second ear plug dispenser.'),
  (4, 4, 'close_from_action', pg_temp.f62_ts(66, '10:00'), 'A', 'Operator coached on the spot. Ear plug dispensers now at both whitener room doors and added to the daily supply check.'),
  (5, 1, 'submit', pg_temp.f62_ts(69, '08:06'), 'A', null),
  (5, 2, 'begin_review', pg_temp.f62_ts(69, '09:30'), 'A', null),
  (5, 3, 'require_action', pg_temp.f62_ts(69, '09:45'), 'A', 'Reinstall guard today; audit all screw conveyor tail guards in Drying & Storage.'),
  (5, 4, 'close_from_action', pg_temp.f62_ts(40, '16:00'), 'A', 'Guard reinstalled the same day. Guard audit completed and the guard check added to the bearing-change work order template. Tracked on the linked conveyor guarding risk.'),
  (6, 1, 'submit', pg_temp.f62_ts(63, '07:21'), 'A', null),
  (6, 2, 'begin_review', pg_temp.f62_ts(63, '09:00'), 'A', null),
  (6, 3, 'require_action', pg_temp.f62_ts(63, '09:20'), 'A', 'Raised to the risk register: dryer fire from fines buildup.'),
  (6, 4, 'close_from_action', pg_temp.f62_ts(45, '11:00'), 'A', 'Dryer 2 column cleaned and plenum thermocouple replaced. Weekly column screen cleaning added to the dryer PM. Tracked on the linked dryer fire risk.'),
  (7, 1, 'submit', pg_temp.f62_ts(57, '06:11'), 'U', null),
  (7, 2, 'begin_review', pg_temp.f62_ts(56, '08:30'), 'A', null),
  (7, 3, 'require_action', pg_temp.f62_ts(56, '09:00'), 'A', 'Retrain second shift bagging crew on lockout for jam clearing; evaluate a jam-clearing tool and interlocked guard.'),
  (8, 1, 'submit', pg_temp.f62_ts(52, '15:36'), 'A', null),
  (8, 2, 'begin_review', pg_temp.f62_ts(51, '08:10'), 'A', null),
  (8, 3, 'no_action', pg_temp.f62_ts(51, '08:12'), 'A', null),
  (8, 4, 'close_no_action', pg_temp.f62_ts(51, '08:15'), 'A', 'Shared with the day shift as an example of good housekeeping.'),
  (9, 1, 'submit', pg_temp.f62_ts(47, '09:21'), 'A', null),
  (9, 2, 'begin_review', pg_temp.f62_ts(47, '10:30'), 'A', null),
  (9, 3, 'require_action', pg_temp.f62_ts(47, '10:40'), 'A', 'Repair the leaking spout and add the stairs to the sweep checklist.'),
  (9, 4, 'close_from_action', pg_temp.f62_ts(44, '13:00'), 'A', 'Leaking spout on the Bin 4 fill conveyor repaired. Catwalk stairs added to the end-of-shift sweep checklist for Drying & Storage.'),
  (10, 1, 'submit', pg_temp.f62_ts(41, '11:16'), 'A', null),
  (10, 2, 'begin_review', pg_temp.f62_ts(40, '08:30'), 'A', null),
  (10, 3, 'require_action', pg_temp.f62_ts(40, '08:45'), 'A', 'Good catch. Maintenance to quote a second pull-cord switch for B-3.'),
  (11, 1, 'submit', pg_temp.f62_ts(36, '16:36'), 'A', null),
  (11, 2, 'begin_review', pg_temp.f62_ts(33, '09:00'), 'A', null),
  (12, 1, 'submit', pg_temp.f62_ts(30, '10:26'), 'A', null),
  (12, 2, 'begin_review', pg_temp.f62_ts(29, '08:15'), 'A', null),
  (12, 3, 'require_action', pg_temp.f62_ts(29, '08:40'), 'A', 'Close the toe board gap and require tool lanyards on elevator head platforms.'),
  (13, 1, 'submit', pg_temp.f62_ts(24, '14:06'), 'A', null),
  (13, 2, 'begin_review', pg_temp.f62_ts(22, '10:00'), 'A', null),
  (14, 1, 'submit', pg_temp.f62_ts(18, '16:01'), 'U', null),
  (15, 1, 'submit', pg_temp.f62_ts(12, '11:41'), 'A', null),
  (15, 2, 'begin_review', pg_temp.f62_ts(11, '09:00'), 'A', null),
  (15, 3, 'no_action', pg_temp.f62_ts(11, '09:05'), 'A', null),
  (16, 1, 'submit', pg_temp.f62_ts(7, '07:31'), 'A', null),
  (17, 1, 'submit', pg_temp.f62_ts(4, '10:26'), 'U', null);

alter table f62_obs_tx add column from_s text, add column to_s text;
update f62_obs_tx set
  from_s = case tkey when 'submit' then 'draft' when 'begin_review' then 'submitted'
                     when 'require_action' then 'review' when 'no_action' then 'review'
                     when 'close_from_action' then 'action_required' when 'close_no_action' then 'no_action' end,
  to_s = case tkey when 'submit' then 'submitted' when 'begin_review' then 'review'
                   when 'require_action' then 'action_required' when 'no_action' then 'no_action'
                   else 'closed' end;

-- Final observation state (one update from draft, as the RPCs leave it).
update public.forge_observations o
set status = s.to_s,
    row_version = 1 + s.cnt,
    submitted_at = s.submitted_at,
    reviewed_at = s.reviewed_at,
    reviewed_by = s.reviewed_by,
    closed_at = s.closed_at,
    closed_by = s.closed_by,
    closure_summary = s.closure,
    updated_at = s.last_at,
    updated_by = s.last_actor
from (
  select t.n,
         (array_agg(t.to_s order by t.seq desc))[1] as to_s,
         count(*) as cnt,
         max(t.at) filter (where t.tkey = 'submit') as submitted_at,
         max(t.at) filter (where t.tkey in ('begin_review', 'require_action', 'no_action')) as reviewed_at,
         pg_temp.f62_u((array_agg(t.actor order by t.seq desc) filter (where t.tkey in ('begin_review', 'require_action', 'no_action')))[1]) as reviewed_by,
         max(t.at) filter (where t.to_s = 'closed') as closed_at,
         pg_temp.f62_u(max(t.actor) filter (where t.to_s = 'closed')) as closed_by,
         max(t.comment) filter (where t.to_s = 'closed') as closure,
         max(t.at) as last_at,
         pg_temp.f62_u((array_agg(t.actor order by t.seq desc))[1]) as last_actor
  from f62_obs_tx t group by t.n
) s
where o.id = pg_temp.f62_id('10' || lpad(s.n::text, 2, '0'));

insert into public.forge_workflow_instances (
  id, organization_id, workflow_definition_id, workflow_version, resource_type, resource_id,
  current_state_key, started_at, completed_at, created_at, updated_at
)
select pg_temp.f62_id('11' || lpad(s.n::text, 2, '0')), '20000000-0000-4000-8000-000000000100', d.id, 1,
       'observation', pg_temp.f62_id('10' || lpad(s.n::text, 2, '0')), s.to_s, s.first_at,
       case when s.to_s = 'closed' then s.last_at end, s.first_at, s.last_at
from (
  select n, min(at) as first_at, max(at) as last_at, (array_agg(to_s order by seq desc))[1] as to_s
  from f62_obs_tx group by n
) s
cross join lateral (
  select id from public.forge_workflow_definitions
  where organization_id is null and workflow_key = 'observations.lifecycle' and version = 1 limit 1
) d;

insert into public.forge_workflow_events (
  id, organization_id, workflow_instance_id, resource_type, resource_id, transition_key,
  from_state_key, to_state_key, actor_user_id, comment, metadata, occurred_at
)
select pg_temp.f62_id('701' || lpad(t.n::text, 2, '0') || lpad(t.seq::text, 2, '0')),
       '20000000-0000-4000-8000-000000000100', pg_temp.f62_id('11' || lpad(t.n::text, 2, '0')),
       'observation', pg_temp.f62_id('10' || lpad(t.n::text, 2, '0')),
       case when t.seq = 0 then 'initialize' else t.tkey end,
       case when t.seq = 0 then null else t.from_s end,
       case when t.seq = 0 then 'draft' else t.to_s end,
       pg_temp.f62_u(t.actor),
       case when t.seq = 0 then 'Workflow instance created during observation transition.' else t.comment end,
       case when t.seq = 0 then '{"source":"forge_perform_observation_lifecycle_transition"}'::jsonb
            else '{"adapter":"observation_atomic"}'::jsonb end,
       t.at
from (
  select n, seq, tkey, at, actor, comment, from_s, to_s from f62_obs_tx
  union all
  select n, 0, null, at, actor, null, null, null from f62_obs_tx where seq = 1
) t;

insert into public.forge_observation_activity (organization_id, observation_id, activity_type, message, actor_user_id, metadata, created_at)
select o.organization_id, o.id, 'created', 'Observation ' || o.observation_number || ' created.', o.created_by,
       jsonb_build_object('reporting_mode', o.reporting_mode), o.created_at
from public.forge_observations o
where o.id between pg_temp.f62_id('1001') and pg_temp.f62_id('1099')
union all
select '20000000-0000-4000-8000-000000000100', pg_temp.f62_id('10' || lpad(t.n::text, 2, '0')),
       'workflow_' || t.tkey, 'Observation transitioned from ' || t.from_s || ' to ' || t.to_s || '.',
       pg_temp.f62_u(t.actor),
       jsonb_build_object('event_id', pg_temp.f62_id('701' || lpad(t.n::text, 2, '0') || lpad(t.seq::text, 2, '0')), 'transition_key', t.tkey),
       t.at
from f62_obs_tx t
order by 7;

insert into public.forge_record_activity (organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata, created_at)
select '20000000-0000-4000-8000-000000000100', 'observation', pg_temp.f62_id('10' || lpad(t.n::text, 2, '0')),
       'workflow_transition', 'Workflow transitioned to ' || t.to_s || '.', pg_temp.f62_u(t.actor),
       jsonb_build_object('event_id', pg_temp.f62_id('701' || lpad(t.n::text, 2, '0') || lpad(t.seq::text, 2, '0')), 'transition_key', t.tkey),
       t.at
from f62_obs_tx t
order by t.at;

-- =============================================================================
-- RISK REGISTER
-- =============================================================================
insert into public.forge_risks (
  id, organization_id, risk_number, title, description, hazard_description, category_key,
  location_id, division_id, work_area, status, risk_matrix_id, risk_matrix_version,
  inherent_likelihood_key, inherent_severity_key, inherent_score, inherent_band_key,
  residual_likelihood_key, residual_severity_key, residual_score, residual_band_key,
  owner_personnel_id, review_due_at, next_review_at, source_type, source_reference,
  acceptance_required, accepted_by, accepted_at, acceptance_comment,
  created_by, updated_by, created_at, updated_at
)
select
  pg_temp.f62_id('20' || lpad(v.n::text, 2, '0')),
  '20000000-0000-4000-8000-000000000100',
  'RISK-' || extract(year from v.created_at)::int || '-' || lpad(v.num::text, 6, '0'),
  v.title, v.descr, v.hazard, v.cat,
  '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200', v.area, 'draft',
  case when v.ilk is not null then pg_temp.f62_matrix() end,
  case when v.ilk is not null then pg_temp.f62_matrix_version() end,
  v.ilk, v.isk, pg_temp.f62_score(v.ilk, v.isk), pg_temp.f62_band(v.ilk, v.isk),
  v.rlk, v.rsk, pg_temp.f62_score(v.rlk, v.rsk), pg_temp.f62_band(v.rlk, v.rsk),
  pg_temp.f62_p(v.owner), v.review_due, v.next_review,
  v.source_type,
  (select observation_number from public.forge_observations where id = pg_temp.f62_id('10' || lpad(v.source_obs::text, 2, '0'))),
  v.accepted_at is not null, case when v.accepted_at is not null then pg_temp.f62_u('A') end, v.accepted_at, v.accept_comment,
  pg_temp.f62_u('A'), pg_temp.f62_u('A'), v.created_at, v.created_at
from (values
  (1, 2, 'Combustible grain dust deflagration in the milling building',
   'Fine rice dust and hull dust collect on ledges, motors and inside equipment throughout the milling building. A dust cloud with an ignition source (hot bearing, misaligned belt, hot work, static) could cause a deflagration and a secondary explosion through the building.',
   'Accumulated combustible dust plus ignition from hot bearings, belt slip, tramp metal or hot work.',
   'fire_explosion', 'Milling building - all floors', 2, pg_temp.f62_ts(88, '09:00'), 'manual', null,
   'possible', 'catastrophic', 'rare', 'catastrophic', pg_temp.f62_ts(9, '08:00'), pg_temp.f62_ts(9, '08:00'), null::timestamptz, null),
  (2, 3, 'Engulfment or entrapment during grain bin entry',
   'Employees enter rough rice storage bins to break crusted grain, inspect aeration floors and remove sweep augers. Flowing grain, collapsing grain walls or bridged grain can engulf a worker in seconds.',
   'Flowing or collapsing grain, unexpected start of unload equipment, oxygen-deficient or fumigant atmosphere.',
   'physical', 'Drying & Storage - storage bins 1-8', 3, pg_temp.f62_ts(86, '10:30'), 'manual', null,
   'possible', 'catastrophic', 'rare', 'catastrophic', pg_temp.f62_ts(-70, '08:00'), pg_temp.f62_ts(-70, '08:00'),
   pg_temp.f62_ts(83, '14:30'), 'Residual engulfment risk accepted with the permit, lockout, lifeline and attendant controls in place. Entry only under the bin entry JSA.'),
  (3, 7, 'Caught-in hazards at conveyor and bucket elevator pinch points',
   'Screw conveyors, drag conveyors and bucket elevator boots have rotating parts at walkway level. Guards are removed for bearing changes and cleanout and are not always put back.',
   'Contact with rotating screw flights, shafts, tail pulleys and elevator boot pulleys.',
   'physical', 'Receiving and Drying & Storage conveyors', 9, pg_temp.f62_ts(67, '10:00'), 'observation', 5,
   'likely', 'major', 'unlikely', 'major', pg_temp.f62_ts(3, '08:00'), pg_temp.f62_ts(3, '08:00'), null, null),
  (4, 5, 'Forklift and pedestrian contact in the bag warehouse',
   'Forklifts load trailers and move finished bags through the warehouse while packaging staff walk between the bagging lines, break room and dock doors. Several blind corners and no marked walkways.',
   'Pedestrian struck by a forklift at dock doors, aisle ends and the bagging line exit.',
   'physical', 'Shipping - bag warehouse and dock doors 1-4', 3, pg_temp.f62_ts(80, '13:00'), 'observation', 2,
   'likely', 'major', 'possible', 'moderate', pg_temp.f62_ts(-5, '08:00'), null, null, null),
  (5, 8, 'Dryer fire from fines and hull buildup in column dryers',
   'Fines, hulls and trash collect in column dryer screens and the plenum during harvest. Overheated material can smolder and ignite, and dryer fires can spread to the bins and the dust collection system.',
   'Smoldering fines in dryer columns, high plenum temperatures, burner control failure.',
   'fire_explosion', 'Drying & Storage - Column Dryers 1 and 2', 13, pg_temp.f62_ts(61, '09:30'), 'observation', 6,
   'possible', 'major', 'unlikely', 'major', pg_temp.f62_ts(-75, '08:00'), pg_temp.f62_ts(-75, '08:00'), null, null),
  (6, 4, 'Hazardous energy release during maintenance on mill equipment',
   'Maintenance and operators clear jams, change screens and replace belts on equipment with electrical, pneumatic and gravity energy. Machines in the mill share disconnects and some have more than one energy source.',
   'Unexpected start-up or release of stored energy while guards are off.',
   'electrical', 'Whole plant - production and maintenance', 9, pg_temp.f62_ts(84, '08:30'), 'manual', null,
   'possible', 'catastrophic', 'unlikely', 'major', pg_temp.f62_ts(-20, '08:00'), pg_temp.f62_ts(-20, '08:00'), null, null),
  (7, 9, 'Noise exposure in the hulling and whitening rooms',
   'Huskers, whiteners and aspirators run continuously. Spot readings in the hulling room are above 95 dBA. Operators spend most of the shift in these rooms.',
   'Continuous noise above the action level leading to hearing loss.',
   'physical', 'Milling - hulling and whitening rooms', 2, pg_temp.f62_ts(26, '13:00'), 'manual', null,
   'almost_certain', 'minor', null, null, pg_temp.f62_ts(-14, '08:00'), null, null, null),
  (8, 6, 'Heat stress for rail loadout and dryer crews',
   'Rail loadout, dryer and bin crews work outdoors or next to dryers during the hottest months. Heat index regularly exceeds 105 F in July and August.',
   'Heat exhaustion and heat stroke during summer and harvest season.',
   'physical', 'Shipping - rail loadout; Drying & Storage', 24, pg_temp.f62_ts(75, '10:00'), 'manual', null,
   'likely', 'moderate', 'possible', 'moderate', pg_temp.f62_ts(-8, '08:00'), pg_temp.f62_ts(-8, '08:00'), null, null),
  (9, 10, 'Fall from height at rail car hatch access',
   'Loadout crew opens and closes hopper car hatches from the car top. The loadout catwalk only covers part of the car length.',
   'Fall from the top of a hopper car while opening or latching hatches.',
   'physical', 'Shipping - rail loadout track 2', 2, pg_temp.f62_ts(3, '09:40'), 'manual', null,
   null, null, null, null, null, null, null, null),
  (10, 1, 'Phosphine exposure during in-house bin fumigation',
   'Plant staff applied aluminum phosphide tablets to stored rough rice in bins and the warehouse. Phosphine gas is acutely toxic and can migrate through bin walls and conveyors.',
   'Inhalation of phosphine during application, aeration and re-entry.',
   'chemical', 'Drying & Storage - bins and warehouse', 2, pg_temp.f62_ts(89, '08:30'), 'manual', null,
   'unlikely', 'catastrophic', 'rare', 'catastrophic', pg_temp.f62_ts(-60, '08:00'), pg_temp.f62_ts(-60, '08:00'), null, null)
) as v(n, num, title, descr, hazard, cat, area, owner, created_at, source_type, source_obs,
       ilk, isk, rlk, rsk, review_due, next_review, accepted_at, accept_comment);

insert into public.forge_risk_controls (
  id, organization_id, risk_id, control_type, title, description, effectiveness_notes, is_active, sort_order, created_by, created_at, updated_at
)
select pg_temp.f62_id('21' || lpad(c.r::text, 2, '0') || lpad(c.k::text, 2, '0')), '20000000-0000-4000-8000-000000000100',
       r.id, c.ctype, c.title, c.descr, c.notes, true, c.k * 10, pg_temp.f62_u('A'),
       r.created_at + make_interval(mins => 20 + c.k * 4), r.created_at + make_interval(mins => 20 + c.k * 4)
from (values
  (1, 1, 'engineering', 'Baghouse dust collection on all aspirators and transfer points', 'Pickup points on huskers, whiteners, graders and conveyor transfers ducted to Baghouses 1 and 2.', 'Static pressure checked weekly; working.'),
  (1, 2, 'engineering', 'Explosion venting on Elevator Legs 1-3', 'Vent panels on leg heads and casings vent to the outside.', null),
  (1, 3, 'administrative', 'Housekeeping schedule with 1/32 inch dust limit', 'Daily floor cleaning; weekly high-level cleaning of ledges, beams, motor tops and conduit by vacuum only.', 'Hull grinder room added after OBS review.'),
  (1, 4, 'administrative', 'Hot work permit for all welding and cutting in the mill', 'Permit with 35 ft cleanup, fire watch and 60-minute post-work watch.', null),
  (2, 1, 'administrative', 'Confined space entry permit for every bin entry', 'Entry supervisor signs permit after atmosphere testing and lockout verification.', null),
  (2, 2, 'administrative', 'Lockout of unload, sweep and fill equipment before entry', 'All bin conveyors and the sweep auger locked and tried before anyone enters.', null),
  (2, 3, 'engineering', 'Body harness and lifeline on mechanical winch with attendant', 'Attendant at the roof hatch with radio contact; winch rated for rescue.', 'Mock rescue drill completed; second attendant added in JSA v2.'),
  (2, 4, 'administrative', 'No entry with bridged or crusted grain', 'Crust broken from the roof hatch with a pole before entry.', null),
  (3, 1, 'engineering', 'Fixed tail guards on all screw and drag conveyors', 'Bolted guards that need a tool to remove.', 'Audit after OBS found one missing guard.'),
  (3, 2, 'administrative', 'Guard check on every maintenance work order close-out', 'Work order cannot be closed until the technician confirms guards are back on.', null),
  (3, 3, 'administrative', 'Lockout before reaching into any conveyor or elevator boot', 'Covered by the plant lockout program and the elevator boot JSA.', null),
  (4, 1, 'engineering', 'Blue spot lights and backup alarms on all forklifts', null, null),
  (4, 2, 'engineering', 'Painted pedestrian walkways at dock doors 1-4', null, null),
  (4, 3, 'administrative', 'Horn at every door, aisle end and blind corner', 'Covered in forklift refresher training.', null),
  (5, 1, 'administrative', 'Weekly dryer column screen cleaning during harvest', 'Added to the dryer PM after the Dryer 2 high-temperature event.', null),
  (5, 2, 'engineering', 'Plenum and discharge high-temperature shutdowns', 'Burner trips at 220 F plenum; discharge temperature alarm at the dryer panel.', 'Thermocouple on Dryer 2 replaced.'),
  (5, 3, 'administrative', 'Dryer fire response procedure and drills', 'Operators trained to shut burner, stop fans and keep grain moving only when safe.', null),
  (6, 1, 'administrative', 'Written lockout/tagout program with machine-specific procedures', null, null),
  (6, 2, 'engineering', 'Group lockout box for multi-energy jobs on the whitener line', null, null),
  (6, 3, 'administrative', 'Annual periodic inspection of lockout procedures', null, null),
  (7, 1, 'ppe', 'Hearing protection required in hulling and whitening rooms', 'Ear plug dispensers at each door.', null),
  (8, 1, 'administrative', 'Heat illness prevention plan with work/rest schedule', 'Breaks increase when heat index passes 103 F.', null),
  (8, 2, 'administrative', 'Cold water and electrolyte stations at loadout and dryers', null, null),
  (8, 3, 'administrative', 'Acclimatization schedule for new and seasonal employees', null, null),
  (10, 1, 'administrative', 'Licensed applicator and fumigation management plan', null, null),
  (10, 2, 'ppe', 'Phosphine monitors and SCBA for re-entry', null, null)
) as c(r, k, ctype, title, descr, notes)
join public.forge_risks r on r.id = pg_temp.f62_id('20' || lpad(c.r::text, 2, '0'));

insert into public.forge_risk_treatments (
  id, organization_id, risk_id, treatment_status, title, description, owner_personnel_id, due_at, completed_at, notes, created_by, created_at, updated_at
)
select pg_temp.f62_id('22' || lpad(t.r::text, 2, '0') || lpad(t.k::text, 2, '0')), '20000000-0000-4000-8000-000000000100',
       r.id, t.status, t.title, t.descr, pg_temp.f62_p(t.owner), t.due_at, t.completed_at, t.notes, pg_temp.f62_u('A'),
       r.created_at + make_interval(mins => 50 + t.k * 3), coalesce(t.completed_at, r.created_at + make_interval(mins => 50 + t.k * 3))
from (values
  (1, 1, 'completed', 'Contract high-level dust cleaning of milling building', 'Contractor vacuums beams, trusses and overhead ducts on all floors.', 2, pg_temp.f62_ts(60, '17:00'), pg_temp.f62_ts(63, '16:00'), 'Completed over the Labor Day shutdown.'),
  (1, 2, 'planned', 'Install explosion isolation valve on Leg 2 dust collection duct', 'Quote received; install during the January outage.', 9, pg_temp.f62_ts(-40, '17:00'), null::timestamptz, null),
  (3, 1, 'in_progress', 'Retrofit bolted tail guards on remaining screw conveyors', 'Six conveyors in Drying & Storage still have hinged guards.', 10, pg_temp.f62_ts(5, '17:00'), null, 'Four of six done.'),
  (4, 1, 'completed', 'Paint walkways and install blue spot lights on forklifts', null, 3, pg_temp.f62_ts(55, '17:00'), pg_temp.f62_ts(51, '15:00'), null),
  (4, 2, 'in_progress', 'Install convex mirrors at dock door 3 and aisle 6', null, 12, pg_temp.f62_ts(-10, '17:00'), null, 'Door 3 mirror installed; aisle 6 bracket on order.'),
  (5, 1, 'completed', 'Add weekly column screen cleaning to dryer PM', null, 13, pg_temp.f62_ts(55, '17:00'), pg_temp.f62_ts(56, '10:00'), null),
  (6, 1, 'completed', 'Group lockout box for whitener line', null, 9, pg_temp.f62_ts(70, '17:00'), pg_temp.f62_ts(72, '14:00'), null),
  (7, 1, 'planned', 'Noise dosimetry survey for hulling and whitening operators', 'Full-shift dosimetry on both shifts to set the hearing conservation program scope.', 2, pg_temp.f62_ts(-21, '17:00'), null, null),
  (8, 1, 'in_progress', 'Install shade structure at rail loadout car deck', null, 9, pg_temp.f62_ts(-12, '17:00'), null, 'Posts set; canopy delivery next week.'),
  (10, 1, 'completed', 'Move bin fumigation to a contract applicator', null, 2, pg_temp.f62_ts(35, '17:00'), pg_temp.f62_ts(32, '12:00'), null)
) as t(r, k, status, title, descr, owner, due_at, completed_at, notes)
join public.forge_risks r on r.id = pg_temp.f62_id('20' || lpad(t.r::text, 2, '0'));

-- Periodic review snapshots (forge_create_risk_review).
insert into public.forge_risk_reviews (
  id, organization_id, risk_id, reviewed_by, reviewed_at, risk_matrix_id, risk_matrix_version,
  inherent_likelihood_key, inherent_severity_key, inherent_score, inherent_band_key,
  residual_likelihood_key, residual_severity_key, residual_score, residual_band_key,
  review_notes, next_review_at, created_at
)
select pg_temp.f62_id('23' || lpad(v.r::text, 2, '0') || '01'), r.organization_id, r.id, pg_temp.f62_u('A'), v.reviewed_at,
       r.risk_matrix_id, r.risk_matrix_version,
       r.inherent_likelihood_key, r.inherent_severity_key, r.inherent_score, r.inherent_band_key,
       r.residual_likelihood_key, r.residual_severity_key, r.residual_score, r.residual_band_key,
       v.notes, r.next_review_at, v.reviewed_at
from (values
  (2, pg_temp.f62_ts(20, '10:00'), 'Reviewed after the mock bin rescue drill. Bin entry JSA revised (v2) to add a continuous 4-gas monitor and a second attendant. Controls effective.'),
  (5, pg_temp.f62_ts(15, '09:30'), 'Harvest review. No further high-temperature events since weekly column cleaning started.'),
  (6, pg_temp.f62_ts(10, '14:00'), 'Lockout audit of six jobs on both shifts. One missing try-step found and coached. Procedures current.')
) as v(r, reviewed_at, notes)
join public.forge_risks r on r.id = pg_temp.f62_id('20' || lpad(v.r::text, 2, '0'));

-- Risk lifecycle transitions (risk_register.lifecycle, NX-02H model).
create temp table f62_risk_tx (n integer, seq integer, tkey text, at timestamptz, comment text);
insert into f62_risk_tx (n, seq, tkey, at, comment) values
  (1, 1, 'submit_assessment', pg_temp.f62_ts(88, '10:00'), null),
  (1, 2, 'submit_for_review', pg_temp.f62_ts(87, '14:00'), null),
  (1, 3, 'activate', pg_temp.f62_ts(85, '16:00'), null),
  (2, 1, 'submit_assessment', pg_temp.f62_ts(86, '11:30'), null),
  (2, 2, 'submit_for_review', pg_temp.f62_ts(84, '09:00'), null),
  (2, 3, 'activate', pg_temp.f62_ts(83, '15:00'), null),
  (3, 1, 'submit_assessment', pg_temp.f62_ts(67, '11:00'), null),
  (3, 2, 'submit_for_review', pg_temp.f62_ts(60, '10:00'), null),
  (3, 3, 'activate', pg_temp.f62_ts(58, '13:30'), null),
  (4, 1, 'submit_assessment', pg_temp.f62_ts(80, '14:00'), null),
  (4, 2, 'submit_for_review', pg_temp.f62_ts(78, '10:30'), null),
  (5, 1, 'submit_assessment', pg_temp.f62_ts(61, '10:30'), null),
  (5, 2, 'submit_for_review', pg_temp.f62_ts(55, '09:00'), null),
  (5, 3, 'activate', pg_temp.f62_ts(54, '11:00'), null),
  (6, 1, 'submit_assessment', pg_temp.f62_ts(84, '09:30'), null),
  (6, 2, 'submit_for_review', pg_temp.f62_ts(80, '13:00'), null),
  (6, 3, 'activate', pg_temp.f62_ts(79, '10:00'), null),
  (7, 1, 'submit_assessment', pg_temp.f62_ts(25, '09:00'), null),
  (8, 1, 'submit_assessment', pg_temp.f62_ts(75, '11:00'), null),
  (8, 2, 'submit_for_review', pg_temp.f62_ts(73, '15:00'), null),
  (8, 3, 'activate', pg_temp.f62_ts(72, '09:00'), null),
  (8, 4, 'send_to_review', pg_temp.f62_ts(6, '10:00'), 'End of heat season review: confirm the shade structure and work/rest schedule before next summer.'),
  (10, 1, 'submit_assessment', pg_temp.f62_ts(89, '09:30'), null),
  (10, 2, 'submit_for_review', pg_temp.f62_ts(88, '15:00'), null),
  (10, 3, 'activate', pg_temp.f62_ts(87, '10:00'), null),
  (10, 4, 'close', pg_temp.f62_ts(30, '11:00'), 'Bin fumigation is now done only by a licensed contract applicator under the contractor safety program. Plant employees no longer handle phosphine; contractor oversight is covered by the contractor management procedure.');

alter table f62_risk_tx add column from_s text, add column to_s text;
update f62_risk_tx set
  from_s = case tkey when 'submit_assessment' then 'draft' when 'submit_for_review' then 'assessment'
                     when 'activate' then 'review' else 'active' end,
  to_s = case tkey when 'submit_assessment' then 'assessment' when 'submit_for_review' then 'review'
                   when 'activate' then 'active' when 'send_to_review' then 'review' else 'closed' end;

update public.forge_risks r
set status = s.to_s,
    row_version = 1 + s.cnt + (case when r.inherent_score is not null then 1 else 0 end)
                + (case when r.residual_score is not null then 1 else 0 end)
                + (case when r.accepted_at is not null then 1 else 0 end)
                + coalesce((select count(*) from public.forge_risk_reviews rv where rv.risk_id = r.id), 0),
    last_reviewed_at = (select max(rv.reviewed_at) from public.forge_risk_reviews rv where rv.risk_id = r.id),
    closed_at = s.closed_at,
    closed_by = case when s.closed_at is not null then pg_temp.f62_u('A') end,
    closure_summary = s.closure,
    updated_at = greatest(s.last_at, coalesce((select max(rv.reviewed_at) from public.forge_risk_reviews rv where rv.risk_id = r.id), s.last_at))
from (
  select n, (array_agg(to_s order by seq desc))[1] as to_s, count(*) as cnt, max(at) as last_at,
         max(at) filter (where to_s = 'closed') as closed_at,
         max(comment) filter (where to_s = 'closed') as closure
  from f62_risk_tx group by n
) s
where r.id = pg_temp.f62_id('20' || lpad(s.n::text, 2, '0'));

insert into public.forge_workflow_instances (
  id, organization_id, workflow_definition_id, workflow_version, resource_type, resource_id,
  current_state_key, started_at, completed_at, created_at, updated_at
)
select pg_temp.f62_id('24' || lpad(s.n::text, 2, '0')), '20000000-0000-4000-8000-000000000100', d.id, 1,
       'risk_register', pg_temp.f62_id('20' || lpad(s.n::text, 2, '0')), s.to_s, s.first_at,
       case when s.to_s = 'closed' then s.last_at end, s.first_at, s.last_at
from (
  select n, min(at) as first_at, max(at) as last_at, (array_agg(to_s order by seq desc))[1] as to_s
  from f62_risk_tx group by n
) s
cross join lateral (
  select id from public.forge_workflow_definitions
  where organization_id is null and workflow_key = 'risk_register.lifecycle' and version = 1 limit 1
) d;

insert into public.forge_workflow_events (
  id, organization_id, workflow_instance_id, resource_type, resource_id, transition_key,
  from_state_key, to_state_key, actor_user_id, comment, metadata, occurred_at
)
select pg_temp.f62_id('702' || lpad(t.n::text, 2, '0') || lpad(t.seq::text, 2, '0')),
       '20000000-0000-4000-8000-000000000100', pg_temp.f62_id('24' || lpad(t.n::text, 2, '0')),
       'risk_register', pg_temp.f62_id('20' || lpad(t.n::text, 2, '0')),
       case when t.seq = 0 then 'initialize' else t.tkey end,
       case when t.seq = 0 then null else t.from_s end,
       case when t.seq = 0 then 'draft' else t.to_s end,
       pg_temp.f62_u('A'),
       case when t.seq = 0 then 'Workflow instance created during risk transition.' else t.comment end,
       case when t.seq = 0 then '{"source":"forge_perform_risk_lifecycle_transition"}'::jsonb
            else '{"adapter":"risk_atomic"}'::jsonb end,
       t.at
from (
  select n, seq, tkey, at, comment, from_s, to_s from f62_risk_tx
  union all
  select n, 0, null, at, null, null, null from f62_risk_tx where seq = 1
) t;

insert into public.forge_risk_activity (organization_id, risk_id, activity_type, message, actor_user_id, metadata, created_at)
select a.organization_id, a.risk_id, a.activity_type, a.message, pg_temp.f62_u('A'), a.metadata, a.created_at
from (
  select r.organization_id, r.id as risk_id, 'created' as activity_type, 'Risk ' || r.risk_number || ' created.' as message,
         '{"status":"draft"}'::jsonb as metadata, r.created_at
  from public.forge_risks r where r.id between pg_temp.f62_id('2001') and pg_temp.f62_id('2099')
  union all
  select r.organization_id, r.id, 'inherent_assessed',
         'Inherent risk assessed: ' || r.inherent_band_key || ' (' || r.inherent_score || ').',
         jsonb_build_object('likelihood_key', r.inherent_likelihood_key, 'severity_key', r.inherent_severity_key,
                            'score', r.inherent_score, 'band_key', r.inherent_band_key),
         r.created_at + interval '15 minutes'
  from public.forge_risks r where r.id between pg_temp.f62_id('2001') and pg_temp.f62_id('2099') and r.inherent_score is not null
  union all
  select r.organization_id, r.id, 'residual_assessed',
         'Residual risk assessed: ' || r.residual_band_key || ' (' || r.residual_score || ').',
         jsonb_build_object('likelihood_key', r.residual_likelihood_key, 'severity_key', r.residual_severity_key,
                            'score', r.residual_score, 'band_key', r.residual_band_key),
         r.created_at + interval '45 minutes'
  from public.forge_risks r where r.id between pg_temp.f62_id('2001') and pg_temp.f62_id('2099') and r.residual_score is not null
  union all
  select c.organization_id, c.risk_id, 'control_added', 'Control added: ' || c.title,
         jsonb_build_object('control_id', c.id, 'control_type', c.control_type), c.created_at
  from public.forge_risk_controls c where c.risk_id between pg_temp.f62_id('2001') and pg_temp.f62_id('2099')
  union all
  select t.organization_id, t.risk_id, 'treatment_added', 'Treatment added: ' || t.title,
         jsonb_build_object('treatment_id', t.id, 'treatment_status', t.treatment_status), t.created_at
  from public.forge_risk_treatments t where t.risk_id between pg_temp.f62_id('2001') and pg_temp.f62_id('2099')
  union all
  select r.organization_id, r.id, 'risk_accepted', 'Formal risk acceptance recorded.',
         jsonb_build_object('acceptance_comment', r.acceptance_comment), r.accepted_at
  from public.forge_risks r where r.id between pg_temp.f62_id('2001') and pg_temp.f62_id('2099') and r.accepted_at is not null
  union all
  select rv.organization_id, rv.risk_id, 'risk_reviewed', 'Risk review snapshot recorded.',
         jsonb_build_object('review_id', rv.id), rv.reviewed_at
  from public.forge_risk_reviews rv where rv.risk_id between pg_temp.f62_id('2001') and pg_temp.f62_id('2099')
  union all
  select '20000000-0000-4000-8000-000000000100', pg_temp.f62_id('20' || lpad(t.n::text, 2, '0')), 'workflow_' || t.tkey,
         'Risk transitioned from ' || t.from_s || ' to ' || t.to_s || '.',
         jsonb_build_object('event_id', pg_temp.f62_id('702' || lpad(t.n::text, 2, '0') || lpad(t.seq::text, 2, '0')), 'transition_key', t.tkey),
         t.at
  from f62_risk_tx t
) a
order by a.created_at;

insert into public.forge_record_activity (organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata, created_at)
select '20000000-0000-4000-8000-000000000100', 'risk_register', pg_temp.f62_id('20' || lpad(t.n::text, 2, '0')),
       'workflow_transition', 'Workflow transitioned to ' || t.to_s || '.', pg_temp.f62_u('A'),
       jsonb_build_object('event_id', pg_temp.f62_id('702' || lpad(t.n::text, 2, '0') || lpad(t.seq::text, 2, '0')), 'transition_key', t.tkey),
       t.at
from f62_risk_tx t
order by t.at;

-- =============================================================================
-- JSAs
--   J1 Clearing a plugged bucket elevator boot ............ active
--   J2 Entering a grain storage bin v1 ..................... superseded by J3
--   J3 Entering a grain storage bin v2 ..................... active
--   J4 Changing whitener screens ........................... approved (not yet activated)
--   J5 Loading hopper rail cars at the loadout spout ....... active
--   J6 Replacing a column dryer burner assembly ............ in review
--   J7 Clearing jams on the manual bag sewing line ......... retired
--   J8 Changing rubber rolls on paddy huskers .............. draft
-- =============================================================================
insert into public.forge_jsas (
  id, organization_id, jsa_number, title, description, location_id, division_id, work_area,
  job_title, task_name, status, version, parent_jsa_id, risk_matrix_id, risk_matrix_version,
  prepared_by_personnel_id, review_due_at, is_template, created_by, updated_by, created_at, updated_at
)
select pg_temp.f62_id('30' || lpad(v.j::text, 2, '0')), '20000000-0000-4000-8000-000000000100',
       'JSA-' || extract(year from v.created_at)::int || '-' || lpad(v.num::text, 6, '0'),
       v.title, v.descr, '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200',
       v.area, v.job_title, v.task, 'draft', v.ver,
       case when v.parent is not null then pg_temp.f62_id('30' || lpad(v.parent::text, 2, '0')) end,
       pg_temp.f62_matrix(), pg_temp.f62_matrix_version(), pg_temp.f62_p(v.prepared_by), v.review_due, false,
       pg_temp.f62_u('A'), pg_temp.f62_u('A'), v.created_at, v.created_at
from (values
  (1, 3, 1, null::integer, 'Clearing a Plugged Bucket Elevator Boot',
   'Clearing rough rice or paddy from a plugged elevator boot after a choke-down. Applies to Receiving Legs 1-3 and the mill feed leg.',
   'Receiving - elevator boot pits, Legs 1-3', 'Mill Operator / Maintenance Technician', 'Unplug elevator boot', 3, pg_temp.f62_ts(75, '10:00'), pg_temp.f62_ts(-290, '08:00')),
  (2, 2, 1, null, 'Entering a Grain Storage Bin',
   'Entry into rough rice storage bins to break crusted grain, inspect aeration floors or remove sweep augers. Permit-required confined space.',
   'Drying & Storage - storage bins 1-8', 'Dryer Operator / Bin Crew', 'Bin entry', 3, pg_temp.f62_ts(86, '08:00'), pg_temp.f62_ts(-279, '08:00')),
  (3, 5, 2, 2, 'Entering a Grain Storage Bin',
   'Entry into rough rice storage bins to break crusted grain, inspect aeration floors or remove sweep augers. Permit-required confined space.',
   'Drying & Storage - storage bins 1-8', 'Dryer Operator / Bin Crew', 'Bin entry', 3, pg_temp.f62_ts(40, '14:00'), pg_temp.f62_ts(-279, '08:00')),
  (4, 6, 1, null, 'Changing Whitener Screens',
   'Removing and replacing worn screens on the Line 1 and Line 2 vertical whiteners.',
   'Milling - whitener room, Lines 1-2', 'Mill Operator', 'Whitener screen change', 4, pg_temp.f62_ts(16, '09:00'), pg_temp.f62_ts(-350, '08:00')),
  (5, 4, 1, null, 'Loading Hopper Rail Cars at the Loadout Spout',
   'Positioning hopper cars with the car puller, opening hatches, loading milled rice through the loadout spout and sealing the car.',
   'Shipping - rail loadout track 2', 'Forklift Operator / Loadout Crew', 'Rail car loadout', 3, pg_temp.f62_ts(70, '13:00'), pg_temp.f62_ts(-295, '08:00')),
  (6, 7, 1, null, 'Replacing a Column Dryer Burner Assembly',
   'Removing and replacing the gas burner assembly on Column Dryer 1 or 2 during the off-season.',
   'Drying & Storage - Column Dryers 1 and 2', 'Lead Electrician / Maintenance Technician', 'Dryer burner replacement', 9, pg_temp.f62_ts(10, '13:30'), null),
  (7, 1, 1, null, 'Clearing Jams on the Manual Bag Sewing Line',
   'Clearing bag and thread jams on the manual sewing head on bagging line 1.',
   'Shipping - bagging line 1', 'Packaging Operator', 'Bag sewing jam clearing', 3, pg_temp.f62_ts(88, '07:30'), pg_temp.f62_ts(-277, '08:00')),
  (8, 8, 1, null, 'Changing Rubber Rolls on Paddy Huskers',
   'Replacing worn rubber rolls on the paddy huskers in the hulling room.',
   'Milling - hulling room', 'Mill Operator / Maintenance Technician', 'Husker roll change', 10, pg_temp.f62_ts(4, '15:10'), null)
) as v(j, num, ver, parent, title, descr, area, job_title, task, prepared_by, created_at, review_due);

-- Steps, hazards and controls. One row per hazard (hazard null = step with no hazard yet).
-- controls: 'type|title' entries.
create temp table f62_jsa_haz (
  j integer, s integer, step_title text, step_desc text, h integer, hazard text, cat text,
  lk text, sk text, rlk text, rsk text, controls text[]
);
insert into f62_jsa_haz values
  -- J1 bucket elevator boot
  (1, 1, 'Stop feed and run the leg empty', 'Close the feed gate upstream and let the leg run until the up-leg is empty before stopping.', 1,
   'Grain surge into the boot when feed restarts', 'physical', 'possible', 'moderate', 'unlikely', 'minor',
   array['administrative|Close and lock the upstream feed gate', 'administrative|Confirm with control room that the leg is empty before stopping']),
  (1, 2, 'Lock out the leg drive and feed conveyors', 'Apply personal locks to the leg motor disconnect and the upstream conveyor disconnects using the group lockout box.', 1,
   'Unexpected start-up of the leg drive or feed conveyor', 'electrical', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Group lockout with personal locks on every disconnect', 'administrative|Try-start at the local station to verify zero energy']),
  (1, 3, 'Release stored energy in the belt', 'Check the backstop and secure the head pulley if the up-leg is still loaded.', 1,
   'Belt rollback and bucket movement from a loaded up-leg', 'physical', 'likely', 'major', 'unlikely', 'major',
   array['engineering|Verify the backstop is engaged', 'administrative|Chain the head pulley when the up-leg is loaded']),
  (1, 4, 'Open the boot cleanout door and remove grain', 'Remove grain from the boot with a rake and shovel; do not reach past the door frame.', 1,
   'Dust cloud in the boot pit with an ignition source', 'fire_explosion', 'possible', 'major', 'unlikely', 'major',
   array['engineering|Dust collection running on the boot pit', 'administrative|Non-sparking tools and no hot work in the pit', 'ppe|N95 respirator and safety goggles']),
  (1, 4, 'Open the boot cleanout door and remove grain', 'Remove grain from the boot with a rake and shovel; do not reach past the door frame.', 2,
   'Caught between buckets and the boot pulley', 'physical', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Use a long-handled rake; never reach past the door frame']),
  (1, 5, 'Inspect the boot pulley, belt tracking and buckets', 'Check for damaged buckets, belt splice wear and pulley lagging before closing up.', 1,
   'Cuts from sharp or bent bucket edges', 'physical', 'possible', 'minor', 'unlikely', 'minor',
   array['ppe|Cut-resistant gloves']),
  (1, 6, 'Close up, remove locks and restart', 'Close the cleanout door, clear the area, notify the control room, remove locks and watch the first minutes of operation.', 1,
   'Someone in the danger zone at restart', 'physical', 'unlikely', 'major', 'rare', 'major',
   array['administrative|Head count and verbal all-clear before removing locks', 'administrative|Notify the control room before restart']),
  -- J2 bin entry v1
  (2, 1, 'Issue the confined space entry permit', 'Entry supervisor completes the permit, tests the atmosphere and assigns the attendant.', 1,
   'Oxygen-deficient or fumigant atmosphere in the bin', 'chemical', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Test O2, LEL, CO and phosphine before entry', 'engineering|Run the bin aeration fan for ventilation during entry']),
  (2, 2, 'Lock out unload, sweep and fill equipment', 'Lock and tag the unload conveyor, sweep auger, fill conveyor and aeration fan controls as listed on the permit.', 1,
   'Engulfment from grain flow if unload equipment starts', 'physical', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Lock and try every bin unload and fill drive']),
  (2, 3, 'Check for crusted or bridged grain from the roof hatch', 'Look for crusting, bridging and grain hanging on the walls before anyone enters.', 1,
   'Collapse of a grain bridge or grain wall onto the entrant', 'physical', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|No entry with bridged or crusted grain; break crust from the hatch with a pole']),
  (2, 4, 'Put on harness and connect to the lifeline', 'Full-body harness connected to the lifeline on the mechanical winch at the roof hatch.', 1,
   'Sinking into grain or falling from the ladder', 'physical', 'possible', 'major', 'rare', 'major',
   array['engineering|Lifeline on mechanical winch with attendant at the hatch', 'ppe|Full-body harness']),
  (2, 5, 'Enter, do the work and keep in contact', 'Stay above the grain line, keep radio contact with the attendant and stay off the unload sump.', 1,
   'Dust and heat exposure inside the bin', 'physical', 'possible', 'moderate', 'unlikely', 'moderate',
   array['ppe|Half-face respirator with P100 filters', 'administrative|Entry limited to 30 minutes in hot weather']),
  (2, 6, 'Exit, account for everyone and close the permit', 'Attendant confirms everyone is out, removes locks per the lockout procedure and closes the permit.', 1,
   'Equipment restarted with someone still inside', 'physical', 'unlikely', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Attendant head count against the permit sign-in before lock removal']),
  -- J4 whitener screens
  (4, 1, 'Shut down and lock out the whitener', 'Stop feed, run the whitener empty, lock out the motor and the feed screw.', 1,
   'Unexpected start of the whitener rotor', 'electrical', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Lock out motor and feed screw; try-start to verify']),
  (4, 2, 'Remove the screen housing doors and old screens', 'Two people lift the housing doors; pull screens straight out.', 1,
   'Hand cuts from worn screen edges', 'physical', 'likely', 'minor', 'unlikely', 'minor',
   array['ppe|Cut-resistant gloves and sleeves']),
  (4, 2, 'Remove the screen housing doors and old screens', 'Two people lift the housing doors; pull screens straight out.', 2,
   'Back strain lifting housing doors', 'ergonomic', 'possible', 'minor', 'unlikely', 'minor',
   array['administrative|Two-person lift for housing doors']),
  (4, 3, 'Install new screens and check the clearance', 'Fit new screens, set the bar clearance and close the housing.', 1,
   'Pinched fingers between screen frame and housing', 'physical', 'possible', 'minor', 'unlikely', 'minor',
   array['ppe|Cut-resistant gloves', 'administrative|Use the screen installation handle']),
  (4, 4, 'Remove locks and restart', 'Clear tools, confirm doors are latched, remove locks and restart with feed off.', 1,
   'Loose tools thrown by the rotor at start-up', 'physical', 'unlikely', 'major', 'rare', 'major',
   array['administrative|Tool count before closing the housing']),
  -- J5 rail loadout
  (5, 1, 'Position the car with the car puller', 'Radio check, blue flag and derail set; spotter on the ground for every move.', 1,
   'Struck by or caught between rail cars', 'physical', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Spotter with radio for every car move', 'engineering|Blue flag and derail on track 2']),
  (5, 2, 'Chock the car and open the hatches', 'Chock wheels, climb to the car top from the loadout catwalk and open hatches with the hatch hook.', 1,
   'Fall from the car top', 'physical', 'possible', 'major', 'unlikely', 'major',
   array['engineering|Work from the loadout catwalk with the gangway down', 'ppe|Harness tied to the overhead trolley line when off the catwalk']),
  (5, 2, 'Chock the car and open the hatches', 'Chock wheels, climb to the car top from the loadout catwalk and open hatches with the hatch hook.', 2,
   'Hatch lid slamming in wind', 'physical', 'possible', 'moderate', 'unlikely', 'minor',
   array['administrative|Open hatches fully to the stop; no hatch work in gusts over 30 mph']),
  (5, 3, 'Lower the spout and load the car', 'Lower the telescoping spout into the hatch, start the loadout belt and watch the fill level.', 1,
   'Dust exposure at the hatch', 'physical', 'likely', 'minor', 'possible', 'minor',
   array['engineering|Loadout spout dust collection running', 'ppe|N95 respirator']),
  (5, 4, 'Close and seal the hatches', 'Latch every hatch and apply the numbered seals.', 1,
   'Fall from the car top', 'physical', 'possible', 'major', 'unlikely', 'major',
   array['engineering|Work from the loadout catwalk with the gangway down']),
  (5, 5, 'Release the car', 'Raise the gangway, remove chocks, pull the blue flag and release to the railroad.', 1,
   'Car moved with the gangway down', 'physical', 'unlikely', 'major', 'rare', 'major',
   array['engineering|Gangway interlock with the car puller']),
  -- J6 dryer burner (in review)
  (6, 1, 'Isolate gas and electrical energy', 'Close and lock the burner gas valves, bleed the gas train and lock out the burner control panel and fans.', 1,
   'Gas release or fire from an energized gas train', 'fire_explosion', 'possible', 'catastrophic', 'rare', 'catastrophic',
   array['administrative|Lock both manual gas valves and bleed the train', 'administrative|Gas detector reading before opening the burner housing']),
  (6, 2, 'Remove the old burner assembly', 'Rig the burner with the chain hoist from the dryer frame and lower it to the cart.', 1,
   'Struck by a swinging or dropped burner', 'physical', 'possible', 'major', 'unlikely', 'major',
   array['engineering|Rated chain hoist and inspected rigging', 'administrative|No one under the load']),
  (6, 3, 'Install the new burner and leak test', 'Set the new burner, make up gas connections and soap-test every joint before relighting.', 1,
   'Gas leak at new connections', 'fire_explosion', 'possible', 'major', 'rare', 'major',
   array['administrative|Soap test every joint and check with gas detector']),
  (6, 4, 'Relight and verify flame safeguard', 'Relight per the manufacturer start-up sheet and test the flame safeguard and high limit.', 1,
   'Flashback or delayed ignition on relight', 'fire_explosion', 'unlikely', 'major', 'rare', 'major',
   array['administrative|Follow the start-up checklist; stand clear of the burner opening', 'ppe|Face shield and FR clothing']),
  -- J7 bag sewing line (retired)
  (7, 1, 'Stop the conveyor and sewing head', 'Stop the bag conveyor and sewing head at the local station.', 1,
   'Sewing head cycles while clearing', 'physical', 'possible', 'major', 'unlikely', 'major',
   array['administrative|Lock out the sewing head before reaching in']),
  (7, 2, 'Clear the jammed bag and thread', 'Pull the bag clear and cut the thread with safety scissors.', 1,
   'Needle puncture to fingers', 'physical', 'possible', 'minor', 'unlikely', 'minor',
   array['ppe|Cut-resistant gloves']),
  (7, 3, 'Rethread and restart', 'Rethread the head with the guard closed and restart at low speed.', 1,
   'Guard left open at restart', 'physical', 'unlikely', 'major', 'rare', 'major',
   array['administrative|Guard closed before reset']),
  -- J8 husker rolls (draft, still being written)
  (8, 1, 'Lock out the husker', 'Lock out the husker motor and the feed hopper gate.', null, null, null, null, null, null, null, null),
  (8, 2, 'Remove the worn rubber rolls', 'Release roll pressure and pull the rolls with the roll puller.', 1,
   'Hand pinched between rolls', 'physical', 'possible', 'moderate', null, null, null),
  (8, 3, 'Install new rolls and set the gap', 'Fit new rolls and set the roll gap with the feeler gauge.', null, null, null, null, null, null, null, null);

-- J3 (bin entry v2) starts as a copy of v1 (forge_create_jsa_revision), then adds the revised controls.
insert into f62_jsa_haz
select 3, s, step_title, step_desc, h, hazard, cat, lk, sk, rlk, rsk, controls from f62_jsa_haz where j = 2;
update f62_jsa_haz set controls = controls || array['engineering|Continuous 4-gas monitor worn by the entrant']
where j = 3 and s = 1;
update f62_jsa_haz set controls = controls || array['administrative|Second attendant at the roof hatch for every entry']
where j = 3 and s = 4;

insert into public.forge_jsa_steps (id, organization_id, jsa_id, step_number, title, description, sort_order, created_by, created_at, updated_at)
select distinct on (h.j, h.s)
       pg_temp.f62_id('31' || lpad(h.j::text, 2, '0') || lpad(h.s::text, 2, '0') || '0'),
       '20000000-0000-4000-8000-000000000100', j.id, h.s, h.step_title, h.step_desc, h.s * 10, pg_temp.f62_u('A'),
       j.created_at + make_interval(mins => 5 + h.s * 3), j.created_at + make_interval(mins => 5 + h.s * 3)
from f62_jsa_haz h
join public.forge_jsas j on j.id = pg_temp.f62_id('30' || lpad(h.j::text, 2, '0'))
order by h.j, h.s;

insert into public.forge_jsa_hazards (
  id, organization_id, jsa_id, step_id, hazard_description, category_key, likelihood_key, severity_key,
  risk_score, risk_band_key, residual_likelihood_key, residual_severity_key, residual_score, residual_band_key,
  sort_order, created_by, created_at, updated_at
)
select pg_temp.f62_id('32' || lpad(h.j::text, 2, '0') || lpad(h.s::text, 2, '0') || h.h::text),
       '20000000-0000-4000-8000-000000000100', j.id,
       pg_temp.f62_id('31' || lpad(h.j::text, 2, '0') || lpad(h.s::text, 2, '0') || '0'),
       h.hazard, h.cat, h.lk, h.sk, pg_temp.f62_score(h.lk, h.sk), pg_temp.f62_band(h.lk, h.sk),
       h.rlk, h.rsk, pg_temp.f62_score(h.rlk, h.rsk), pg_temp.f62_band(h.rlk, h.rsk),
       h.h * 10, pg_temp.f62_u('A'),
       j.created_at + make_interval(mins => 30 + h.s * 4 + h.h), j.created_at + make_interval(mins => 30 + h.s * 4 + h.h)
from f62_jsa_haz h
join public.forge_jsas j on j.id = pg_temp.f62_id('30' || lpad(h.j::text, 2, '0'))
where h.hazard is not null;

insert into public.forge_jsa_controls (id, organization_id, jsa_id, hazard_id, control_type, title, sort_order, created_by, created_at, updated_at)
select pg_temp.f62_id('33' || lpad(h.j::text, 2, '0') || lpad(h.s::text, 2, '0') || h.h::text || c.ord::text),
       '20000000-0000-4000-8000-000000000100', j.id,
       pg_temp.f62_id('32' || lpad(h.j::text, 2, '0') || lpad(h.s::text, 2, '0') || h.h::text),
       split_part(c.entry, '|', 1), split_part(c.entry, '|', 2), c.ord * 10, pg_temp.f62_u('A'),
       j.created_at + make_interval(mins => 60 + h.s * 4 + h.h + c.ord::int), j.created_at + make_interval(mins => 60 + h.s * 4 + h.h + c.ord::int)
from f62_jsa_haz h
join public.forge_jsas j on j.id = pg_temp.f62_id('30' || lpad(h.j::text, 2, '0'))
cross join lateral unnest(h.controls) with ordinality as c(entry, ord)
where h.hazard is not null;

insert into public.forge_jsa_ppe_items (id, organization_id, jsa_id, label, required, sort_order, created_by, created_at, updated_at)
select pg_temp.f62_id('34' || lpad(p.j::text, 2, '0') || lpad(p.ord::text, 2, '0')),
       '20000000-0000-4000-8000-000000000100', j.id, p.label, true, p.ord * 10, pg_temp.f62_u('A'),
       j.created_at + interval '2 hours', j.created_at + interval '2 hours'
from (
  select v.j, x.label, x.ord
  from (values
    (1, array['Hard hat', 'Safety glasses', 'Hearing protection', 'Cut-resistant gloves', 'N95 respirator', 'Steel-toe boots']),
    (2, array['Full-body harness', 'Half-face respirator (P100)', 'Hard hat', 'Safety glasses', 'Personal 4-gas monitor (entry supervisor)', 'Steel-toe boots']),
    (3, array['Full-body harness', 'Half-face respirator (P100)', 'Hard hat', 'Safety glasses', 'Continuous 4-gas monitor (entrant)', 'Steel-toe boots']),
    (4, array['Hearing protection', 'Safety glasses', 'Cut-resistant gloves and sleeves', 'Steel-toe boots']),
    (5, array['Hard hat', 'Safety glasses', 'High-visibility vest', 'Full-body harness', 'N95 respirator', 'Steel-toe boots']),
    (6, array['FR clothing', 'Face shield', 'Leather gloves', 'Hard hat', 'Steel-toe boots']),
    (7, array['Cut-resistant gloves', 'Safety glasses', 'Hearing protection'])
  ) as v(j, labels)
  cross join lateral unnest(v.labels) with ordinality as x(label, ord)
) p
join public.forge_jsas j on j.id = pg_temp.f62_id('30' || lpad(p.j::text, 2, '0'));

-- JSA lifecycle transitions (jsa.lifecycle; activation via forge_activate_jsa_revision).
create temp table f62_jsa_tx (j integer, seq integer, tkey text, from_s text, to_s text, at timestamptz, comment text);
insert into f62_jsa_tx values
  (1, 1, 'submit', 'draft', 'in_review', pg_temp.f62_ts(75, '15:00'), null),
  (1, 2, 'approve', 'in_review', 'approved', pg_temp.f62_ts(73, '09:00'), null),
  (1, 3, 'activate', 'approved', 'active', pg_temp.f62_ts(72, '07:00'), null),
  (2, 1, 'submit', 'draft', 'in_review', pg_temp.f62_ts(86, '13:00'), null),
  (2, 2, 'approve', 'in_review', 'approved', pg_temp.f62_ts(85, '10:00'), null),
  (2, 3, 'activate', 'approved', 'active', pg_temp.f62_ts(85, '10:05'), null),
  (2, 4, 'supersede', 'active', 'superseded', pg_temp.f62_ts(38, '09:00'), 'Superseded by v2 after the mock bin rescue drill.'),
  (3, 1, 'submit', 'draft', 'in_review', pg_temp.f62_ts(39, '10:00'), null),
  (3, 2, 'approve', 'in_review', 'approved', pg_temp.f62_ts(38, '08:45'), null),
  (3, 3, 'activate', 'approved', 'active', pg_temp.f62_ts(38, '09:00'), 'v2 adds a continuous 4-gas monitor and a second attendant at the roof hatch.'),
  (4, 1, 'submit', 'draft', 'in_review', pg_temp.f62_ts(14, '11:00'), null),
  (4, 2, 'approve', 'in_review', 'approved', pg_temp.f62_ts(3, '11:00'), null),
  (5, 1, 'submit', 'draft', 'in_review', pg_temp.f62_ts(70, '16:00'), null),
  (5, 2, 'approve', 'in_review', 'approved', pg_temp.f62_ts(68, '08:30'), null),
  (5, 3, 'activate', 'approved', 'active', pg_temp.f62_ts(68, '08:35'), null),
  (6, 1, 'submit', 'draft', 'in_review', pg_temp.f62_ts(8, '14:00'), null),
  (7, 1, 'submit', 'draft', 'in_review', pg_temp.f62_ts(88, '10:00'), null),
  (7, 2, 'approve', 'in_review', 'approved', pg_temp.f62_ts(87, '09:00'), null),
  (7, 3, 'activate', 'approved', 'active', pg_temp.f62_ts(87, '09:05'), null),
  (7, 4, 'retire_from_active', 'active', 'retired', pg_temp.f62_ts(30, '10:00'), 'Manual bag sewing line removed and replaced by the automatic bagger. A new JSA will be written for the bagger.');

update public.forge_jsas j
set status = s.to_s,
    row_version = 1 + s.cnt,
    approved_by = case when s.approved_at is not null then pg_temp.f62_u('A') end,
    approved_at = s.approved_at,
    effective_at = s.activated_at,
    updated_at = s.last_at,
    updated_by = pg_temp.f62_u('A')
from (
  select j, (array_agg(to_s order by seq desc))[1] as to_s, count(*) as cnt, max(at) as last_at,
         max(at) filter (where tkey = 'approve') as approved_at,
         max(at) filter (where tkey = 'activate') as activated_at
  from f62_jsa_tx group by j
) s
where j.id = pg_temp.f62_id('30' || lpad(s.j::text, 2, '0'));

-- Active version pointers live on the lineage root.
update public.forge_jsas set active_version_id = id
where id in (pg_temp.f62_id('3001'), pg_temp.f62_id('3005'), pg_temp.f62_id('3007'));
update public.forge_jsas set active_version_id = pg_temp.f62_id('3003') where id = pg_temp.f62_id('3002');

insert into public.forge_jsa_revisions (id, organization_id, jsa_id, version_jsa_id, version, change_summary, created_by, created_at)
values (pg_temp.f62_id('3503'), '20000000-0000-4000-8000-000000000100', pg_temp.f62_id('3002'), pg_temp.f62_id('3003'), 2,
        'Added a continuous 4-gas monitor for the entrant and a second attendant at the roof hatch after the mock rescue drill.',
        pg_temp.f62_u('A'), pg_temp.f62_ts(40, '14:00'));

insert into public.forge_workflow_instances (
  id, organization_id, workflow_definition_id, workflow_version, resource_type, resource_id,
  current_state_key, started_at, completed_at, created_at, updated_at
)
select pg_temp.f62_id('36' || lpad(s.j::text, 2, '0')), '20000000-0000-4000-8000-000000000100', d.id, 1,
       'jsa', pg_temp.f62_id('30' || lpad(s.j::text, 2, '0')), s.to_s, s.first_at,
       case when s.to_s in ('retired', 'superseded') then s.last_at end, s.first_at, s.last_at
from (
  select j, min(at) as first_at, max(at) as last_at, (array_agg(to_s order by seq desc))[1] as to_s
  from f62_jsa_tx group by j
) s
cross join lateral (
  select id from public.forge_workflow_definitions
  where organization_id is null and workflow_key = 'jsa.lifecycle' and version = 1 limit 1
) d;

insert into public.forge_workflow_events (
  id, organization_id, workflow_instance_id, resource_type, resource_id, transition_key,
  from_state_key, to_state_key, actor_user_id, comment, metadata, occurred_at
)
select pg_temp.f62_id('703' || lpad(t.j::text, 2, '0') || lpad(t.seq::text, 2, '0')),
       '20000000-0000-4000-8000-000000000100', pg_temp.f62_id('36' || lpad(t.j::text, 2, '0')),
       'jsa', pg_temp.f62_id('30' || lpad(t.j::text, 2, '0')),
       case when t.seq = 0 then 'initialize' else t.tkey end,
       case when t.seq = 0 then null else t.from_s end,
       case when t.seq = 0 then 'draft' else t.to_s end,
       pg_temp.f62_u('A'),
       case when t.seq = 0 then 'Workflow instance created during JSA transition.' else t.comment end,
       case when t.seq = 0 then '{"source":"forge_perform_jsa_version_transition"}'::jsonb
            else '{"adapter":"jsa_atomic"}'::jsonb end,
       t.at
from (
  select j, seq, tkey, from_s, to_s, at, comment from f62_jsa_tx
  union all
  select j, 0, null, null, null, at, null from f62_jsa_tx where seq = 1
) t;

-- =============================================================================
-- JSA executions (crew briefings)
-- =============================================================================
create temp table f62_exec (
  e integer, j integer, created_at timestamptz, minutes integer, final_status text,
  lead integer, crew integer[], notes text, stop_reason text
);
insert into f62_exec values
  (1, 2, pg_temp.f62_ts(62, '06:30'), 310, 'completed', 13, array[15, 14], 'Bin 4 cleanout after load-out; sweep auger removed for repair.', null),
  (2, 1, pg_temp.f62_ts(60, '13:00'), 130, 'completed', 10, array[11, 5], 'Leg 1 boot choked after wet paddy from inbound truck 14.', null),
  (3, 7, pg_temp.f62_ts(55, '09:00'), 45, 'completed', 21, array[20], 'Thread jam on bagging line 1 sewing head.', null),
  (4, 2, pg_temp.f62_ts(47, '07:00'), 210, 'completed', 13, array[15], 'Bin 2 aeration floor inspection before fill.', null),
  (5, 1, pg_temp.f62_ts(33, '22:15'), 95, 'completed', 11, array[6], 'Leg 2 boot plug on nights after a power bump.', null),
  (6, 5, pg_temp.f62_ts(27, '07:30'), 480, 'completed', 19, array[18, 23], 'Loaded 4 hopper cars for an outbound milled rice order.', null),
  (7, 3, pg_temp.f62_ts(21, '06:40'), 330, 'completed', 13, array[14, 15], 'Bin 6 crust breaking and level-off after fill.', null),
  (8, 5, pg_temp.f62_ts(13, '07:15'), 450, 'completed', 19, array[18], 'Loaded 3 hopper cars.', null),
  (9, 1, pg_temp.f62_ts(9, '09:20'), 105, 'completed', 10, array[8, 0], 'Leg 3 boot plugged during receiving.', null),
  (10, 3, pg_temp.f62_ts(5, '07:00'), 65, 'stopped', 13, array[15, 14], 'Bin 3 entry to remove sweep auger.',
   'Crusted grain found hanging on the upper bin wall during the pre-entry check from the roof hatch. Entry stopped until the crust is broken down from the roof.'),
  (11, 1, pg_temp.f62_ts(1, '15:00'), null, 'planned', 12, array[7], 'Planned: clean out the Leg 3 boot during the Saturday downtime.', null),
  (12, 5, now() - interval '3 hours', null, 'active', 19, array[23], 'Loading 2 hopper cars; wind light.', null);

insert into public.forge_jsa_executions (
  id, organization_id, jsa_id, execution_number, status, location_id, lead_personnel_id, notes, created_by, created_at, updated_at
)
select pg_temp.f62_id('40' || lpad(x.e::text, 2, '0')), '20000000-0000-4000-8000-000000000100',
       pg_temp.f62_id('30' || lpad(x.j::text, 2, '0')),
       'JSAEX-' || extract(year from x.created_at)::int || '-' || lpad(x.e::text, 6, '0'),
       'planned', '20000000-0000-4000-8000-000000000300', pg_temp.f62_p(x.lead), x.notes, pg_temp.f62_u('A'),
       x.created_at, x.created_at
from f62_exec x;

-- Crew (inserted while planned, as the crew-window trigger requires).
insert into public.forge_jsa_execution_participants (
  id, organization_id, execution_id, personnel_id, user_id, role, requires_acknowledgement, created_at
)
select pg_temp.f62_id('41' || lpad(m.e::text, 2, '0') || lpad(m.ord::text, 2, '0')), '20000000-0000-4000-8000-000000000100',
       pg_temp.f62_id('40' || lpad(m.e::text, 2, '0')), pg_temp.f62_p(m.person),
       (select auth_user_id from public.forge_personnel where id = pg_temp.f62_p(m.person)),
       m.role, true, m.created_at
from (
  select x.e, x.lead as person, 'lead' as role, 0::bigint as ord, x.created_at from f62_exec x
  union all
  select x.e, c.person, 'crew', c.ord, x.created_at from f62_exec x
  cross join lateral unnest(x.crew) with ordinality as c(person, ord)
) m;

-- Final execution state (forge_perform_jsa_execution_transition: planned > briefing > active > ...).
update public.forge_jsa_executions e
set status = x.final_status,
    started_at = case when x.final_status <> 'planned' then x.created_at + interval '15 minutes' end,
    completed_at = case when x.final_status = 'completed' then x.created_at + make_interval(mins => x.minutes) end,
    stopped_at = case when x.final_status = 'stopped' then x.created_at + make_interval(mins => x.minutes) end,
    stopped_by = case when x.final_status = 'stopped' then pg_temp.f62_u('A') end,
    stop_reason = x.stop_reason,
    stop_requires_revision = false,
    row_version = 1 + case x.final_status when 'planned' then 0 when 'active' then 2 else 3 end,
    updated_at = case when x.final_status = 'planned' then x.created_at
                      when x.final_status = 'active' then x.created_at + interval '35 minutes'
                      else x.created_at + make_interval(mins => x.minutes) end
from f62_exec x
where e.id = pg_temp.f62_id('40' || lpad(x.e::text, 2, '0'));

update public.forge_jsa_execution_participants p
set acknowledged_at = x.created_at + make_interval(mins => 20 + (right(p.id::text, 2))::int)
from f62_exec x
where p.execution_id = pg_temp.f62_id('40' || lpad(x.e::text, 2, '0'))
  and x.final_status <> 'planned';

-- JSA activity: created, content, revision, transitions and executions.
insert into public.forge_jsa_activity (organization_id, jsa_id, activity_type, message, actor_user_id, metadata, created_at)
select a.organization_id, a.jsa_id, a.activity_type, a.message, pg_temp.f62_u('A'), a.metadata, a.created_at
from (
  select j.organization_id, j.id as jsa_id, 'created' as activity_type, 'JSA ' || j.jsa_number || ' created.' as message,
         jsonb_build_object('status', 'draft', 'version', j.version) as metadata, j.created_at
  from public.forge_jsas j where j.id between pg_temp.f62_id('3001') and pg_temp.f62_id('3099') and j.id <> pg_temp.f62_id('3003')
  union all
  select j.organization_id, j.id, 'revision_created', 'Revision v2 created as draft from ' || p.jsa_number || '.',
         jsonb_build_object('source_jsa_id', p.id, 'root_jsa_id', p.id, 'version', 2, 'revision_jsa_id', j.id,
                            'change_summary', 'Added a continuous 4-gas monitor for the entrant and a second attendant at the roof hatch after the mock rescue drill.'),
         j.created_at
  from public.forge_jsas j join public.forge_jsas p on p.id = j.parent_jsa_id
  where j.id = pg_temp.f62_id('3003')
  union all
  select s.organization_id, s.jsa_id, 'step_added', 'Step ' || s.step_number || ' added: ' || s.title,
         jsonb_build_object('step_id', s.id), s.created_at
  from public.forge_jsa_steps s where s.jsa_id between pg_temp.f62_id('3001') and pg_temp.f62_id('3099') and s.jsa_id <> pg_temp.f62_id('3003')
  union all
  select h.organization_id, h.jsa_id, 'hazard_added', 'Hazard added: ' || h.hazard_description,
         jsonb_build_object('hazard_id', h.id, 'step_id', h.step_id, 'risk_band_key', h.risk_band_key), h.created_at
  from public.forge_jsa_hazards h where h.jsa_id between pg_temp.f62_id('3001') and pg_temp.f62_id('3099') and h.jsa_id <> pg_temp.f62_id('3003')
  union all
  select c.organization_id, c.jsa_id, 'control_added', 'Control added: ' || c.title,
         jsonb_build_object('control_id', c.id, 'hazard_id', c.hazard_id, 'control_type', c.control_type), c.created_at
  from public.forge_jsa_controls c
  where c.jsa_id between pg_temp.f62_id('3001') and pg_temp.f62_id('3099')
    and (c.jsa_id <> pg_temp.f62_id('3003') or c.title in ('Continuous 4-gas monitor worn by the entrant', 'Second attendant at the roof hatch for every entry'))
  union all
  select '20000000-0000-4000-8000-000000000100', pg_temp.f62_id('30' || lpad(t.j::text, 2, '0')), 'workflow_' || t.tkey,
         'JSA transitioned from ' || t.from_s || ' to ' || t.to_s || '.',
         jsonb_build_object('event_id', pg_temp.f62_id('703' || lpad(t.j::text, 2, '0') || lpad(t.seq::text, 2, '0')), 'transition_key', t.tkey),
         t.at
  from f62_jsa_tx t
  union all
  select e.organization_id, e.jsa_id, 'execution_planned', 'Execution ' || e.execution_number || ' planned.',
         jsonb_build_object('execution_id', e.id), e.created_at
  from public.forge_jsa_executions e where e.id between pg_temp.f62_id('4001') and pg_temp.f62_id('4099')
  union all
  select e.organization_id, e.jsa_id, 'participant_acknowledged', 'Participant acknowledged execution.',
         jsonb_build_object('execution_id', e.id, 'participant_id', p.id), p.acknowledged_at
  from public.forge_jsa_execution_participants p join public.forge_jsa_executions e on e.id = p.execution_id
  where e.id between pg_temp.f62_id('4001') and pg_temp.f62_id('4099') and p.acknowledged_at is not null
  union all
  select e.organization_id, e.jsa_id, 'execution_' || st.to_status,
         'Execution ' || e.execution_number || ' moved from ' || st.from_status || ' to ' || st.to_status || '.',
         jsonb_build_object('execution_id', e.id, 'from_status', st.from_status, 'to_status', st.to_status), st.at
  from public.forge_jsa_executions e
  join f62_exec x on e.id = pg_temp.f62_id('40' || lpad(x.e::text, 2, '0'))
  cross join lateral (values
    ('planned', 'briefing', x.created_at + interval '15 minutes', 1),
    ('briefing', 'active', x.created_at + interval '35 minutes', 2),
    ('active', x.final_status, x.created_at + make_interval(mins => coalesce(x.minutes, 0)), 3)
  ) as st(from_status, to_status, at, k)
  where x.final_status <> 'planned' and (st.k < 3 or x.final_status in ('completed', 'stopped'))
) a
order by a.created_at;

insert into public.forge_record_activity (organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata, created_at)
select '20000000-0000-4000-8000-000000000100', 'jsa', pg_temp.f62_id('30' || lpad(t.j::text, 2, '0')),
       'workflow_transition', 'Workflow transitioned to ' || t.to_s || '.', pg_temp.f62_u('A'),
       jsonb_build_object('event_id', pg_temp.f62_id('703' || lpad(t.j::text, 2, '0') || lpad(t.seq::text, 2, '0')), 'transition_key', t.tkey),
       t.at
from f62_jsa_tx t
order by t.at;

-- =============================================================================
-- Cross-module links (forgeRelationshipRegistry: identified_risk)
-- =============================================================================
insert into public.forge_record_links (
  id, organization_id, source_resource_type, source_resource_id, target_resource_type, target_resource_id,
  relationship_type, created_by, created_at
)
values
  (pg_temp.f62_id('5001'), '20000000-0000-4000-8000-000000000100', 'observation', pg_temp.f62_id('1001'), 'risk_register', pg_temp.f62_id('2001'), 'identified_risk', pg_temp.f62_u('A'), pg_temp.f62_ts(85, '10:31')),
  (pg_temp.f62_id('5002'), '20000000-0000-4000-8000-000000000100', 'observation', pg_temp.f62_id('1002'), 'risk_register', pg_temp.f62_id('2004'), 'identified_risk', pg_temp.f62_u('A'), pg_temp.f62_ts(80, '13:00')),
  (pg_temp.f62_id('5003'), '20000000-0000-4000-8000-000000000100', 'observation', pg_temp.f62_id('1005'), 'risk_register', pg_temp.f62_id('2003'), 'identified_risk', pg_temp.f62_u('A'), pg_temp.f62_ts(67, '10:00')),
  (pg_temp.f62_id('5004'), '20000000-0000-4000-8000-000000000100', 'observation', pg_temp.f62_id('1006'), 'risk_register', pg_temp.f62_id('2005'), 'identified_risk', pg_temp.f62_u('A'), pg_temp.f62_ts(61, '09:30')),
  (pg_temp.f62_id('5005'), '20000000-0000-4000-8000-000000000100', 'jsa', pg_temp.f62_id('3003'), 'risk_register', pg_temp.f62_id('2002'), 'identified_risk', pg_temp.f62_u('A'), pg_temp.f62_ts(38, '09:10')),
  (pg_temp.f62_id('5006'), '20000000-0000-4000-8000-000000000100', 'jsa', pg_temp.f62_id('3001'), 'risk_register', pg_temp.f62_id('2003'), 'identified_risk', pg_temp.f62_u('A'), pg_temp.f62_ts(72, '07:10')),
  (pg_temp.f62_id('5007'), '20000000-0000-4000-8000-000000000100', 'jsa', pg_temp.f62_id('3005'), 'risk_register', pg_temp.f62_id('2009'), 'identified_risk', pg_temp.f62_u('A'), pg_temp.f62_ts(3, '09:45'));

-- =============================================================================
-- Number sequences: next app-created record continues after the seeded numbers.
-- =============================================================================
insert into public.forge_observation_sequences (organization_id, observation_year, next_value)
select organization_id, split_part(observation_number, '-', 2)::int, max(split_part(observation_number, '-', 3)::int) + 1
from public.forge_observations
where organization_id = '20000000-0000-4000-8000-000000000100' and observation_number ~ '^OBS-\d{4}-\d{6}$'
group by 1, 2
on conflict (organization_id, observation_year)
do update set next_value = greatest(public.forge_observation_sequences.next_value, excluded.next_value);

insert into public.forge_risk_sequences (organization_id, risk_year, next_value)
select organization_id, split_part(risk_number, '-', 2)::int, max(split_part(risk_number, '-', 3)::int) + 1
from public.forge_risks
where organization_id = '20000000-0000-4000-8000-000000000100' and risk_number ~ '^RISK-\d{4}-\d{6}$'
group by 1, 2
on conflict (organization_id, risk_year)
do update set next_value = greatest(public.forge_risk_sequences.next_value, excluded.next_value);

insert into public.forge_jsa_sequences (organization_id, jsa_year, next_value)
select organization_id, split_part(jsa_number, '-', 2)::int, max(split_part(jsa_number, '-', 3)::int) + 1
from public.forge_jsas
where organization_id = '20000000-0000-4000-8000-000000000100' and jsa_number ~ '^JSA-\d{4}-\d{6}$'
group by 1, 2
on conflict (organization_id, jsa_year)
do update set next_value = greatest(public.forge_jsa_sequences.next_value, excluded.next_value);

insert into public.forge_jsa_execution_sequences (organization_id, execution_year, next_value)
select organization_id, split_part(execution_number, '-', 2)::int, max(split_part(execution_number, '-', 3)::int) + 1
from public.forge_jsa_executions
where organization_id = '20000000-0000-4000-8000-000000000100' and execution_number ~ '^JSAEX-\d{4}-\d{6}$'
group by 1, 2
on conflict (organization_id, execution_year)
do update set next_value = greatest(public.forge_jsa_execution_sequences.next_value, excluded.next_value);

-- ---------------------------------------------------------------------------
-- Clean up session helpers.
-- ---------------------------------------------------------------------------
drop table if exists f62_obs_tx, f62_risk_tx, f62_jsa_haz, f62_jsa_tx, f62_exec;
drop function if exists pg_temp.f62_score(text, text), pg_temp.f62_band(text, text),
  pg_temp.f62_matrix_version(), pg_temp.f62_matrix(), pg_temp.f62_ts(integer, text),
  pg_temp.f62_u(text), pg_temp.f62_p(integer), pg_temp.f62_id(text);
