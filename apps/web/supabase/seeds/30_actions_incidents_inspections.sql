-- =============================================================================
-- Demo plant: Cypress Bend Rice Mill — Incidents, Inspections, Tasks and the
-- Corrective Actions (CAPA) register. Loaded after seed.sql and 10_cypress_bend_plant.sql.
--
-- Id namespace: 63000000-0000-4000-8000-xxxxxxxxxxxx
--   incidents             ...000000001002-1009   (+ seed.sql incident ...0801, re-described)
--   incident people       ...0000000011NN
--   inspection templates  ...000000000202-0205   (+ seed.sql template ...0901, renamed)
--   template items        ...0000000022NN-25NN
--   inspections           ...000000003002-3009   (+ seed.sql inspection ...0950, re-dated)
--   inspection items      ...0000003IIISS (III = inspection suffix, SS = item order)
--   findings              ...0000000032NN        (+ seed.sql finding ...0960)
--   corrective actions    ...0000000040NN, their linked tasks ...0000000050NN
--   standalone tasks      ...0000000051NN        (+ seed.sql task ...1301, re-described)
--
-- Record numbers follow the app formats (INC-YYYY-NNNNNN, INSP-YYYY-NNNNNN, TASK-NNNNNN,
-- CA-NNNNNN) in creation order, and every number sequence is advanced past the seeded rows
-- so records created in the app (and by tests) continue the series without collisions.
--
-- CAPA history mirrors forge_perform_capa_lifecycle_transition / createCorrectiveAction:
-- workflow instance + events, CAPA activity, record activity, audit and outbox rows, and the
-- linked Task follows the CAPA the same way the server actions keep it in sync.
--
-- Intentionally NOT linked: any asset (incident-equipment smoke test asserts exactly one
-- incident link on DEMO-AST-000001), risk/observation records (seeded elsewhere), OSHA/WC.
-- =============================================================================

-- Local plant time helpers (America/Chicago). cb_at(d, t) = d days ago at local time t.
create or replace function pg_temp.cb_at(p_days integer, p_time time)
returns timestamptz language sql stable as $$
  select ((((now() at time zone 'America/Chicago')::date - p_days) + p_time) at time zone 'America/Chicago')
$$;

create or replace function pg_temp.cb_day(p_days integer)
returns date language sql stable as $$
  select (now() at time zone 'America/Chicago')::date - p_days
$$;

create or replace function pg_temp.cb_p(p_n integer)
returns uuid language sql immutable as $$
  select ('60000000-0000-4000-8000-0000000030' || lpad(p_n::text, 2, '0'))::uuid
$$;

-- =============================================================================
-- INCIDENTS
-- =============================================================================

-- Seeded near miss (DEMO-INC-000001) becomes a real dock-door near miss; renumbered below.
update public.forge_incidents
set
  status = 'approved',
  incident_type = 'near_miss',
  severity = 'moderate',
  occurred_at = pg_temp.cb_at(12, '14:20'),
  reported_at = pg_temp.cb_at(12, '14:55'),
  summary = 'Forklift and pedestrian near miss at warehouse dock door 4',
  description = 'A forklift backing out of a trailer at dock door 4 with a pallet of 50 lb bags came within about three feet of a packaging operator walking to the break room. The operator was outside the marked walkway because pallets were staged across it. The forklift operator sounded the horn and stopped; there was no contact.',
  immediate_actions = 'Forklift traffic at doors 3-5 stopped. Staged pallets moved off the walkway, and the shift supervisor reviewed the travel path with both employees before work resumed.',
  involves_injury = false,
  involves_vehicle = true,
  property_damage = false,
  assigned_to_user_id = '20000000-0000-4000-8000-000000000001',
  submitted_at = pg_temp.cb_at(12, '15:10'),
  submitted_by = '20000000-0000-4000-8000-000000000002',
  approved_at = pg_temp.cb_at(11, '09:30'),
  approved_by = '20000000-0000-4000-8000-000000000001',
  created_at = pg_temp.cb_at(12, '14:55'),
  updated_at = pg_temp.cb_at(11, '09:30'),
  updated_by = '20000000-0000-4000-8000-000000000001'
where id = '20000000-0000-4000-8000-000000000801';

update public.forge_incident_people
set notes = 'Saw the near miss from the bagging line and reported it.', created_at = pg_temp.cb_at(12, '14:55')
where incident_id = '20000000-0000-4000-8000-000000000801' and role = 'reporter';

update public.forge_incident_activity a
set
  message = v.message,
  created_at = v.at
from (values
  ('created', 'Incident created as draft.', pg_temp.cb_at(12, '14:55')),
  ('submitted', 'Incident submitted for review.', pg_temp.cb_at(12, '15:10')),
  ('approved', 'Incident approved.', pg_temp.cb_at(11, '09:30'))
) as v(activity_type, message, at)
where a.incident_id = '20000000-0000-4000-8000-000000000801'
  and a.activity_type = v.activity_type;

insert into public.forge_incidents (
  id, organization_id, incident_number, status, incident_type, severity, occurred_at, reported_at,
  location_id, division_id, reported_by_user_id, reported_by_personnel_id, assigned_to_user_id,
  summary, description, immediate_actions, involves_injury, involves_vehicle, property_damage,
  submitted_at, submitted_by, approved_at, approved_by, closed_at, closed_by,
  created_by, updated_by, created_at, updated_at
)
values
  -- Injury incidents: injured person + local date match the OSHA/WC cases seeded by 40_* (it links by person + date).
  -- Hector Ramos, 78 days ago: laceration, 6 sutures.
  ('63000000-0000-4000-8000-000000001002','20000000-0000-4000-8000-000000000100','SEED-INC-1002','closed','injury','moderate',
   pg_temp.cb_at(78,'09:40'), pg_temp.cb_at(78,'10:05'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(9), '20000000-0000-4000-8000-000000000001',
   'Laceration to left hand on bucket elevator inspection door',
   'While opening the boot inspection door on Bucket Elevator 2 to clear a plug, the technician''s left hand slid along the unfinished edge of the door frame and cut the back of his hand. Cut-resistant gloves were in his pocket, not on.',
   'Bleeding controlled with first aid in the shop. The lead electrician drove him to the occupational clinic, where the cut was closed with 6 sutures. Returned to regular duty the next day.',
   true, false, false,
   pg_temp.cb_at(78,'10:30'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(77,'08:15'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(60,'15:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(78,'10:05'), pg_temp.cb_at(60,'15:00')),
  -- Shelby Arceneaux, 58 days ago: heat exhaustion, IV fluids.
  ('63000000-0000-4000-8000-000000001010','20000000-0000-4000-8000-000000000100','SEED-INC-1010','closed','injury','serious',
   pg_temp.cb_at(58,'15:40'), pg_temp.cb_at(58,'16:10'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(13), '20000000-0000-4000-8000-000000000001',
   'Heat exhaustion in dryer tower during afternoon drying run',
   'The seasonal dryer operator became dizzy and nauseated while pulling moisture samples on the third floor of the dryer tower. The outside heat index was 104 F and the tower was hotter. She had been on shift for seven hours without a water break since lunch.',
   'Moved to the air-conditioned control room, given water and cooled with wet towels. Symptoms did not improve within 20 minutes, so she was taken to the clinic and treated with IV fluids. Released the same evening; returned to work after two days off.',
   true, false, false,
   pg_temp.cb_at(58,'16:30'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(57,'09:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(44,'14:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(58,'16:10'), pg_temp.cb_at(44,'14:00')),
  -- Luis Hernandez, 52 days ago: lumbar strain lifting at the mill.
  ('63000000-0000-4000-8000-000000001003','20000000-0000-4000-8000-000000000100','SEED-INC-1003','closed','injury','moderate',
   pg_temp.cb_at(52,'10:20'), pg_temp.cb_at(52,'10:45'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(3), '20000000-0000-4000-8000-000000000001',
   'Lower back strain lifting 50 lb bags at bagging line 2',
   'The palletizer on bagging line 2 was down and mill operators were helping hand-stack 50 lb bags. While twisting to place a bag on the top layer of a pallet, the operator felt a sharp pain in his lower back and stopped work.',
   'Supervisor stopped hand stacking at that station. He was seen at the occupational clinic, prescribed a muscle relaxant and placed on restricted duty (no lifting over 15 lb) for two weeks.',
   true, false, false,
   pg_temp.cb_at(52,'11:05'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(51,'09:30'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(30,'15:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(52,'10:45'), pg_temp.cb_at(30,'15:00')),
  -- Earl Broussard, 33 days ago: hull fragment in eye.
  ('63000000-0000-4000-8000-000000001004','20000000-0000-4000-8000-000000000100','SEED-INC-1004','closed','injury','moderate',
   pg_temp.cb_at(33,'08:45'), pg_temp.cb_at(33,'09:15'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(3), '20000000-0000-4000-8000-000000000001',
   'Grain dust and hull fragment in eye at Dryer 2 discharge',
   'The dryer operator was knocking a hull bridge loose at the Dryer 2 discharge hopper when a burst of grain dust blew out of the open access door and got behind his safety glasses. His left eye was irritated and watering.',
   'Eye flushed at the eyewash station for 15 minutes. Irritation continued, so he was taken to the clinic, where a hull fragment was removed. He returned to work the next shift.',
   true, false, false,
   pg_temp.cb_at(33,'09:30'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(32,'10:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(18,'11:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(33,'09:15'), pg_temp.cb_at(18,'11:00')),
  -- Rhonda Lejeune, 24 days ago: metatarsal fracture at rail car loadout (under investigation).
  ('63000000-0000-4000-8000-000000001011','20000000-0000-4000-8000-000000000100','SEED-INC-1011','approved','injury','serious',
   pg_temp.cb_at(24,'14:05'), pg_temp.cb_at(24,'14:35'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(3), '20000000-0000-4000-8000-000000000001',
   'Fractured foot at rail car loadout',
   'While positioning the rail loading spout over a hopper car hatch, the spout counterweight chain slipped off its hook and the counterweight dropped onto the operator''s right foot. The strike landed behind the steel toe cap, over the metatarsals.',
   'Loading stopped and the spout locked out. Supervisor drove her to the clinic; X-ray showed a fracture of the third metatarsal. She is in a walking boot on restricted, seated duty.',
   true, false, false,
   pg_temp.cb_at(24,'15:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(23,'09:15'),'20000000-0000-4000-8000-000000000001', null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(24,'14:35'), pg_temp.cb_at(21,'10:30')),
  -- Tyrone Jackson, 15 days ago: minor abrasion, first aid only.
  ('63000000-0000-4000-8000-000000001012','20000000-0000-4000-8000-000000000100','SEED-INC-1012','closed','injury','minor',
   pg_temp.cb_at(15,'01:30'), pg_temp.cb_at(15,'01:50'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(4), null,
   'Abrasion to forearm on stretch wrapper turntable',
   'Packaging operator scraped his right forearm on the edge of the stretch wrapper turntable while pulling a torn film tail free.',
   'First aid only: abrasion cleaned and covered at the bagging line first aid station. Returned to work right away.',
   true, false, false,
   pg_temp.cb_at(15,'02:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(14,'09:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(12,'13:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(15,'01:50'), pg_temp.cb_at(12,'13:00')),
  -- Jamal Pierce, 4 days ago ~23:10: wrist strain, just reported.
  ('63000000-0000-4000-8000-000000001013','20000000-0000-4000-8000-000000000100','SEED-INC-1013','submitted','injury','minor',
   pg_temp.cb_at(4,'23:10'), pg_temp.cb_at(4,'23:40'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(4), null,
   'Wrist strain opening a seized slide gate on night shift',
   'Mill operator strained his right wrist forcing open a seized slide gate under the clean rice bin with the hand wheel.',
   'Wrist iced and wrapped at the mill office. He finished the shift on light tasks and will see the clinic if it is not better in two days. Maintenance work request entered to service the slide gate.',
   true, false, false,
   pg_temp.cb_at(4,'23:55'),'20000000-0000-4000-8000-000000000001', null, null, null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(4,'23:40'), pg_temp.cb_at(4,'23:55')),
  -- Serious near miss (LOTO)
  ('63000000-0000-4000-8000-000000001005','20000000-0000-4000-8000-000000000100','SEED-INC-1005','closed','near_miss','serious',
   pg_temp.cb_at(63,'10:15'), pg_temp.cb_at(63,'10:50'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(9), '20000000-0000-4000-8000-000000000001',
   'Drag conveyor restarted while a mechanic was preparing to clear a plug',
   'A maintenance technician opened the cover on Drag Conveyor 4 (rough rice to the dryers) to clear a plug. The conveyor had been stopped from the control room but was not locked out at the local disconnect. A dryer operator, unaware of the work, restarted the conveyor from the control room to clear the line. The technician had not yet reached into the conveyor and stepped back when the flights started moving.',
   'Conveyor stopped and locked out. All drag conveyor work paused until the crew reviewed the lockout procedure. Plant manager notified the same morning.',
   false, false, false,
   pg_temp.cb_at(63,'11:05'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(62,'09:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(38,'16:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(63,'10:50'), pg_temp.cb_at(38,'16:00')),
  -- Property damage (vehicle)
  ('63000000-0000-4000-8000-000000001006','20000000-0000-4000-8000-000000000100','SEED-INC-1006','closed','property_damage','moderate',
   pg_temp.cb_at(55,'07:10'), pg_temp.cb_at(55,'07:45'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(13), '20000000-0000-4000-8000-000000000001',
   'Grain truck struck truck scale canopy support post',
   'An inbound rough rice truck from a grower clipped the north canopy support post while pulling onto the inbound truck scale. The post was bent about 4 inches out of plumb; the canopy stayed supported. The driver was not hurt.',
   'Inbound scale closed and trucks routed across the outbound scale. Maintenance shored the canopy, and a structural contractor inspected it the same day.',
   false, true, true,
   pg_temp.cb_at(55,'08:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(54,'13:30'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(40,'10:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(55,'07:45'), pg_temp.cb_at(40,'10:00')),
  -- Spill
  ('63000000-0000-4000-8000-000000001007','20000000-0000-4000-8000-000000000100','SEED-INC-1007','closed','environmental','minor',
   pg_temp.cb_at(34,'13:30'), pg_temp.cb_at(34,'14:05'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(19), '20000000-0000-4000-8000-000000000001',
   'Hydraulic oil leak from rail car puller at loadout',
   'A hydraulic hose on the rail car puller failed while positioning a hopper car and released about 5 gallons of hydraulic oil onto the ballast and concrete pad at the rail loadout. No oil reached the storm drain or the ditch.',
   'Puller shut down. Spill contained with absorbent socks and pads from the loadout spill kit. Contaminated ballast removed and drummed for disposal. Hose replaced before the puller returned to service.',
   false, false, false,
   pg_temp.cb_at(34,'14:20'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(33,'09:10'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(20,'11:00'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(34,'14:05'), pg_temp.cb_at(20,'11:00')),
  -- Dust fire, extinguished
  ('63000000-0000-4000-8000-000000001008','20000000-0000-4000-8000-000000000100','SEED-INC-1008','approved','property_damage','serious',
   pg_temp.cb_at(21,'03:30'), pg_temp.cb_at(21,'04:15'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(4), '20000000-0000-4000-8000-000000000001',
   'Small dust fire on Dryer 2 burner housing extinguished by operator',
   'During a night drying run the dryer operator saw smoke and a small flame on top of the Dryer 2 burner housing. The fire was in a layer of rice dust that had built up on the housing. Some wiring insulation on the burner junction box was heat damaged.',
   'Operator shut down the burner and fans with the dryer E-stop and put out the fire with a 20 lb ABC extinguisher. Night supervisor responded; fire department not needed. Dryer stayed down until the housing was cleaned and the lead electrician inspected and repaired the burner wiring.',
   false, false, true,
   pg_temp.cb_at(21,'04:40'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(20,'08:45'),'20000000-0000-4000-8000-000000000001', null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(21,'04:15'), pg_temp.cb_at(20,'08:45')),
  -- Recent near miss reported by the demo user
  ('63000000-0000-4000-8000-000000001009','20000000-0000-4000-8000-000000000100','SEED-INC-1009','submitted','near_miss','minor',
   pg_temp.cb_at(2,'10:10'), pg_temp.cb_at(2,'10:30'),
   '20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000600', null,
   'Slip on spilled brown rice near Huller 3',
   'Brown rice leaked from a cracked spout coupling under Huller 3 and spread across the walkway. An operator walking through slipped but caught the handrail and did not fall.',
   'Area swept and barricaded. Maintenance work request entered for the cracked spout coupling.',
   false, false, false,
   pg_temp.cb_at(2,'10:45'),'20000000-0000-4000-8000-000000000002', null, null, null, null,
   '20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002', pg_temp.cb_at(2,'10:30'), pg_temp.cb_at(2,'10:45'))
on conflict (id) do nothing;

-- Incident numbers in report order, per year (INC-YYYY-NNNNNN), then advance the sequence.
with ranked as (
  select id,
         extract(year from reported_at)::int as yr,
         row_number() over (partition by extract(year from reported_at) order by reported_at, id) as rn
  from public.forge_incidents
  where id = '20000000-0000-4000-8000-000000000801'
     or id::text like '63000000-0000-4000-8000-0000000010__'
)
update public.forge_incidents i
set incident_number = 'INC-' || r.yr || '-' || lpad(r.rn::text, 6, '0')
from ranked r
where i.id = r.id;

insert into public.forge_incident_sequences (organization_id, incident_year, next_value)
select organization_id, split_part(incident_number, '-', 2)::int, max(split_part(incident_number, '-', 3)::int) + 1
from public.forge_incidents
where organization_id = '20000000-0000-4000-8000-000000000100'
  and incident_number ~ '^INC-[0-9]{4}-[0-9]{6}$'
group by 1, 2
on conflict (organization_id, incident_year)
do update set next_value = greatest(public.forge_incident_sequences.next_value, excluded.next_value);

-- People involved.
insert into public.forge_incident_people (id, organization_id, incident_id, personnel_id, role, notes, created_by, created_at)
values
  ('63000000-0000-4000-8000-000000001101','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000801', pg_temp.cb_p(19),'involved','Forklift operator backing out of the trailer.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(11,'09:20')),
  ('63000000-0000-4000-8000-000000001102','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000801', pg_temp.cb_p(20),'involved','Pedestrian. Not injured.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(11,'09:20')),
  ('63000000-0000-4000-8000-000000001103','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000801', pg_temp.cb_p(3),'supervisor',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(11,'09:20')),
  ('63000000-0000-4000-8000-000000001104','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000801', pg_temp.cb_p(2),'investigator',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(11,'09:20')),

  ('63000000-0000-4000-8000-000000001105','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001002', pg_temp.cb_p(9),'reporter','Lead electrician; drove him to the clinic.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(78,'10:05')),
  ('63000000-0000-4000-8000-000000001106','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001002', pg_temp.cb_p(10),'injured','6 sutures at the occupational clinic.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(78,'10:05')),
  ('63000000-0000-4000-8000-000000001107','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001002', pg_temp.cb_p(2),'investigator',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(77,'08:15')),

  ('63000000-0000-4000-8000-000000001108','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001003', pg_temp.cb_p(3),'reporter','Day shift supervisor.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(52,'10:45')),
  ('63000000-0000-4000-8000-000000001109','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001003', pg_temp.cb_p(5),'injured','Clinic visit, prescription medication, restricted duty for two weeks.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(52,'10:45')),
  ('63000000-0000-4000-8000-000000001110','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001003', pg_temp.cb_p(20),'witness','Was stacking on the same pallet.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(52,'10:45')),
  ('63000000-0000-4000-8000-000000001111','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001003', pg_temp.cb_p(2),'investigator',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(51,'09:30')),

  ('63000000-0000-4000-8000-000000001112','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001004', pg_temp.cb_p(3),'reporter',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(33,'09:15')),
  ('63000000-0000-4000-8000-000000001113','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001004', pg_temp.cb_p(13),'injured','Hull fragment removed at the clinic.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(33,'09:15')),

  ('63000000-0000-4000-8000-000000001127','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001010', pg_temp.cb_p(13),'reporter','Lead dryer operator.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(58,'16:10')),
  ('63000000-0000-4000-8000-000000001128','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001010', pg_temp.cb_p(14),'injured','Treated at the clinic with IV fluids; two days off.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(58,'16:10')),
  ('63000000-0000-4000-8000-000000001129','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001010', pg_temp.cb_p(24),'investigator',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(57,'09:00')),

  ('63000000-0000-4000-8000-000000001130','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001011', pg_temp.cb_p(3),'reporter',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(24,'14:35')),
  ('63000000-0000-4000-8000-000000001131','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001011', pg_temp.cb_p(18),'injured','Third metatarsal fracture; walking boot, restricted seated duty.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(24,'14:35')),
  ('63000000-0000-4000-8000-000000001132','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001011', pg_temp.cb_p(19),'witness','Was operating the car puller.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(24,'14:35')),
  ('63000000-0000-4000-8000-000000001133','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001011', pg_temp.cb_p(2),'investigator',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(23,'09:15')),

  ('63000000-0000-4000-8000-000000001134','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001012', pg_temp.cb_p(4),'reporter',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(15,'01:50')),
  ('63000000-0000-4000-8000-000000001135','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001012', pg_temp.cb_p(21),'injured','First aid only.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(15,'01:50')),

  ('63000000-0000-4000-8000-000000001136','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001013', pg_temp.cb_p(4),'reporter','Night shift supervisor.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(4,'23:40')),
  ('63000000-0000-4000-8000-000000001137','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001013', pg_temp.cb_p(8),'injured','Iced and wrapped on site.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(4,'23:40')),

  ('63000000-0000-4000-8000-000000001114','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001005', pg_temp.cb_p(9),'reporter',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(63,'10:50')),
  ('63000000-0000-4000-8000-000000001115','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001005', pg_temp.cb_p(11),'involved','Technician preparing to clear the plug.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(63,'10:50')),
  ('63000000-0000-4000-8000-000000001116','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001005', pg_temp.cb_p(15),'involved','Restarted the conveyor from the control room.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(63,'10:50')),
  ('63000000-0000-4000-8000-000000001117','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001005', pg_temp.cb_p(2),'investigator',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(62,'09:00')),

  ('63000000-0000-4000-8000-000000001118','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001006', pg_temp.cb_p(13),'reporter',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(55,'07:45')),
  ('63000000-0000-4000-8000-000000001119','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001006', pg_temp.cb_p(23),'witness','Waiting in line at the inbound scale.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(55,'07:45')),

  ('63000000-0000-4000-8000-000000001120','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001007', pg_temp.cb_p(19),'reporter',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(34,'14:05')),
  ('63000000-0000-4000-8000-000000001121','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001007', pg_temp.cb_p(10),'involved','Replaced the failed hose and led cleanup.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(34,'14:05')),

  ('63000000-0000-4000-8000-000000001122','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001008', pg_temp.cb_p(4),'reporter',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(21,'04:15')),
  ('63000000-0000-4000-8000-000000001123','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001008', pg_temp.cb_p(13),'involved','Dryer operator; put out the fire.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(21,'04:15')),
  ('63000000-0000-4000-8000-000000001124','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001008', pg_temp.cb_p(2),'investigator',null,'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(20,'08:45')),

  ('63000000-0000-4000-8000-000000001125','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001009','20000000-0000-4000-8000-000000000600','reporter',null,'20000000-0000-4000-8000-000000000002', pg_temp.cb_at(2,'10:30')),
  ('63000000-0000-4000-8000-000000001126','20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000001009', pg_temp.cb_p(5),'involved','Slipped; caught the handrail. Not injured.','20000000-0000-4000-8000-000000000002', pg_temp.cb_at(2,'10:30'))
on conflict (id) do nothing;

-- Incident activity (same types/messages the incident server actions write).
insert into public.forge_incident_activity (organization_id, incident_id, activity_type, message, actor_user_id, created_at)
select '20000000-0000-4000-8000-000000000100'::uuid, v.incident_id::uuid, v.activity_type, v.message, v.actor::uuid, v.at
from (values
  ('63000000-0000-4000-8000-000000001002','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(78,'10:05')),
  ('63000000-0000-4000-8000-000000001002','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(78,'10:30')),
  ('63000000-0000-4000-8000-000000001002','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(77,'08:15')),
  ('63000000-0000-4000-8000-000000001002','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(60,'15:00')),

  ('63000000-0000-4000-8000-000000001003','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(52,'10:45')),
  ('63000000-0000-4000-8000-000000001003','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(52,'11:05')),
  ('63000000-0000-4000-8000-000000001003','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(51,'09:30')),
  ('63000000-0000-4000-8000-000000001003','updated','Incident details updated.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(49,'14:10')),
  ('63000000-0000-4000-8000-000000001003','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(30,'15:00')),

  ('63000000-0000-4000-8000-000000001004','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(33,'09:15')),
  ('63000000-0000-4000-8000-000000001004','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(33,'09:30')),
  ('63000000-0000-4000-8000-000000001004','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(32,'10:00')),
  ('63000000-0000-4000-8000-000000001004','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(18,'11:00')),

  ('63000000-0000-4000-8000-000000001010','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(58,'16:10')),
  ('63000000-0000-4000-8000-000000001010','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(58,'16:30')),
  ('63000000-0000-4000-8000-000000001010','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(57,'09:00')),
  ('63000000-0000-4000-8000-000000001010','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(44,'14:00')),

  ('63000000-0000-4000-8000-000000001011','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(24,'14:35')),
  ('63000000-0000-4000-8000-000000001011','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(24,'15:00')),
  ('63000000-0000-4000-8000-000000001011','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(23,'09:15')),
  ('63000000-0000-4000-8000-000000001011','updated','Incident details updated.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(21,'10:30')),

  ('63000000-0000-4000-8000-000000001012','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(15,'01:50')),
  ('63000000-0000-4000-8000-000000001012','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(15,'02:00')),
  ('63000000-0000-4000-8000-000000001012','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(14,'09:00')),
  ('63000000-0000-4000-8000-000000001012','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(12,'13:00')),

  ('63000000-0000-4000-8000-000000001013','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(4,'23:40')),
  ('63000000-0000-4000-8000-000000001013','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(4,'23:55')),

  ('63000000-0000-4000-8000-000000001005','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(63,'10:50')),
  ('63000000-0000-4000-8000-000000001005','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(63,'11:05')),
  ('63000000-0000-4000-8000-000000001005','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(62,'09:00')),
  ('63000000-0000-4000-8000-000000001005','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(38,'16:00')),

  ('63000000-0000-4000-8000-000000001006','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(55,'07:45')),
  ('63000000-0000-4000-8000-000000001006','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(55,'08:00')),
  ('63000000-0000-4000-8000-000000001006','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(54,'13:30')),
  ('63000000-0000-4000-8000-000000001006','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(40,'10:00')),

  ('63000000-0000-4000-8000-000000001007','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(34,'14:05')),
  ('63000000-0000-4000-8000-000000001007','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(34,'14:20')),
  ('63000000-0000-4000-8000-000000001007','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(33,'09:10')),
  ('63000000-0000-4000-8000-000000001007','closed','Incident closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(20,'11:00')),

  ('63000000-0000-4000-8000-000000001008','created','Incident created as draft.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(21,'04:15')),
  ('63000000-0000-4000-8000-000000001008','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(21,'04:40')),
  ('63000000-0000-4000-8000-000000001008','approved','Incident approved.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(20,'08:45')),

  ('63000000-0000-4000-8000-000000001009','created','Incident created as draft.','20000000-0000-4000-8000-000000000002', pg_temp.cb_at(2,'10:30')),
  ('63000000-0000-4000-8000-000000001009','submitted','Incident submitted for review.','20000000-0000-4000-8000-000000000002', pg_temp.cb_at(2,'10:45'))
) as v(incident_id, activity_type, message, actor, at);

-- =============================================================================
-- INSPECTION TEMPLATES
-- =============================================================================

update public.forge_inspection_templates
set
  template_key = 'plant_safety_walkthrough',
  name = 'Monthly Plant Safety Walkthrough',
  description = 'Monthly walkthrough of exits, extinguishers, walking surfaces and PPE in each department.',
  inspection_type = 'general',
  is_active = true,
  created_at = pg_temp.cb_at(120, '09:00'),
  updated_at = pg_temp.cb_at(120, '09:00')
where id = '20000000-0000-4000-8000-000000000901';

update public.forge_inspection_template_items
set created_at = pg_temp.cb_at(120, '09:00'), updated_at = pg_temp.cb_at(120, '09:00')
where template_id = '20000000-0000-4000-8000-000000000901';

insert into public.forge_inspection_templates (id, organization_id, template_key, name, description, inspection_type, version, is_active, created_by, updated_by, created_at, updated_at)
values
  ('63000000-0000-4000-8000-000000000202','20000000-0000-4000-8000-000000000100','forklift_pre_shift','Forklift Pre-Shift Inspection','Operator check completed at the start of every shift before a forklift is used.','vehicle',1,true,'20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(120,'09:30'), pg_temp.cb_at(120,'09:30')),
  ('63000000-0000-4000-8000-000000000203','20000000-0000-4000-8000-000000000100','fire_extinguisher_monthly','Monthly Fire Extinguisher Inspection','Monthly visual check of every portable extinguisher on the plant route.','fire_life_safety',1,true,'20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(120,'10:00'), pg_temp.cb_at(120,'10:00')),
  ('63000000-0000-4000-8000-000000000204','20000000-0000-4000-8000-000000000100','elevator_conveyor_guarding','Bucket Elevator & Conveyor Guarding Inspection','Monthly check of guards, inspection doors, stop controls and hazard monitoring on bucket elevators, drag and screw conveyors.','equipment',1,true,'20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(120,'10:30'), pg_temp.cb_at(120,'10:30')),
  ('63000000-0000-4000-8000-000000000205','20000000-0000-4000-8000-000000000100','combustible_dust_housekeeping','Combustible Dust Housekeeping Inspection','Check of dust accumulation, leaks and dust controls in milling, hulling and drying areas.','housekeeping',1,true,'20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(120,'11:00'), pg_temp.cb_at(120,'11:00'))
on conflict (id) do nothing;

insert into public.forge_inspection_template_items (id, organization_id, template_id, item_key, section_key, section_label, prompt, guidance, response_type, sort_order, is_required, finding_on, created_at, updated_at)
select v.id::uuid, '20000000-0000-4000-8000-000000000100'::uuid, v.template_id::uuid, v.item_key, v.section_key, v.section_label, v.prompt, v.guidance,
       v.response_type, v.sort_order, v.is_required, v.finding_on::text[], t.created_at, t.created_at
from (values
  -- Forklift pre-shift
  ('63000000-0000-4000-8000-000000002201','63000000-0000-4000-8000-000000000202','forks_chains','visual','Visual Check','Forks, carriage and lift chains are free of cracks, bends and excessive wear.','Look at fork heels and tips, chain links and anchor pins.','pass_fail_na',10,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002202','63000000-0000-4000-8000-000000000202','fluid_leaks','visual','Visual Check','No hydraulic, fuel or LP leaks under or around the truck.','Check the floor where the truck was parked and the mast cylinders.','pass_fail_na',20,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002203','63000000-0000-4000-8000-000000000202','lp_cylinder','visual','Visual Check','LP cylinder is secured and the valve, hose and fittings are undamaged.','Bracket latched, locating pin seated, no frost or odor at the fittings.','pass_fail_na',30,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002204','63000000-0000-4000-8000-000000000202','data_plate','visual','Visual Check','Data plate is present and legible.',null,'yes_no_na',40,true,'{no}'),
  ('63000000-0000-4000-8000-000000002205','63000000-0000-4000-8000-000000000202','horn_alarm_lights','operational','Operational Check','Horn, backup alarm, strobe and lights work.','Test the backup alarm by shifting into reverse with the brake applied.','pass_fail_na',50,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002206','63000000-0000-4000-8000-000000000202','brakes','operational','Operational Check','Service brake and parking brake hold.',null,'pass_fail_na',60,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002207','63000000-0000-4000-8000-000000000202','seat_belt','operational','Operational Check','Seat belt latches and retracts; seat switch works.',null,'pass_fail_na',70,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002208','63000000-0000-4000-8000-000000000202','hour_meter','operational','Operational Check','Hour meter reading.',null,'number',80,false,'{}'),
  -- Monthly fire extinguisher
  ('63000000-0000-4000-8000-000000002301','63000000-0000-4000-8000-000000000203','mounted_accessible','extinguisher','Extinguisher Condition','Extinguisher is mounted, visible and not blocked (36 in. clear in front).',null,'pass_fail_na',10,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002302','63000000-0000-4000-8000-000000000203','gauge_green','extinguisher','Extinguisher Condition','Pressure gauge reads in the operable (green) range.',null,'pass_fail_na',20,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002303','63000000-0000-4000-8000-000000000203','pin_seal','extinguisher','Extinguisher Condition','Pull pin and tamper seal are intact.',null,'pass_fail_na',30,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002304','63000000-0000-4000-8000-000000000203','body_hose','extinguisher','Extinguisher Condition','Cylinder, hose and nozzle are free of damage, corrosion and dust buildup.','Wipe dust off units in the mill and dryer tower.','pass_fail_na',40,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002305','63000000-0000-4000-8000-000000000203','tag_initialed','documentation','Documentation','Monthly inspection tag is dated and initialed.',null,'yes_no_na',50,true,'{no}'),
  ('63000000-0000-4000-8000-000000002306','63000000-0000-4000-8000-000000000203','units_checked','documentation','Documentation','Number of extinguishers checked on this route.',null,'number',60,false,'{}'),
  -- Bucket elevator & conveyor guarding
  ('63000000-0000-4000-8000-000000002401','63000000-0000-4000-8000-000000000204','head_boot_guards','guarding','Guarding','Head and boot pulley guards are in place and secured on all bucket elevators.',null,'pass_fail_na',10,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002402','63000000-0000-4000-8000-000000000204','conveyor_covers','guarding','Guarding','Drag and screw conveyor covers and tail shaft guards are installed and bolted.','Covers must need a tool to remove.','pass_fail_na',20,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002403','63000000-0000-4000-8000-000000000204','inspection_doors','guarding','Guarding','Inspection doors are closed and latched.',null,'pass_fail_na',30,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002404','63000000-0000-4000-8000-000000000204','stop_controls','controls','Controls & Monitoring','Pull cords and E-stops tested and stop the equipment.',null,'pass_fail_na',40,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002405','63000000-0000-4000-8000-000000000204','hazard_monitoring','controls','Controls & Monitoring','Bearing temperature, belt alignment and speed sensors read normal on the hazard monitoring panel.',null,'pass_fail_na',50,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002406','63000000-0000-4000-8000-000000000204','belt_tracking','controls','Controls & Monitoring','Elevator belts track centered with no rubbing on the leg casing.',null,'pass_fail_na',60,true,'{fail}'),
  -- Combustible dust housekeeping
  ('63000000-0000-4000-8000-000000002501','63000000-0000-4000-8000-000000000205','floor_equipment','accumulation','Dust Accumulation','Floors and equipment tops are free of dust layers deeper than 1/32 in.','A layer you can write your name in is too deep.','pass_fail_na',10,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002502','63000000-0000-4000-8000-000000000205','overhead_surfaces','accumulation','Dust Accumulation','Beams, ledges and overhead surfaces were cleaned per the weekly schedule.',null,'pass_fail_na',20,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002503','63000000-0000-4000-8000-000000000205','dust_leaks','accumulation','Dust Accumulation','No visible dust leaks at spouts, transitions or conveyor covers.',null,'pass_fail_na',30,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002504','63000000-0000-4000-8000-000000000205','baghouse_dp','controls','Controls','Baghouse differential pressure is in the normal operating range.',null,'pass_fail_na',40,true,'{fail}'),
  ('63000000-0000-4000-8000-000000002505','63000000-0000-4000-8000-000000000205','cleaning_method','controls','Controls','Cleaning is done with approved vacuums or sweeping; no compressed-air blowdown in operating areas.',null,'yes_no_na',50,true,'{no}'),
  ('63000000-0000-4000-8000-000000002506','63000000-0000-4000-8000-000000000205','hot_work','controls','Controls','No hot work underway in the area without a permit and fire watch.',null,'yes_no_na',60,true,'{no}')
) as v(id, template_id, item_key, section_key, section_label, prompt, guidance, response_type, sort_order, is_required, finding_on)
join public.forge_inspection_templates t on t.id = v.template_id::uuid
on conflict (id) do nothing;

-- =============================================================================
-- INSPECTIONS
-- =============================================================================

-- Seeded walkthrough (DEMO-INSP-000001): bagging warehouse, four days ago. Renumbered below.
update public.forge_inspections
set
  template_name_snapshot = 'Monthly Plant Safety Walkthrough',
  status = 'approved',
  inspection_date = pg_temp.cb_day(4),
  result = 'fail',
  notes = 'Monthly walkthrough of the bagging warehouse, dock doors 1-6 and the rail loadout.',
  started_at = pg_temp.cb_at(4, '08:35'),
  completed_at = pg_temp.cb_at(4, '10:15'),
  submitted_at = pg_temp.cb_at(4, '10:15'),
  approved_at = pg_temp.cb_at(3, '14:00'),
  created_at = pg_temp.cb_at(4, '08:30'),
  updated_at = pg_temp.cb_at(3, '14:00'),
  updated_by = '20000000-0000-4000-8000-000000000001'
where id = '20000000-0000-4000-8000-000000000950';

update public.forge_inspection_items
set
  responded_at = pg_temp.cb_at(4, '08:35') + (sort_order * interval '2 minutes'),
  created_at = pg_temp.cb_at(4, '08:30'),
  notes = case item_key
    when 'walkways_clear' then 'Pallets of bagged product staged in the main aisle near dock door 4; walkway narrowed to about 30 inches.'
    when 'extinguishers_accessible' then 'All 9 units on the warehouse route accessible.'
    else notes end
where inspection_id = '20000000-0000-4000-8000-000000000950';

update public.forge_inspection_findings
set
  title = 'Pallets staged in main warehouse aisle',
  description = 'Bagged product staged in the main aisle near dock door 4 narrowed the walkway to about 30 inches. This is the same area as the dock door 4 forklift near miss.',
  severity = 'moderate',
  status = 'in_progress',
  due_date = pg_temp.cb_day(-3),
  corrective_action = 'Move staged pallets, repaint aisle and walkway lines at doors 3-5, and mark an overflow staging area by the north wall.',
  created_at = pg_temp.cb_at(4, '09:20'),
  updated_at = pg_temp.cb_at(3, '14:20'),
  updated_by = '20000000-0000-4000-8000-000000000001'
where id = '20000000-0000-4000-8000-000000000960';

update public.forge_inspection_activity a
set message = v.message, created_at = v.at
from (values
  ('created', 'Inspection created from template Monthly Plant Safety Walkthrough.', pg_temp.cb_at(4, '08:30')),
  ('finding_created', 'Finding created: Pallets staged in main warehouse aisle', pg_temp.cb_at(4, '09:20')),
  ('approved', 'Inspection approved.', pg_temp.cb_at(3, '14:00'))
) as v(activity_type, message, at)
where a.inspection_id = '20000000-0000-4000-8000-000000000950'
  and a.activity_type = v.activity_type;

update public.forge_inspection_activity
set metadata = jsonb_build_object('finding_id', '20000000-0000-4000-8000-000000000960', 'severity', 'moderate')
where inspection_id = '20000000-0000-4000-8000-000000000950' and activity_type = 'finding_created';

insert into public.forge_inspection_activity (organization_id, inspection_id, activity_type, message, actor_user_id, created_at)
values ('20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000950','submitted','Inspection submitted for review.','20000000-0000-4000-8000-000000000002', pg_temp.cb_at(4, '10:15'));

insert into public.forge_inspections (
  id, organization_id, inspection_number, template_id, template_name_snapshot, template_version_snapshot, status,
  inspection_date, location_id, division_id, inspector_user_id, inspector_personnel_id, result, notes,
  started_at, completed_at, submitted_at, submitted_by, approved_at, approved_by, closed_at, closed_by,
  created_by, updated_by, created_at, updated_at
)
values
  ('63000000-0000-4000-8000-000000003002','20000000-0000-4000-8000-000000000100','SEED-INSP-3002','63000000-0000-4000-8000-000000000202','Forklift Pre-Shift Inspection',1,'closed',
   pg_temp.cb_day(60),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(18),'pass','Warehouse forklift, first shift.',
   pg_temp.cb_at(60,'06:00'), pg_temp.cb_at(60,'06:15'), pg_temp.cb_at(60,'06:15'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(59,'08:30'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(59,'08:35'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(60,'05:55'), pg_temp.cb_at(59,'08:35')),
  ('63000000-0000-4000-8000-000000003003','20000000-0000-4000-8000-000000000100','SEED-INSP-3003','63000000-0000-4000-8000-000000000202','Forklift Pre-Shift Inspection',1,'approved',
   pg_temp.cb_day(6),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(19),'fail','Warehouse forklift, first shift. Truck tagged out after the check.',
   pg_temp.cb_at(6,'05:55'), pg_temp.cb_at(6,'06:20'), pg_temp.cb_at(6,'06:20'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(6,'10:40'),'20000000-0000-4000-8000-000000000001', null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(6,'05:50'), pg_temp.cb_at(3,'15:30')),
  ('63000000-0000-4000-8000-000000003004','20000000-0000-4000-8000-000000000100','SEED-INSP-3004','63000000-0000-4000-8000-000000000203','Monthly Fire Extinguisher Inspection',1,'closed',
   pg_temp.cb_day(35),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(24),'fail','September route: mill, dryer tower, warehouse, shop and office.',
   pg_temp.cb_at(35,'09:05'), pg_temp.cb_at(35,'11:30'), pg_temp.cb_at(35,'11:30'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(34,'08:15'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(30,'10:30'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(35,'09:00'), pg_temp.cb_at(30,'10:30')),
  ('63000000-0000-4000-8000-000000003005','20000000-0000-4000-8000-000000000100','SEED-INSP-3005','63000000-0000-4000-8000-000000000203','Monthly Fire Extinguisher Inspection',1,'in_progress',
   pg_temp.cb_day(2),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(24),null,'October route: mill, dryer tower, warehouse, shop and office.',
   pg_temp.cb_at(2,'13:00'), null, null, null, null, null, null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(2,'12:50'), pg_temp.cb_at(2,'13:40')),
  ('63000000-0000-4000-8000-000000003006','20000000-0000-4000-8000-000000000100','SEED-INSP-3006','63000000-0000-4000-8000-000000000204','Bucket Elevator & Conveyor Guarding Inspection',1,'approved',
   pg_temp.cb_day(25),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(11),'fail','Mill and dryer elevators, Drag Conveyors 1-6, screw conveyors under the hullers.',
   pg_temp.cb_at(25,'13:10'), pg_temp.cb_at(25,'15:20'), pg_temp.cb_at(25,'15:20'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(24,'09:45'),'20000000-0000-4000-8000-000000000001', null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(25,'13:00'), pg_temp.cb_at(24,'11:00')),
  ('63000000-0000-4000-8000-000000003007','20000000-0000-4000-8000-000000000100','SEED-INSP-3007','63000000-0000-4000-8000-000000000205','Combustible Dust Housekeeping Inspection',1,'closed',
   pg_temp.cb_day(47),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(2),'pass','Huller floor, whitener room, dryer tower ground floor and baghouse.',
   pg_temp.cb_at(47,'07:35'), pg_temp.cb_at(47,'09:10'), pg_temp.cb_at(47,'09:10'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(46,'10:00'),'20000000-0000-4000-8000-000000000001', pg_temp.cb_at(46,'10:05'),'20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(47,'07:30'), pg_temp.cb_at(46,'10:05')),
  ('63000000-0000-4000-8000-000000003008','20000000-0000-4000-8000-000000000100','SEED-INSP-3008','63000000-0000-4000-8000-000000000205','Combustible Dust Housekeeping Inspection',1,'submitted',
   pg_temp.cb_day(5),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(2),'fail','Huller floor, whitener room, dryer tower ground floor and baghouse.',
   pg_temp.cb_at(5,'13:35'), pg_temp.cb_at(5,'15:30'), pg_temp.cb_at(5,'15:30'),'20000000-0000-4000-8000-000000000001', null, null, null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(5,'13:30'), pg_temp.cb_at(5,'15:30')),
  -- Scheduled but not started; inspection date has passed (overdue).
  ('63000000-0000-4000-8000-000000003009','20000000-0000-4000-8000-000000000100','SEED-INSP-3009','63000000-0000-4000-8000-000000000204','Bucket Elevator & Conveyor Guarding Inspection',1,'draft',
   pg_temp.cb_day(5),'20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','20000000-0000-4000-8000-000000000001', pg_temp.cb_p(11),null,'Receiving pit elevators and dryer feed drag conveyors.',
   null, null, null, null, null, null, null, null,
   '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(12,'08:00'), pg_temp.cb_at(12,'08:00'))
on conflict (id) do nothing;

-- Checklist snapshot from each template (what createInspection copies).
insert into public.forge_inspection_items (
  id, organization_id, inspection_id, template_item_id, item_key, section_key, section_label, prompt, guidance,
  response_type, sort_order, is_required, finding_on, created_at
)
select
  ('63000000-0000-4000-8000-0000003' || lpad(right(i.id::text, 3), 3, '0')
     || lpad((row_number() over (partition by i.id order by ti.sort_order))::text, 2, '0'))::uuid,
  i.organization_id, i.id, ti.id, ti.item_key, ti.section_key, ti.section_label, ti.prompt, ti.guidance,
  ti.response_type, ti.sort_order, ti.is_required, ti.finding_on, i.created_at
from public.forge_inspections i
join public.forge_inspection_template_items ti on ti.template_id = i.template_id
where i.id::text like '63000000-0000-4000-8000-00000000300_'
on conflict (id) do nothing;

-- Answers: completed inspections pass everything unless overridden below.
update public.forge_inspection_items it
set
  response_value = case it.response_type when 'pass_fail_na' then 'pass' when 'yes_no_na' then 'yes' else null end,
  responded_by = i.created_by,
  responded_at = i.started_at + (it.sort_order * interval '1 minute')
from public.forge_inspections i
where it.inspection_id = i.id
  and i.id in ('63000000-0000-4000-8000-000000003002','63000000-0000-4000-8000-000000003003','63000000-0000-4000-8000-000000003004',
               '63000000-0000-4000-8000-000000003006','63000000-0000-4000-8000-000000003007','63000000-0000-4000-8000-000000003008');

-- October extinguisher route is part way done.
update public.forge_inspection_items it
set response_value = 'pass', responded_by = i.created_by, responded_at = i.started_at + (it.sort_order * interval '1 minute')
from public.forge_inspections i
where it.inspection_id = i.id and i.id = '63000000-0000-4000-8000-000000003005' and it.sort_order <= 30;

update public.forge_inspection_items it
set response_value = v.response_value, notes = v.notes
from (values
  ('63000000-0000-4000-8000-000000003002','hour_meter','6412',null),
  ('63000000-0000-4000-8000-000000003003','horn_alarm_lights','fail','Backup alarm does not sound in reverse. Horn and strobe OK. Truck tagged out of service.'),
  ('63000000-0000-4000-8000-000000003003','hour_meter','6588',null),
  ('63000000-0000-4000-8000-000000003004','mounted_accessible','fail','Dryer tower ground floor: pallet of spare dryer parts set in front of the extinguisher.'),
  ('63000000-0000-4000-8000-000000003004','body_hose','pass','Wiped dust off the units in the dryer tower.'),
  ('63000000-0000-4000-8000-000000003004','units_checked','42',null),
  ('63000000-0000-4000-8000-000000003006','conveyor_covers','fail','Drag Conveyor 6 tail shaft guard missing; conveyor locked out.'),
  ('63000000-0000-4000-8000-000000003007','baghouse_dp','pass','Main baghouse at 4.1 in. w.c.'),
  ('63000000-0000-4000-8000-000000003008','overhead_surfaces','fail','Visible dust layer on the beams above Hullers 1-4, roughly 1/8 in.'),
  ('63000000-0000-4000-8000-000000003008','baghouse_dp','pass','Main baghouse at 4.4 in. w.c.')
) as v(inspection_id, item_key, response_value, notes)
where it.inspection_id = v.inspection_id::uuid and it.item_key = v.item_key;

-- Findings.
insert into public.forge_inspection_findings (
  id, organization_id, inspection_id, inspection_item_id, title, description, severity, status, due_date,
  corrective_action, verification_notes, closed_at, closed_by, created_by, updated_by, created_at, updated_at
)
select v.id::uuid, '20000000-0000-4000-8000-000000000100'::uuid, v.inspection_id::uuid, it.id, v.title, v.description, v.severity, v.status, v.due_date,
       v.corrective_action, v.verification_notes, v.closed_at, v.closed_by::uuid,
       '20000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, v.created_at, v.updated_at
from (values
  ('63000000-0000-4000-8000-000000003203','63000000-0000-4000-8000-000000003003','horn_alarm_lights',
   'Backup alarm inoperative on warehouse forklift',
   'Backup alarm did not sound in reverse during the pre-shift check. Truck was tagged out of service.',
   'high','pending_verification', pg_temp.cb_day(2),
   'Maintenance replaced the backup alarm. Operator to confirm it works on the next pre-shift check before the tag is removed.',
   null, null::timestamptz, null, pg_temp.cb_at(6,'06:05'), pg_temp.cb_at(3,'15:30')),
  ('63000000-0000-4000-8000-000000003204','63000000-0000-4000-8000-000000003004','mounted_accessible',
   'Extinguisher blocked by pallet at dryer tower',
   'A pallet of spare dryer parts was set directly in front of the dryer tower ground-floor extinguisher.',
   'moderate','closed', pg_temp.cb_day(32),
   'Move the pallet and paint a keep-clear box on the floor under the extinguisher.',
   'Pallet moved to the parts cage; red keep-clear box painted. Checked clear on two later walk-throughs.', pg_temp.cb_at(31,'09:30'), '20000000-0000-4000-8000-000000000001',
   pg_temp.cb_at(35,'09:40'), pg_temp.cb_at(31,'09:30')),
  ('63000000-0000-4000-8000-000000003206','63000000-0000-4000-8000-000000003006','conveyor_covers',
   'Tail shaft guard missing on Drag Conveyor 6',
   'The tail shaft guard on Drag Conveyor 6 was not reinstalled after an August bearing replacement. The rotating shaft and sprocket were exposed.',
   'high','in_progress', pg_temp.cb_day(4),
   'Drag Conveyor 6 locked and tagged out. Fabricate and install a bolted expanded-metal guard before returning it to service.',
   null, null::timestamptz, null, pg_temp.cb_at(25,'13:55'), pg_temp.cb_at(24,'11:00')),
  ('63000000-0000-4000-8000-000000003208','63000000-0000-4000-8000-000000003008','overhead_surfaces',
   'Dust buildup on beams above huller floor',
   'Visible dust layer of about 1/8 in. on the overhead beams above Hullers 1-4. These beams are not on the weekly cleaning route.',
   'moderate','pending_verification', pg_temp.cb_day(-1),
   'Vacuum the beams above Hullers 1-4 and add the overhead beams to the weekly cleaning route.',
   null, null::timestamptz, null, pg_temp.cb_at(5,'14:20'), pg_temp.cb_at(2,'14:30'))
) as v(id, inspection_id, item_key, title, description, severity, status, due_date, corrective_action, verification_notes, closed_at, closed_by, created_at, updated_at)
join public.forge_inspection_items it on it.inspection_id = v.inspection_id::uuid and it.item_key = v.item_key
on conflict (id) do nothing;

-- Inspection activity (same types/messages the inspection server actions write).
insert into public.forge_inspection_activity (organization_id, inspection_id, activity_type, message, actor_user_id, metadata, created_at)
select '20000000-0000-4000-8000-000000000100'::uuid, v.inspection_id::uuid, v.activity_type, v.message,
       '20000000-0000-4000-8000-000000000001'::uuid, v.metadata::jsonb, v.at
from (values
  ('63000000-0000-4000-8000-000000003002','created','Inspection created from template Forklift Pre-Shift Inspection.','{}', pg_temp.cb_at(60,'05:55')),
  ('63000000-0000-4000-8000-000000003002','submitted','Inspection submitted for review.','{}', pg_temp.cb_at(60,'06:15')),
  ('63000000-0000-4000-8000-000000003002','approved','Inspection approved.','{}', pg_temp.cb_at(59,'08:30')),
  ('63000000-0000-4000-8000-000000003002','closed','Inspection closed.','{}', pg_temp.cb_at(59,'08:35')),

  ('63000000-0000-4000-8000-000000003003','created','Inspection created from template Forklift Pre-Shift Inspection.','{}', pg_temp.cb_at(6,'05:50')),
  ('63000000-0000-4000-8000-000000003003','finding_created','Finding created: Backup alarm inoperative on warehouse forklift','{"finding_id":"63000000-0000-4000-8000-000000003203","severity":"high"}', pg_temp.cb_at(6,'06:05')),
  ('63000000-0000-4000-8000-000000003003','submitted','Inspection submitted for review.','{}', pg_temp.cb_at(6,'06:20')),
  ('63000000-0000-4000-8000-000000003003','approved','Inspection approved.','{}', pg_temp.cb_at(6,'10:40')),

  ('63000000-0000-4000-8000-000000003004','created','Inspection created from template Monthly Fire Extinguisher Inspection.','{}', pg_temp.cb_at(35,'09:00')),
  ('63000000-0000-4000-8000-000000003004','finding_created','Finding created: Extinguisher blocked by pallet at dryer tower','{"finding_id":"63000000-0000-4000-8000-000000003204","severity":"moderate"}', pg_temp.cb_at(35,'09:40')),
  ('63000000-0000-4000-8000-000000003004','submitted','Inspection submitted for review.','{}', pg_temp.cb_at(35,'11:30')),
  ('63000000-0000-4000-8000-000000003004','approved','Inspection approved.','{}', pg_temp.cb_at(34,'08:15')),
  ('63000000-0000-4000-8000-000000003004','finding_closed','Finding closed: Extinguisher blocked by pallet at dryer tower','{"finding_id":"63000000-0000-4000-8000-000000003204"}', pg_temp.cb_at(31,'09:30')),
  ('63000000-0000-4000-8000-000000003004','closed','Inspection closed.','{}', pg_temp.cb_at(30,'10:30')),

  ('63000000-0000-4000-8000-000000003005','created','Inspection created from template Monthly Fire Extinguisher Inspection.','{}', pg_temp.cb_at(2,'12:50')),

  ('63000000-0000-4000-8000-000000003006','created','Inspection created from template Bucket Elevator & Conveyor Guarding Inspection.','{}', pg_temp.cb_at(25,'13:00')),
  ('63000000-0000-4000-8000-000000003006','finding_created','Finding created: Tail shaft guard missing on Drag Conveyor 6','{"finding_id":"63000000-0000-4000-8000-000000003206","severity":"high"}', pg_temp.cb_at(25,'13:55')),
  ('63000000-0000-4000-8000-000000003006','submitted','Inspection submitted for review.','{}', pg_temp.cb_at(25,'15:20')),
  ('63000000-0000-4000-8000-000000003006','approved','Inspection approved.','{}', pg_temp.cb_at(24,'09:45')),

  ('63000000-0000-4000-8000-000000003007','created','Inspection created from template Combustible Dust Housekeeping Inspection.','{}', pg_temp.cb_at(47,'07:30')),
  ('63000000-0000-4000-8000-000000003007','submitted','Inspection submitted for review.','{}', pg_temp.cb_at(47,'09:10')),
  ('63000000-0000-4000-8000-000000003007','approved','Inspection approved.','{}', pg_temp.cb_at(46,'10:00')),
  ('63000000-0000-4000-8000-000000003007','closed','Inspection closed.','{}', pg_temp.cb_at(46,'10:05')),

  ('63000000-0000-4000-8000-000000003008','created','Inspection created from template Combustible Dust Housekeeping Inspection.','{}', pg_temp.cb_at(5,'13:30')),
  ('63000000-0000-4000-8000-000000003008','finding_created','Finding created: Dust buildup on beams above huller floor','{"finding_id":"63000000-0000-4000-8000-000000003208","severity":"moderate"}', pg_temp.cb_at(5,'14:20')),
  ('63000000-0000-4000-8000-000000003008','submitted','Inspection submitted for review.','{}', pg_temp.cb_at(5,'15:30')),

  ('63000000-0000-4000-8000-000000003009','created','Inspection created from template Bucket Elevator & Conveyor Guarding Inspection.','{}', pg_temp.cb_at(12,'08:00'))
) as v(inspection_id, activity_type, message, metadata, at);

-- Inspection numbers in creation order, per year, then advance the sequence.
with ranked as (
  select id,
         extract(year from created_at)::int as yr,
         row_number() over (partition by extract(year from created_at) order by created_at, id) as rn
  from public.forge_inspections
  where id = '20000000-0000-4000-8000-000000000950'
     or id::text like '63000000-0000-4000-8000-00000000300_'
)
update public.forge_inspections i
set inspection_number = 'INSP-' || r.yr || '-' || lpad(r.rn::text, 6, '0')
from ranked r
where i.id = r.id;

insert into public.forge_inspection_sequences (organization_id, inspection_year, next_value)
select organization_id, split_part(inspection_number, '-', 2)::int, max(split_part(inspection_number, '-', 3)::int) + 1
from public.forge_inspections
where organization_id = '20000000-0000-4000-8000-000000000100'
  and inspection_number ~ '^INSP-[0-9]{4}-[0-9]{6}$'
group by 1, 2
on conflict (organization_id, inspection_year)
do update set next_value = greatest(public.forge_inspection_sequences.next_value, excluded.next_value);

-- =============================================================================
-- STANDALONE TASKS (not managed by a CAPA)
-- =============================================================================

-- Seeded task (DEMO-TASK-000001, source = asset DEMO-AST-000001) becomes the forklift
-- backup-alarm follow-up from the pre-shift finding. Renumbered below.
update public.forge_tasks
set
  title = 'Confirm forklift backup alarm repair on next pre-shift check',
  description = 'Maintenance replaced the backup alarm on the warehouse forklift that failed its pre-shift check. Run the truck through the pre-shift checklist, confirm the alarm sounds in reverse, and remove the out-of-service tag.',
  status = 'in_progress',
  priority = 'high',
  assigned_personnel_id = '20000000-0000-4000-8000-000000000600',
  assigned_user_id = '20000000-0000-4000-8000-000000000002',
  start_at = pg_temp.cb_at(5, '06:00'),
  due_at = pg_temp.cb_at(2, '15:00'),
  created_at = pg_temp.cb_at(6, '10:50'),
  updated_at = pg_temp.cb_at(3, '15:30'),
  updated_by = '20000000-0000-4000-8000-000000000001'
where id = '20000000-0000-4000-8000-000000001301';

update public.forge_task_activity
set message = 'Task created.', created_at = pg_temp.cb_at(6, '10:50')
where task_id = '20000000-0000-4000-8000-000000001301' and activity_type = 'created';

insert into public.forge_tasks (
  id, organization_id, task_number, title, description, status, priority, assigned_personnel_id, assigned_user_id,
  location_id, division_id, start_at, due_at, completed_at, completed_by, source_type, source_id, source_reference,
  corrective_action, verification_required, verification_notes, created_by, updated_by, created_at, updated_at
)
select v.id::uuid, '20000000-0000-4000-8000-000000000100'::uuid, 'SEED-TASK-' || right(v.id, 4), v.title, v.description, v.status, v.priority,
       v.person, p.auth_user_id,
       '20000000-0000-4000-8000-000000000300'::uuid, '20000000-0000-4000-8000-000000000200'::uuid,
       v.start_at, v.due_at, v.completed_at, case when v.completed_at is not null then '20000000-0000-4000-8000-000000000001'::uuid end,
       v.source_type, v.source_id, null, v.corrective_action, v.verification_required, v.verification_notes,
       '20000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, v.created_at, v.updated_at
from (values
  ('63000000-0000-4000-8000-000000005101','Replace exit sign battery pack at mill stairwell B',
   'Exit sign at the top of mill stairwell B failed its monthly 30-second test.',
   'completed','normal', pg_temp.cb_p(12), null::timestamptz, pg_temp.cb_at(48,'15:00'), pg_temp.cb_at(50,'10:40'),
   'manual', null, false, false, 'Battery pack replaced; sign passed the 30-second test.', pg_temp.cb_at(55,'08:20'), pg_temp.cb_at(50,'10:40')),
  ('63000000-0000-4000-8000-000000005102','Replace discharged extinguisher at Dryer 2',
   'The 20 lb ABC extinguisher at Dryer 2 was used on the burner housing dust fire. Mount a spare and send the used unit out for recharge.',
   'completed','high', pg_temp.cb_p(24), null, pg_temp.cb_at(20,'18:00'), pg_temp.cb_at(20,'09:00'),
   'incident', '63000000-0000-4000-8000-000000001008', true, true, 'Spare 20 lb ABC unit mounted at Dryer 2 and tagged. Discharged unit sent to the vendor for recharge.', pg_temp.cb_at(21,'05:00'), pg_temp.cb_at(20,'09:00')),
  ('63000000-0000-4000-8000-000000005103','Weekly eyewash station checks: bagging line and QC lab',
   'Activate each plumbed eyewash for 3 minutes, check flow and water clarity, and initial the tag.',
   'open','normal', pg_temp.cb_p(16), null, pg_temp.cb_at(-2,'15:00'), null,
   'manual', null, false, false, null, pg_temp.cb_at(5,'09:15'), pg_temp.cb_at(5,'09:15')),
  ('63000000-0000-4000-8000-000000005104','Update confined space entry roster for bin cleaning crew',
   'Add the seasonal dryer crew to the authorized entrant and attendant roster for rough rice bin cleaning, and confirm each has current confined space training.',
   'in_progress','normal', pg_temp.cb_p(2), pg_temp.cb_at(10,'08:00'), pg_temp.cb_at(3,'16:00'), null,
   'manual', null, false, false, null, pg_temp.cb_at(16,'13:00'), pg_temp.cb_at(10,'08:00')),
  ('63000000-0000-4000-8000-000000005105','Schedule noise dosimetry survey for milling floor',
   'Annual noise exposure monitoring for huller, whitener and bagging operators. Book the industrial hygienist for a day and night shift.',
   'open','low', pg_temp.cb_p(24), null, pg_temp.cb_at(-20,'16:00'), null,
   'manual', null, false, false, null, pg_temp.cb_at(8,'10:30'), pg_temp.cb_at(8,'10:30')),
  ('63000000-0000-4000-8000-000000005106','Inspect fall protection anchors at rail loadout platform',
   'Annual inspection of the overhead anchor points and the davit bases used for rail car hatch access.',
   'blocked','high', pg_temp.cb_p(11), pg_temp.cb_at(9,'08:00'), pg_temp.cb_at(1,'16:00'), null,
   'manual', null, false, true, null, pg_temp.cb_at(14,'11:00'), pg_temp.cb_at(6,'09:30')),
  ('63000000-0000-4000-8000-000000005107','Review updated Huller 3 lockout procedure',
   'The Huller 3 lockout procedure now includes the new feed gate air valve. Read the updated procedure and walk the energy isolation points with your shift supervisor.',
   'open','normal', '20000000-0000-4000-8000-000000000600'::uuid, null, pg_temp.cb_at(-1,'15:00'), null,
   'manual', null, false, false, null, pg_temp.cb_at(3,'09:00'), pg_temp.cb_at(3,'09:00')),
  ('63000000-0000-4000-8000-000000005108','Annual hoist and sling inspection: maintenance shop',
   'Inspect the shop jib hoist, chain falls, synthetic slings and shackles; remove damaged rigging from service.',
   'completed','normal', pg_temp.cb_p(9), pg_temp.cb_at(72,'07:00'), pg_temp.cb_at(68,'16:00'), pg_temp.cb_at(70,'14:20'),
   'manual', null, false, true, 'All hoists passed. Two synthetic slings with cut edges removed and destroyed; replacements ordered.', pg_temp.cb_at(80,'09:30'), pg_temp.cb_at(70,'14:20'))
) as v(id, title, description, status, priority, person, start_at, due_at, completed_at, source_type, source_id, corrective_action, verification_required, verification_notes, created_at, updated_at)
left join public.forge_personnel p on p.id = v.person
on conflict (id) do nothing;

-- =============================================================================
-- CORRECTIVE ACTIONS (CAPA) with their linked Tasks
-- =============================================================================

create temp table cb_capa (
  ord integer,
  id uuid,
  task_id uuid,
  title text,
  description text,
  action_type text,
  severity text,
  initial_status text,
  source_type text,
  source_id uuid,
  source_link_type text,
  person uuid,
  created_at timestamptz,
  due_at timestamptz,
  immediate_containment text,
  root_cause text,
  action_plan text,
  preventive_action text,
  verification_due_at timestamptz,
  effectiveness_review_due_at timestamptz
);

create temp table cb_capa_step (
  capa_id uuid,
  step integer,
  to_status text,
  at timestamptz,
  note text,
  verification_result text
);

insert into cb_capa values
  (1,'63000000-0000-4000-8000-000000004001','63000000-0000-4000-8000-000000005001',
   'Clear and mark main aisle at bagging warehouse',
   'Monthly walkthrough found bagged product staged in the main warehouse aisle near dock door 4, narrowing the walkway to about 30 inches. Same area as the dock door 4 forklift near miss.',
   'corrective','moderate','in_progress','inspection','20000000-0000-4000-8000-000000000960','inspection_finding', pg_temp.cb_p(18),
   pg_temp.cb_at(3,'14:20'), pg_temp.cb_at(-3,'16:00'),
   'Pallets moved out of the aisle the same morning.',
   'No overflow staging area when outbound trailers run late; aisle lines are worn and hard to see.',
   'Repaint aisle and walkway lines at doors 3-5, add "No Staging" floor stencils, and mark an overflow staging area by the north wall.',
   null, pg_temp.cb_at(-7,'16:00'), null),
  (2,'63000000-0000-4000-8000-000000004002','63000000-0000-4000-8000-000000005002',
   'Install tail shaft guard on Drag Conveyor 6',
   'Guarding inspection found the tail shaft guard missing on Drag Conveyor 6, leaving the rotating shaft and sprocket exposed.',
   'corrective','high','in_progress','inspection','63000000-0000-4000-8000-000000003206','inspection_finding', pg_temp.cb_p(11),
   pg_temp.cb_at(24,'11:00'), pg_temp.cb_at(4,'16:00'),
   'Drag Conveyor 6 locked and tagged out of service; product routed through Drag Conveyor 5.',
   'Guard was removed for an August bearing replacement and not reinstalled. Work order closeout did not require a guard check.',
   'Fabricate and install a bolted expanded-metal tail shaft guard on Drag Conveyor 6.',
   'Add a "guards reinstalled and checked" sign-off to every conveyor and elevator work order closeout.', pg_temp.cb_at(-3,'16:00'), null),
  (3,'63000000-0000-4000-8000-000000004003','63000000-0000-4000-8000-000000005003',
   'Clean overhead beams above huller floor and add them to weekly route',
   'Dust housekeeping inspection found about 1/8 in. of dust on the overhead beams above Hullers 1-4.',
   'corrective','moderate','in_progress','inspection','63000000-0000-4000-8000-000000003208','inspection_finding', pg_temp.cb_p(5),
   pg_temp.cb_at(5,'16:00'), pg_temp.cb_at(-1,'16:00'),
   'Hot work suspended on the huller floor until the beams were cleaned.',
   'Overhead beams were never on the weekly cleaning route; only floor-level surfaces were assigned.',
   'Vacuum the beams above Hullers 1-4 with the approved dust vacuum and add overhead beams to the weekly huller floor cleaning route.',
   null, pg_temp.cb_at(-4,'16:00'), null),
  (4,'63000000-0000-4000-8000-000000004004','63000000-0000-4000-8000-000000005004',
   'Keep extinguisher access clear at dryer tower',
   'Monthly extinguisher inspection found a pallet of spare dryer parts blocking the dryer tower ground-floor extinguisher.',
   'corrective','low','in_progress','inspection','63000000-0000-4000-8000-000000003204','inspection_finding', pg_temp.cb_p(24),
   pg_temp.cb_at(35,'10:30'), pg_temp.cb_at(32,'16:00'),
   'Pallet moved during the inspection.',
   'Spare parts were set down near the extinguisher because the parts cage was full.',
   'Move the pallet to the parts cage and paint a red keep-clear box under the extinguisher.',
   null, pg_temp.cb_at(30,'16:00'), null),
  (5,'63000000-0000-4000-8000-000000004005','63000000-0000-4000-8000-000000005005',
   'Install vacuum bag lifter at bagging line 2 hand-stack station',
   'A mill operator strained his lower back hand-stacking 50 lb bags at bagging line 2 during a palletizer outage.',
   'corrective','high','open','incident','63000000-0000-4000-8000-000000001003','incident', pg_temp.cb_p(10),
   pg_temp.cb_at(39,'09:00'), pg_temp.cb_at(-12,'16:00'),
   'Hand stacking limited to 30 minutes per person per hour with rotation; palletizer outages escalated to maintenance right away.',
   'Palletizer outages force manual stacking of 50 lb bags with twisting, and there is no lift assist at the station.',
   'Install a vacuum tube bag lifter at the bagging line 2 hand-stack station and train all packaging operators on it.',
   'Review palletizer spare parts so outages are shorter.', pg_temp.cb_at(-19,'16:00'), null),
  (6,'63000000-0000-4000-8000-000000004006','63000000-0000-4000-8000-000000005006',
   'Require lockout at the local disconnect for all drag conveyor clearing',
   'Drag Conveyor 4 was restarted from the control room while a technician was preparing to clear a plug. The conveyor had been stopped but not locked out.',
   'corrective','critical','in_progress','incident','63000000-0000-4000-8000-000000001005','incident', pg_temp.cb_p(2),
   pg_temp.cb_at(62,'13:00'), pg_temp.cb_at(48,'16:00'),
   'All drag conveyor work stopped until crews reviewed the lockout procedure. Control room operators must radio before starting any conveyor.',
   'Crews treated a control-room stop as safe for plug clearing. The conveyor procedure did not name the local disconnect as the isolation point.',
   'Revise the drag conveyor lockout procedures to require a lock at the local disconnect and a try-start; retrain mill, dryer and maintenance crews on both shifts.',
   'Add a lockable local disconnect check to the monthly guarding inspection.', pg_temp.cb_at(40,'16:00'), pg_temp.cb_at(-20,'09:00')),
  (7,'63000000-0000-4000-8000-000000004007','63000000-0000-4000-8000-000000005007',
   'Deburr and edge-guard bucket elevator inspection doors',
   'A maintenance technician needed 6 sutures after cutting his hand on the sharp edge of the Bucket Elevator 2 boot inspection door frame.',
   'corrective','low','in_progress','incident','63000000-0000-4000-8000-000000001002','incident', pg_temp.cb_p(12),
   pg_temp.cb_at(76,'15:00'), pg_temp.cb_at(69,'16:00'),
   'Edge taped on the Bucket Elevator 2 door frame the same day.',
   'Inspection door frames were cut in the field and never deburred.',
   'Deburr all bucket elevator boot and head inspection door frames and install rubber edge trim.',
   'Remind operators that cut-resistant gloves are required when opening inspection doors.', pg_temp.cb_at(66,'16:00'), null),
  (8,'63000000-0000-4000-8000-000000004008','63000000-0000-4000-8000-000000005008',
   'Add Dryer 2 burner housing to dust cleaning route and inspect burner wiring',
   'Dust that built up on top of the Dryer 2 burner housing caught fire during a night run. The operator put it out with an extinguisher.',
   'corrective','high','open','incident','63000000-0000-4000-8000-000000001008','incident', pg_temp.cb_p(13),
   pg_temp.cb_at(4,'10:00'), pg_temp.cb_at(-3,'16:00'),
   'Burner housing cleaned and the lead electrician inspected and repaired the burner wiring before the dryer restarted.',
   null, null, null, null, null),
  (9,'63000000-0000-4000-8000-000000004009','63000000-0000-4000-8000-000000005009',
   'Replace rail car puller hydraulic hoses and stage spill kit at loadout',
   'A failed hydraulic hose on the rail car puller released about 5 gallons of oil at the rail loadout.',
   'corrective','moderate','in_progress','incident','63000000-0000-4000-8000-000000001007','incident', pg_temp.cb_p(10),
   pg_temp.cb_at(33,'09:30'), pg_temp.cb_at(26,'16:00'),
   'Failed hose replaced and spill cleaned up the same day.',
   'Original hoses were past their replacement interval and were not on the preventive maintenance list.',
   'Replace all hydraulic hoses on the rail car puller, add them to the PM schedule, and stage a 20 gallon spill kit at the loadout.',
   null, pg_temp.cb_at(24,'16:00'), null),
  (10,'63000000-0000-4000-8000-000000004010','63000000-0000-4000-8000-000000005010',
   'Install bollards at truck scale canopy posts',
   'An inbound grain truck struck and bent the north canopy support post at the inbound truck scale.',
   'corrective','moderate','open','incident','63000000-0000-4000-8000-000000001006','incident', pg_temp.cb_p(1),
   pg_temp.cb_at(50,'10:00'), pg_temp.cb_at(9,'16:00'),
   'Temporary jersey barriers placed in front of both canopy posts.',
   null, null, null, null, null),
  (11,'63000000-0000-4000-8000-000000004011','63000000-0000-4000-8000-000000005011',
   'Mark pedestrian walkway and install convex mirror at dock door 4',
   'A forklift backing out of a trailer at dock door 4 nearly struck a packaging operator walking outside the marked walkway.',
   'corrective','moderate','in_progress','incident','20000000-0000-4000-8000-000000000801','incident', pg_temp.cb_p(3),
   pg_temp.cb_at(10,'09:00'), pg_temp.cb_at(-6,'16:00'),
   'Pallet staging across the walkway stopped; supervisor briefed both shifts.',
   'Walkway lines at doors 3-5 are worn, and forklift operators backing out of trailers cannot see the walkway.',
   'Repaint the pedestrian walkway at doors 3-5 and install a convex mirror at dock door 4.',
   'Add dock-area pedestrian rules to the forklift refresher training.', pg_temp.cb_at(-10,'16:00'), null),
  (12,'63000000-0000-4000-8000-000000004012','63000000-0000-4000-8000-000000005012',
   'Replace damaged dock plate at door 2',
   'Dock plate at door 2 has a cracked hinge and rocks under forklift traffic.',
   'corrective','moderate','open','manual',null,null, pg_temp.cb_p(11),
   pg_temp.cb_at(29,'08:30'), pg_temp.cb_at(15,'16:00'),
   'Door 2 taken out of use for loading.',
   null, null, null, null, null),
  (13,'63000000-0000-4000-8000-000000004013','63000000-0000-4000-8000-000000005013',
   'Add hydration stations and heat stress breaks for dryer tower crew',
   'A seasonal dryer operator was treated for heat exhaustion after working in the dryer tower during an afternoon drying run with a 104 F heat index.',
   'preventive','high','in_progress','incident','63000000-0000-4000-8000-000000001010','incident', pg_temp.cb_p(24),
   pg_temp.cb_at(57,'11:00'), pg_temp.cb_at(50,'16:00'),
   'Extra water and electrolyte drinks staged at the dryer tower immediately.',
   'No heat stress plan for the dryer tower; water was only available at the break room.',
   'Install hydration stations on the dryer tower ground floor and third floor, post a heat index break schedule, and hold a heat stress toolbox talk.',
   null, pg_temp.cb_at(47,'16:00'), null),
  (14,'63000000-0000-4000-8000-000000004014','63000000-0000-4000-8000-000000005014',
   'Check spouts under Hullers 1-4 for cracks and leaks',
   'Brown rice leaked from a cracked spout coupling under Huller 3 and an operator slipped on it.',
   'preventive','low','open','incident','63000000-0000-4000-8000-000000001009','incident','20000000-0000-4000-8000-000000000600',
   pg_temp.cb_at(1,'09:00'), pg_temp.cb_at(-2,'16:00'),
   null, null, null, null, null, null);

insert into cb_capa_step values
  ('63000000-0000-4000-8000-000000004003',1,'pending_verification', pg_temp.cb_at(2,'14:30'), null, null),

  ('63000000-0000-4000-8000-000000004004',1,'pending_verification', pg_temp.cb_at(33,'11:00'), null, null),
  ('63000000-0000-4000-8000-000000004004',2,'verified', pg_temp.cb_at(31,'09:30'), 'Checked the dryer tower on two walk-throughs; extinguisher access clear and floor marking in place.', 'effective'),
  ('63000000-0000-4000-8000-000000004004',3,'closed', pg_temp.cb_at(30,'10:15'), 'Effective. Extinguisher access added to the dryer tower area checklist.', null),

  ('63000000-0000-4000-8000-000000004005',1,'in_progress', pg_temp.cb_at(36,'10:00'), null, null),

  ('63000000-0000-4000-8000-000000004006',1,'pending_verification', pg_temp.cb_at(50,'15:00'), null, null),
  ('63000000-0000-4000-8000-000000004006',2,'in_progress', pg_temp.cb_at(48,'09:00'), 'Day shift is applying locks at the local disconnect, but night shift has not finished the refresher. Returned for follow-up.', 'follow_up_required'),
  ('63000000-0000-4000-8000-000000004006',3,'pending_verification', pg_temp.cb_at(45,'16:00'), null, null),
  ('63000000-0000-4000-8000-000000004006',4,'verified', pg_temp.cb_at(40,'10:30'), 'Observed four drag conveyor plug clearings across both shifts. Locks applied at the local disconnect and try-start done every time.', 'effective'),

  ('63000000-0000-4000-8000-000000004007',1,'pending_verification', pg_temp.cb_at(70,'14:00'), null, null),
  ('63000000-0000-4000-8000-000000004007',2,'verified', pg_temp.cb_at(66,'09:00'), 'All bucket elevator inspection door frames deburred and edge trim installed. Checked by safety.', 'effective'),
  ('63000000-0000-4000-8000-000000004007',3,'closed', pg_temp.cb_at(64,'11:00'), 'Effective. No further hand injuries at elevator inspection doors.', null),

  ('63000000-0000-4000-8000-000000004009',1,'pending_verification', pg_temp.cb_at(27,'15:00'), null, null),
  ('63000000-0000-4000-8000-000000004009',2,'verified', pg_temp.cb_at(24,'10:00'), 'Hoses replaced and added to the PM schedule; spill kit stocked and sealed at the loadout.', 'effective'),
  ('63000000-0000-4000-8000-000000004009',3,'closed', pg_temp.cb_at(22,'09:00'), 'Effective. Closed.', null),

  ('63000000-0000-4000-8000-000000004012',1,'canceled', pg_temp.cb_at(27,'14:00'), 'Duplicate. Dock plate replacement is already scheduled and tracked in the maintenance work order system.', null),

  ('63000000-0000-4000-8000-000000004013',1,'pending_verification', pg_temp.cb_at(50,'13:00'), null, null),
  ('63000000-0000-4000-8000-000000004013',2,'verified', pg_temp.cb_at(47,'10:00'), 'Stations installed and stocked; break schedule posted. Dryer crew confirmed at the toolbox talk.', 'effective'),
  ('63000000-0000-4000-8000-000000004013',3,'closed', pg_temp.cb_at(46,'15:00'), 'Effective. Heat stress plan added to the summer startup checklist.', null);

-- CAPA rows as createCorrectiveAction inserts them (status open, or in_progress when an action plan exists).
insert into public.forge_corrective_actions (
  id, organization_id, action_number, title, description, action_type, severity, status,
  source_type, source_id, source_reference, location_id, division_id, assigned_personnel_id, assigned_user_id,
  immediate_containment, root_cause_required, root_cause, action_plan, preventive_action, due_at,
  verification_due_at, effectiveness_review_due_at, row_version, created_by, updated_by, created_at, updated_at
)
select c.id, '20000000-0000-4000-8000-000000000100'::uuid, 'SEED-CA-' || c.ord, c.title, c.description, c.action_type, c.severity, c.initial_status,
       c.source_type, c.source_id::text, null, '20000000-0000-4000-8000-000000000300'::uuid, '20000000-0000-4000-8000-000000000200'::uuid,
       c.person, p.auth_user_id,
       c.immediate_containment, true, c.root_cause, c.action_plan, c.preventive_action, c.due_at,
       c.verification_due_at, c.effectiveness_review_due_at, 1,
       '20000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, c.created_at, c.created_at
from cb_capa c
left join public.forge_personnel p on p.id = c.person
on conflict (id) do nothing;

-- Linked tasks, as createCorrectiveAction inserts them.
insert into public.forge_tasks (
  id, organization_id, task_number, title, description, status, priority, assigned_personnel_id, assigned_user_id,
  location_id, division_id, due_at, source_type, source_id, source_reference, corrective_action, verification_required,
  created_by, updated_by, created_at, updated_at
)
select c.task_id, ca.organization_id, 'SEED-TASK-C' || c.ord, ca.title, coalesce(ca.action_plan, ca.description),
       case when ca.status = 'in_progress' then 'in_progress' else 'open' end,
       case ca.severity when 'critical' then 'critical' when 'high' then 'high' when 'low' then 'low' else 'normal' end,
       ca.assigned_personnel_id, ca.assigned_user_id, ca.location_id, ca.division_id, ca.due_at,
       'corrective_action', ca.id::text, null, true, true,
       ca.created_by, ca.created_by, ca.created_at, ca.created_at
from cb_capa c
join public.forge_corrective_actions ca on ca.id = c.id
on conflict (id) do nothing;

update public.forge_corrective_actions ca
set linked_task_id = c.task_id
from cb_capa c
where ca.id = c.id;

-- Task numbers (TASK-NNNNNN) and CAPA numbers (CA-NNNNNN) in creation order.
with ranked as (
  select id, row_number() over (order by created_at, id) as rn
  from public.forge_tasks
  where id = '20000000-0000-4000-8000-000000001301'
     or id::text like '63000000-0000-4000-8000-00000000500%'
     or id::text like '63000000-0000-4000-8000-00000000501%'
     or id::text like '63000000-0000-4000-8000-00000000510%'
)
update public.forge_tasks t
set task_number = 'TASK-' || lpad(r.rn::text, 6, '0')
from ranked r
where t.id = r.id;

with ranked as (
  select id, row_number() over (order by created_at, id) as rn
  from public.forge_corrective_actions
  where id in (select id from cb_capa)
)
update public.forge_corrective_actions ca
set action_number = 'CA-' || lpad(r.rn::text, 6, '0')
from ranked r
where ca.id = r.id;

insert into public.forge_task_sequences (organization_id, next_value)
select organization_id, max(substr(task_number, 6)::int) + 1
from public.forge_tasks
where organization_id = '20000000-0000-4000-8000-000000000100' and task_number ~ '^TASK-[0-9]{6}$'
group by 1
on conflict (organization_id)
do update set next_value = greatest(public.forge_task_sequences.next_value, excluded.next_value);

insert into public.forge_corrective_action_sequences (organization_id, next_value)
select organization_id, max(substr(action_number, 4)::int) + 1
from public.forge_corrective_actions
where organization_id = '20000000-0000-4000-8000-000000000100' and action_number ~ '^CA-[0-9]{6}$'
group by 1
on conflict (organization_id)
do update set next_value = greatest(public.forge_corrective_action_sequences.next_value, excluded.next_value);

-- Human-readable source references.
update public.forge_corrective_actions ca
set source_reference = coalesce(
  (select i.incident_number from public.forge_incidents i where ca.source_type = 'incident' and i.id::text = ca.source_id),
  (select ins.inspection_number from public.forge_inspection_findings f join public.forge_inspections ins on ins.id = f.inspection_id
    where ca.source_type = 'inspection' and f.id::text = ca.source_id))
where ca.id in (select id from cb_capa);

update public.forge_tasks t
set source_reference = ca.action_number
from public.forge_corrective_actions ca
where t.source_type = 'corrective_action' and t.source_id = ca.id::text and ca.id in (select id from cb_capa);

update public.forge_tasks t
set source_reference = i.incident_number
from public.forge_incidents i
where t.id = '63000000-0000-4000-8000-000000005102' and i.id = '63000000-0000-4000-8000-000000001008';

-- CAPA lifecycle history: same rows createCorrectiveAction + forge_perform_capa_lifecycle_transition write.
do $$
declare
  c record;
  s record;
  v_org constant uuid := '20000000-0000-4000-8000-000000000100';
  v_actor constant uuid := '20000000-0000-4000-8000-000000000001';
  v_def_id uuid;
  v_instance_id uuid;
  v_event_id uuid;
  v_activity_id bigint;
  v_audit_id bigint;
  v_from text;
  v_key text;
  v_source text;
  v_task_number text;
  v_action_number text;
begin
  select id into v_def_id
  from public.forge_workflow_definitions
  where workflow_key = 'corrective_actions.lifecycle' and version = 1 and organization_id is null and is_active = true
  limit 1;

  if v_def_id is null then
    raise exception 'corrective_actions.lifecycle workflow definition missing';
  end if;

  for c in select * from cb_capa order by created_at loop
    select action_number into v_action_number from public.forge_corrective_actions where id = c.id;
    select task_number into v_task_number from public.forge_tasks where id = c.task_id;

    insert into public.forge_corrective_action_activity (organization_id, corrective_action_id, activity_type, message, actor_user_id, metadata, created_at)
    values (v_org, c.id, 'created', 'Corrective Action created with linked Task ' || v_task_number || '.', v_actor,
            jsonb_build_object('task_id', c.task_id, 'task_number', v_task_number), c.created_at);

    insert into public.forge_task_activity (organization_id, task_id, activity_type, message, actor_user_id, metadata, created_at)
    values (v_org, c.task_id, 'created_from_corrective_action', 'Task created from Corrective Action ' || v_action_number || '.', v_actor,
            jsonb_build_object('corrective_action_id', c.id), c.created_at);

    insert into public.forge_creator_audit_log (actor_user_id, organization_id, action, entity_type, entity_id, after_value, created_at)
    select v_actor, v_org, 'corrective_action.created', 'corrective_action', c.id::text, to_jsonb(ca), c.created_at
    from public.forge_corrective_actions ca where ca.id = c.id;

    insert into public.forge_workflow_instances (organization_id, workflow_definition_id, workflow_version, resource_type, resource_id,
                                                 current_state_key, started_at, created_at, updated_at)
    values (v_org, v_def_id, 1, 'corrective_action', c.id, c.initial_status, c.created_at, c.created_at, c.created_at)
    returning id into v_instance_id;

    insert into public.forge_workflow_events (organization_id, workflow_instance_id, resource_type, resource_id, transition_key,
                                              from_state_key, to_state_key, comment, metadata, occurred_at)
    values (v_org, v_instance_id, 'corrective_action', c.id, 'initialize', null, c.initial_status, 'Workflow instance created.',
            jsonb_build_object('source', 'ensureWorkflowInstance'), c.created_at);

    v_from := c.initial_status;

    for s in select * from cb_capa_step where capa_id = c.id order by step loop
      v_key := case v_from || '>' || s.to_status
        when 'open>in_progress' then 'start_work'
        when 'open>pending_verification' then 'submit_for_verification'
        when 'in_progress>pending_verification' then 'submit_for_verification_from_progress'
        when 'pending_verification>verified' then 'verify_effective'
        when 'pending_verification>in_progress' then 'verify_ineffective'
        when 'verified>closed' then 'close'
        when 'open>canceled' then 'cancel_from_open'
        when 'in_progress>canceled' then 'cancel_from_progress'
        when 'pending_verification>canceled' then 'cancel_from_pending'
      end;
      if v_key is null then
        raise exception 'No CAPA transition for % -> %', v_from, s.to_status;
      end if;

      v_source := case
        when v_key = 'start_work' then 'form_update'
        when s.to_status = 'pending_verification' then 'capa_submit'
        when s.to_status in ('verified') or v_key = 'verify_ineffective' then 'capa_verify'
        when s.to_status = 'closed' then 'capa_close'
        when s.to_status = 'canceled' then 'capa_cancel'
      end;

      update public.forge_corrective_actions ca
      set
        status = s.to_status,
        row_version = ca.row_version + 1,
        updated_by = v_actor,
        updated_at = s.at,
        completed_at = case
          when s.to_status = 'pending_verification' then s.at
          when v_key = 'verify_ineffective' then null
          else ca.completed_at end,
        completed_by = case
          when s.to_status = 'pending_verification' then v_actor
          when v_key = 'verify_ineffective' then null
          else ca.completed_by end,
        verification_result = case when v_key in ('verify_effective', 'verify_ineffective') then s.verification_result else ca.verification_result end,
        verification_notes = case when v_key in ('verify_effective', 'verify_ineffective') then s.note else ca.verification_notes end,
        verified_at = case when v_key = 'verify_effective' then s.at when v_key = 'verify_ineffective' then null else ca.verified_at end,
        verified_by = case when v_key = 'verify_effective' then v_actor when v_key = 'verify_ineffective' then null else ca.verified_by end,
        closure_notes = case when s.to_status in ('closed', 'canceled') then s.note else ca.closure_notes end,
        closed_at = case when s.to_status in ('closed', 'canceled') then s.at else ca.closed_at end,
        closed_by = case when s.to_status in ('closed', 'canceled') then v_actor else ca.closed_by end
      where ca.id = c.id;

      update public.forge_workflow_instances
      set current_state_key = s.to_status,
          updated_at = s.at,
          completed_at = case when s.to_status in ('closed', 'canceled') then s.at else completed_at end,
          canceled_at = case when s.to_status = 'canceled' then s.at else canceled_at end
      where id = v_instance_id;

      insert into public.forge_workflow_events (organization_id, workflow_instance_id, resource_type, resource_id, transition_key,
                                                from_state_key, to_state_key, actor_user_id, comment, metadata, occurred_at)
      values (v_org, v_instance_id, 'corrective_action', c.id, v_key, v_from, s.to_status, v_actor, s.note,
              jsonb_build_object('source', 'capa_atomic', 'adapter', 'capa_atomic')
                || case when s.verification_result is not null then jsonb_build_object('verification_result', s.verification_result) else '{}'::jsonb end,
              s.at)
      returning id into v_event_id;

      if v_key = 'start_work' then
        -- Form save that moved open -> in_progress (forge_update_capa_transactionally).
        insert into public.forge_task_activity (organization_id, task_id, activity_type, message, actor_user_id, metadata, created_at)
        values (v_org, c.task_id, 'synced_from_corrective_action', 'Task synchronized from Corrective Action ' || v_action_number || '.', v_actor,
                jsonb_build_object('capa_id', c.id), s.at);
        insert into public.forge_corrective_action_activity (organization_id, corrective_action_id, activity_type, message, actor_user_id, metadata, created_at)
        values (v_org, c.id, 'updated', 'Corrective Action details updated.', v_actor,
                jsonb_build_object('transition_key', 'start_work', 'event_id', v_event_id), s.at);
        insert into public.forge_record_activity (organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata, created_at)
        values (v_org, 'corrective_action', c.id, 'updated', 'Corrective Action details updated.', v_actor, '{}'::jsonb, s.at);
      end if;

      insert into public.forge_corrective_action_activity (organization_id, corrective_action_id, activity_type, message, actor_user_id, metadata, created_at)
      values (v_org, c.id, 'workflow_' || v_key, 'CAPA transitioned from ' || v_from || ' to ' || s.to_status || '.', v_actor,
              jsonb_build_object('event_id', v_event_id, 'transition_key', v_key), s.at)
      returning id into v_activity_id;

      insert into public.forge_record_activity (organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata, created_at)
      values (v_org, 'corrective_action', c.id, 'workflow_transition', 'Workflow transitioned to ' || s.to_status || '.', v_actor,
              jsonb_build_object('event_id', v_event_id, 'transition_key', v_key), s.at);

      insert into public.forge_creator_audit_log (actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value, created_at)
      values (v_actor, v_org, 'corrective_action.lifecycle_transitioned', 'corrective_action', c.id::text,
              jsonb_build_object('status', v_from, 'workflow_state', v_from),
              jsonb_build_object('status', s.to_status, 'workflow_state', s.to_status, 'transition_key', v_key, 'event_id', v_event_id),
              s.at)
      returning id into v_audit_id;

      insert into public.forge_domain_event_outbox (organization_id, event_type, resource_type, resource_id, payload, occurred_at)
      values (v_org, 'capa.lifecycle_transitioned', 'corrective_action', c.id,
              jsonb_build_object('from_status', v_from, 'to_status', s.to_status, 'transition_key', v_key, 'event_id', v_event_id,
                                 'audit_id', v_audit_id, 'activity_id', v_activity_id, 'source', v_source),
              s.at);

      -- Linked task follows the CAPA (server-action side effects).
      if s.to_status = 'in_progress' and v_key = 'start_work' then
        update public.forge_tasks set status = 'in_progress', updated_by = v_actor, updated_at = s.at where id = c.task_id;
      elsif s.to_status = 'pending_verification' then
        update public.forge_tasks
        set status = 'completed', completed_at = s.at, completed_by = v_actor,
            verification_notes = 'Corrective work completed; CAPA verification pending.', updated_by = v_actor, updated_at = s.at
        where id = c.task_id;
        insert into public.forge_task_activity (organization_id, task_id, activity_type, message, actor_user_id, created_at)
        values (v_org, c.task_id, 'corrective_action_work_completed', 'Corrective work submitted for CAPA verification.', v_actor, s.at);
      elsif v_key = 'verify_ineffective' then
        update public.forge_tasks
        set status = 'in_progress', completed_at = null, completed_by = null,
            verification_notes = 'CAPA verification requires follow-up: ' || s.note, updated_by = v_actor, updated_at = s.at
        where id = c.task_id;
        insert into public.forge_task_activity (organization_id, task_id, activity_type, message, actor_user_id, created_at)
        values (v_org, c.task_id, 'reopened_from_verification', 'Task reopened because CAPA verification requires follow-up.', v_actor, s.at);
      elsif s.to_status = 'canceled' then
        update public.forge_tasks
        set status = 'canceled', completed_at = null, completed_by = null, updated_by = v_actor, updated_at = s.at
        where id = c.task_id;
        insert into public.forge_task_activity (organization_id, task_id, activity_type, message, actor_user_id, created_at)
        values (v_org, c.task_id, 'canceled_from_capa', 'Task canceled because the linked Corrective Action was canceled.', v_actor, s.at);
      end if;

      v_from := s.to_status;
    end loop;
  end loop;
end
$$;

-- CAPA comments.
insert into public.forge_corrective_action_comments (organization_id, corrective_action_id, comment, created_by, created_at)
values
  ('20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000004002','Expanded metal and hardware are on order; supplier promised delivery this week. Conveyor 6 stays locked out until the guard is on.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(6,'10:15')),
  ('20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000004005','Vendor quote approved. Lifter ships in about two weeks; electrician will run power to the station before it arrives.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(30,'14:00')),
  ('20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000004006','Night shift refresher completed with Tamika''s crew. Ready for verification again.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(45,'15:45')),
  ('20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000004010','Concrete contractor scheduled after harvest. Jersey barriers stay in place until the bollards are set.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(12,'11:30')),
  ('20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000004011','Mirror installed at door 4. Walkway striping is scheduled for Saturday when the dock is closed.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(5,'15:10'));

insert into public.forge_corrective_action_activity (organization_id, corrective_action_id, activity_type, message, actor_user_id, created_at)
select organization_id, corrective_action_id, 'comment_added', 'Comment added.', created_by, created_at
from public.forge_corrective_action_comments
where corrective_action_id in (select id from cb_capa);

-- Source records point at the CAPAs they generated (record links, as the observation flow creates them).
insert into public.forge_record_links (organization_id, source_resource_type, source_resource_id, target_resource_type, target_resource_id, relationship_type, created_by, created_at)
select '20000000-0000-4000-8000-000000000100'::uuid, c.source_link_type, c.source_id, 'corrective_action', c.id, 'generated_capa',
       '20000000-0000-4000-8000-000000000001'::uuid, c.created_at
from cb_capa c
where c.source_link_type is not null
on conflict do nothing;

insert into public.forge_record_activity (organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata, created_at)
select l.organization_id, l.source_resource_type, l.source_resource_id, 'record_link_created', 'Linked to corrective_action record.', l.created_by,
       jsonb_build_object('link_id', l.id, 'target_resource_id', l.target_resource_id, 'relationship_type', l.relationship_type), l.created_at
from public.forge_record_links l
where l.relationship_type = 'generated_capa' and l.target_resource_id in (select id from cb_capa);

-- The forklift alarm task corrects the pre-shift finding.
insert into public.forge_record_links (organization_id, source_resource_type, source_resource_id, target_resource_type, target_resource_id, relationship_type, created_by, created_at)
values ('20000000-0000-4000-8000-000000000100','task','20000000-0000-4000-8000-000000001301','inspection_finding','63000000-0000-4000-8000-000000003203','corrects','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(6,'10:55'))
on conflict do nothing;

insert into public.forge_record_activity (organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata, created_at)
select l.organization_id, l.source_resource_type, l.source_resource_id, 'record_link_created', 'Linked to inspection_finding record.', l.created_by,
       jsonb_build_object('link_id', l.id, 'target_resource_id', l.target_resource_id, 'relationship_type', l.relationship_type), l.created_at
from public.forge_record_links l
where l.source_resource_type = 'task' and l.source_resource_id = '20000000-0000-4000-8000-000000001301' and l.relationship_type = 'corrects';

-- Standalone task history (types/messages from the Tasks server actions).
insert into public.forge_task_activity (organization_id, task_id, activity_type, message, actor_user_id, created_at)
select '20000000-0000-4000-8000-000000000100'::uuid, v.task_id::uuid, v.activity_type, v.message, '20000000-0000-4000-8000-000000000001'::uuid, v.at
from (values
  ('20000000-0000-4000-8000-000000001301','updated','Task details updated.', pg_temp.cb_at(5,'06:00')),
  ('20000000-0000-4000-8000-000000001301','comment_added','Comment added.', pg_temp.cb_at(3,'15:30')),
  ('63000000-0000-4000-8000-000000005101','created','Task created.', pg_temp.cb_at(55,'08:20')),
  ('63000000-0000-4000-8000-000000005101','completed','Task completed.', pg_temp.cb_at(50,'10:40')),
  ('63000000-0000-4000-8000-000000005102','created','Task created.', pg_temp.cb_at(21,'05:00')),
  ('63000000-0000-4000-8000-000000005102','completed','Task completed.', pg_temp.cb_at(20,'09:00')),
  ('63000000-0000-4000-8000-000000005103','created','Task created.', pg_temp.cb_at(5,'09:15')),
  ('63000000-0000-4000-8000-000000005104','created','Task created.', pg_temp.cb_at(16,'13:00')),
  ('63000000-0000-4000-8000-000000005104','updated','Task details updated.', pg_temp.cb_at(10,'08:00')),
  ('63000000-0000-4000-8000-000000005105','created','Task created.', pg_temp.cb_at(8,'10:30')),
  ('63000000-0000-4000-8000-000000005106','created','Task created.', pg_temp.cb_at(14,'11:00')),
  ('63000000-0000-4000-8000-000000005106','updated','Task details updated.', pg_temp.cb_at(9,'08:00')),
  ('63000000-0000-4000-8000-000000005106','updated','Task details updated.', pg_temp.cb_at(6,'09:30')),
  ('63000000-0000-4000-8000-000000005106','comment_added','Comment added.', pg_temp.cb_at(6,'09:30')),
  ('63000000-0000-4000-8000-000000005107','created','Task created.', pg_temp.cb_at(3,'09:00')),
  ('63000000-0000-4000-8000-000000005108','created','Task created.', pg_temp.cb_at(80,'09:30')),
  ('63000000-0000-4000-8000-000000005108','updated','Task details updated.', pg_temp.cb_at(72,'07:00')),
  ('63000000-0000-4000-8000-000000005108','completed','Task completed.', pg_temp.cb_at(70,'14:20'))
) as v(task_id, activity_type, message, at);

insert into public.forge_task_comments (organization_id, task_id, comment, created_by, created_at)
values
  ('20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000001301','Backup alarm replaced and tested in the shop. Truck is still tagged out until the operator confirms it on a pre-shift check.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(3,'15:30')),
  ('20000000-0000-4000-8000-000000000100','63000000-0000-4000-8000-000000005106','On hold: waiting on the anchor manufacturer''s inspection criteria for the older davit bases.','20000000-0000-4000-8000-000000000001', pg_temp.cb_at(6,'09:30'));

drop table cb_capa_step;
drop table cb_capa;
