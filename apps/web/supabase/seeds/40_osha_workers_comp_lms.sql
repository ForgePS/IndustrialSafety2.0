-- Seed-only helpers live in a scratch schema, not session temp objects: the Supabase CLI does not
-- guarantee one database session per seed file, so temp tables and pg_temp functions can vanish
-- between statements. Dropped at the end of this file.
drop schema if exists demo_seed_40 cascade;
create schema demo_seed_40;

-- =============================================================================
-- Demo plant: OSHA recordkeeping, workers' compensation, training LMS content and
-- personnel sensitive data / emergency contacts for Cypress Bend Rice Mill.
-- Local development and sales-demo data only. Loaded after 10_cypress_bend_plant.sql.
--
-- Id namespace: 64000000-0000-4000-8000-xxxxxxxxxxxx
--   OSHA cases ..0101-0107 (current year), ..0111-0112 (prior year); 300A ..0151-0152
--   WC carrier ..0201; WC cases ..0301-0306; periods ..04xx; restrictions ..05xx;
--   medical ..06xx; weekly updates ..07xx
--   LMS courses ..1001-1003; versions ..11xx; sections ..12xx; questions ..13xx;
--   groups ..14xx; assignments ..15xx; attempts ..16xx; completions ..17xx;
--   kiosk link ..1901; emergency contacts ..18xx
--
-- Cases are not tied to incidents by id (the incidents file owns those). The block at the
-- end links an OSHA / workers' comp case to an injury incident only when one exists for the
-- same employee (incident person role injured/involved) and the same local injury date.
--
-- Dates are relative to the day the seed runs. Workers' comp day counts on the OSHA log are
-- calculated from the work-status periods with the app's OSHA counting rules.
-- =============================================================================

-- Helpers (session only).
create or replace function demo_seed_40.cb_ts(p_days_ago integer, p_time text)
returns timestamptz language sql stable as $$
  select ((current_date - p_days_ago) + p_time::time) at time zone 'America/Chicago'
$$;

create or replace function demo_seed_40.cb_id(p_suffix integer)
returns uuid language sql immutable as $$
  select ('64000000-0000-4000-8000-' || lpad(p_suffix::text, 12, '0'))::uuid
$$;

-- Days away / restricted from work-status periods (lib/forgeWorkersCompRules.ts calculateWorkDays):
-- calendar days, not counting the injury day, through today for an open period.
create or replace function demo_seed_40.cb_wc_days(p_case_id uuid, out days_away integer, out restricted_days integer)
language sql stable as $$
  select
    coalesce(sum(d) filter (where work_status = 'off_work'), 0)::integer,
    coalesce(sum(d) filter (where work_status = 'restricted'), 0)::integer
  from (
    select p.work_status,
      greatest(0, least(coalesce(p.end_date, current_date), current_date) - greatest(p.start_date, c.injury_date + 1) + 1) as d
    from public.forge_wc_work_status_periods p
    join public.forge_wc_cases c on c.id = p.case_id
    where p.case_id = p_case_id and p.work_status in ('off_work', 'restricted')
  ) x
$$;

-- =============================================================================
-- Personnel extras (20261023100000): sensitive data used by OSHA Form 301 and emergency contacts.
-- The seeded demo user (..0600) is left alone: the OSHA smoke test writes its own values there.
-- =============================================================================

insert into public.forge_personnel_sensitive (personnel_id, organization_id, date_of_birth, sex, address_line1, city, state_region, postal_code, country_code, updated_by, created_at)
select ('60000000-0000-4000-8000-0000000030' || v.nn)::uuid, '20000000-0000-4000-8000-000000000100', v.dob::date, v.sex, v.street, v.city, 'AR', v.zip, 'US',
       '20000000-0000-4000-8000-000000000001', now() - interval '300 days'
from (values
  ('01','1972-04-19','female','118 Magnolia Lane','DeWitt','72042'),
  ('02','1984-09-02','male','2406 S Buerkle St','Stuttgart','72160'),
  ('03','1979-01-27','male','47 Bayou Meto Rd','Gillett','72055'),
  ('04','1986-11-08','female','605 W Cross St','DeWitt','72042'),
  ('05','1990-06-14','male','1312 N Prairie St','Stuttgart','72160'),
  ('06','1994-03-30','male','220 Pecan Grove Dr','DeWitt','72042'),
  ('07','1999-12-05','female','78 Levee Rd','Humphrey','72073'),
  ('08','2002-07-21','male','915 E 3rd St','DeWitt','72042'),
  ('09','1977-10-11','male','31 Cypress Point','Almyra','72003'),
  ('10','1983-02-23','male','1701 S Main St','Stuttgart','72160'),
  ('11','1991-08-16','male','402 Oak St','DeWitt','72042'),
  ('12','1988-05-04','female','66 County Road 412','St. Charles','72140'),
  ('13','1965-12-12','male','12 Rice Belt Rd','Gillett','72055'),
  ('14','2004-03-09','female','209 W 1st St','DeWitt','72042'),
  ('15','1987-09-28','male','804 Park Ave','Stuttgart','72160'),
  ('16','1975-07-01','female','350 Jefferson St','DeWitt','72042'),
  ('17','1996-01-18','male','1120 S Leslie St','Stuttgart','72160'),
  ('18','1981-04-26','female','27 Mallard Ct','DeWitt','72042'),
  ('19','1993-10-07','male','560 Hwy 1 S','Gillett','72055'),
  ('20','1989-02-13','female','143 Walnut St','DeWitt','72042'),
  ('21','2000-05-31','male','718 E Michigan St','Stuttgart','72160'),
  ('22','1968-08-20','male','5 Old Arkansas Post Rd','Gillett','72055'),
  ('23','1985-12-29','male','2210 W 22nd St','Stuttgart','72160'),
  ('24','1992-06-03','female','91 Lakeview Dr','DeWitt','72042')
) as v(nn, dob, sex, street, city, zip)
on conflict (personnel_id) do nothing;

insert into public.forge_personnel_emergency_contacts (id, organization_id, personnel_id, priority, name, relationship, phone, alternate_phone, updated_by, created_at)
select demo_seed_40.cb_id(1800 + v.n), '20000000-0000-4000-8000-000000000100', ('60000000-0000-4000-8000-0000000030' || v.nn)::uuid,
       v.priority, v.name, v.relationship, v.phone, v.alt, '20000000-0000-4000-8000-000000000001', now() - interval '280 days'
from (values
  (1,'01',1,'Robert Carter','Spouse','870-555-0141',null),
  (2,'02',1,'Lisa Bell','Spouse','870-555-0142','870-555-0172'),
  (3,'03',1,'Annette Thibodeaux','Spouse','870-555-0143',null),
  (4,'05',1,'Rosa Hernandez','Spouse','870-555-0145',null),
  (5,'05',2,'Miguel Hernandez','Brother','870-555-0175',null),
  (6,'08',1,'Denise Pierce','Mother','870-555-0148',null),
  (7,'10',1,'Carmen Ramos','Spouse','870-555-0150',null),
  (8,'13',1,'Loretta Broussard','Spouse','870-555-0153','870-555-0183'),
  (9,'14',1,'Dale Arceneaux','Father','870-555-0154',null),
  (10,'14',2,'Kim Arceneaux','Mother','870-555-0184',null),
  (11,'18',1,'Paul Lejeune','Spouse','870-555-0158',null),
  (12,'21',1,'Gloria Jackson','Mother','870-555-0161',null),
  (13,'22',1,'Sharon Hebert','Spouse','870-555-0162',null),
  (14,'11',1,'Amber Guidry','Spouse','870-555-0151',null),
  (15,'15',1,'Keisha Hayes','Spouse','870-555-0155',null)
) as v(n, nn, priority, name, relationship, phone, alt)
on conflict (id) do nothing;

-- =============================================================================
-- Workers' compensation
-- =============================================================================

insert into public.forge_wc_carriers (id, organization_id, name, policy_number, contact_name, phone, email, claims_address, is_active, created_by, updated_by, created_at)
values (
  demo_seed_40.cb_id(201), '20000000-0000-4000-8000-000000000100', 'Lower Delta Mutual Insurance', 'WC-44-118203', 'Pamela Reyes',
  '501-555-0182', 'claims@lowerdeltamutual.example', 'PO Box 4410, Little Rock, AR 72214', true,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '120 days'
)
on conflict (id) do nothing;

-- Cases, numbered in injury-date order (WC-YYYY-NNNN per injury year), as next_forge_wc_case_number would.
with c(id, person, name, injury_ago, reported_ago, status, stage, severity, body, claim, notes, na_label, na_due, na_priority, closed_ago) as (
  values
  (301, '3010', 'Hector Ramos', 78, 78, 'closed', 'closed', 'moderate', 'Left forearm', 'LDM-0418827',
   'Medical-only claim. Sutures removed at the day-10 recheck; no lost time or restrictions.', null, null, null, 63),
  (302, '3014', 'Shelby Arceneaux', 58, 58, 'closed', 'closed', 'lost_time', 'Whole body (heat illness)', 'LDM-0421150',
   'ER visit with IV fluids. Off work the next day, cleared to full duty by the clinic. Carrier paid the ER bill.', null, null, null, 48),
  (303, '3005', 'Luis Hernandez', 52, 52, 'closed', 'closed', 'restricted', 'Lower back', 'LDM-0422093',
   'Lumbar strain. Light duty in the mill control room for 18 days, then released to full duty after physical therapy.', null, null, null, 26),
  (304, '3013', 'Earl Broussard', 33, 33, 'active', 'claim_admin', 'moderate', 'Right eye', 'LDM-0425561',
   'Corneal foreign body removed by the eye clinic; healed at the follow-up. Waiting on the carrier to pay the final eye clinic bill.',
   'Confirm the carrier paid the final eye clinic bill', 3, 'medium', null),
  (305, '3018', 'Rhonda Lejeune', 24, 24, 'active', 'return_to_work', 'lost_time', 'Right foot', 'LDM-0426802',
   'Two metatarsal fractures. Off work 9 days, now on seated transitional duty in the shipping office. Walking boot until orthopedics clears her.',
   'Orthopedic follow-up: get an updated work status note', 2, 'high', null),
  (306, '3008', 'Jamal Pierce', 4, 3, 'active', 'medical_review', null, 'Right wrist', null,
   'Reported the morning after the night shift. Clinic advised ice and over-the-counter ibuprofen; follow-up visit decides whether restrictions are needed.',
   'Follow-up clinic visit, then decide OSHA recordability', 3, 'high', null)
),
numbered as (
  select c.*, (current_date - injury_ago) as injury_date,
         row_number() over (partition by extract(year from current_date - injury_ago) order by injury_ago desc) as seq
  from c
)
insert into public.forge_wc_cases (
  id, organization_id, case_number, incident_id, personnel_id, employee_name, location_id, division_id,
  injury_date, reported_date, status, stage, severity, carrier_id, is_self_pay, claim_number,
  adjuster_name, adjuster_phone, adjuster_email, body_parts, claim_notes,
  next_action_label, next_action_due, next_action_priority,
  closed_at, closed_by, created_by, updated_by, created_at
)
select
  demo_seed_40.cb_id(n.id), '20000000-0000-4000-8000-000000000100',
  'WC-' || extract(year from n.injury_date)::text || '-' || lpad(n.seq::text, 4, '0'),
  null, ('60000000-0000-4000-8000-00000000' || n.person)::uuid, n.name,
  '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200',
  n.injury_date, current_date - n.reported_ago, n.status, n.stage, n.severity,
  case when n.claim is not null then demo_seed_40.cb_id(201) end, false, n.claim,
  case when n.claim is not null then 'Pamela Reyes' end,
  case when n.claim is not null then '501-555-0182' end,
  case when n.claim is not null then 'pamela.reyes@lowerdeltamutual.example' end,
  n.body, n.notes, n.na_label, current_date + n.na_due, n.na_priority,
  case when n.closed_ago is not null then demo_seed_40.cb_ts(n.closed_ago, '15:20') end,
  case when n.closed_ago is not null then '20000000-0000-4000-8000-000000000001'::uuid end,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  demo_seed_40.cb_ts(n.reported_ago, '13:05')
from numbered n
on conflict (id) do nothing;

insert into public.forge_wc_case_sequences (organization_id, case_year, next_value)
select '20000000-0000-4000-8000-000000000100', extract(year from injury_date)::integer, count(*) + 1
from public.forge_wc_cases
where id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306)
group by 2
on conflict (organization_id, case_year) do update
set next_value = greatest(public.forge_wc_case_sequences.next_value, excluded.next_value);

-- Work status periods (drive days away / restricted).
insert into public.forge_wc_work_status_periods (id, organization_id, case_id, work_status, start_date, end_date, notes, created_by, updated_by, created_at)
select demo_seed_40.cb_id(v.id), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(v.case_n), v.status,
       current_date - v.start_ago, current_date - v.end_ago, v.notes,
       '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', demo_seed_40.cb_ts(v.start_ago, '16:10')
from (values
  (401, 301, 'full_duty', 78, 63, 'Returned to his regular job after the clinic visit.'),
  (402, 302, 'off_work', 57, 57, 'ER discharge note: rest and fluids for 24 hours.'),
  (403, 302, 'full_duty', 56, 48, 'Clinic cleared her to full duty with acclimatization breaks.'),
  (404, 303, 'restricted', 51, 34, 'No lifting over 20 lb, no repetitive bending.'),
  (405, 303, 'full_duty', 33, 26, 'Released to full duty after physical therapy.'),
  (406, 304, 'full_duty', 33, null, 'No time lost; full duty with safety goggles over glasses for dryer cleaning.'),
  (407, 305, 'off_work', 24, 15, 'Non-weight-bearing per ER and orthopedics.'),
  (408, 305, 'restricted', 14, null, 'Seated transitional duty in the shipping office.'),
  (409, 306, 'full_duty', 4, null, 'Clinic did not restrict work pending the follow-up visit.')
) as v(id, case_n, status, start_ago, end_ago, notes)
on conflict (id) do nothing;

insert into public.forge_wc_restrictions (
  id, organization_id, case_id, start_date, end_date, status, stand_walk_hours, sit_hours, lifting_level,
  upper_extremity, push_pull_limit_lbs, lower_extremity, transitional_hours_per_day, description, created_by, updated_by, created_at
)
values
  (demo_seed_40.cb_id(501), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(303), current_date - 51, current_date - 34, 'lifted',
   '6-8', 'unlimited', 'light', array['no-lift-floor-waist'], 25, array['no-stooping-bending'], 8,
   'Light duty in the mill control room and sample station: grading samples, logbook and walk-down checks. No shoveling, no bag handling.',
   '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', demo_seed_40.cb_ts(51, '08:30')),
  (demo_seed_40.cb_id(502), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(305), current_date - 14, null, 'active',
   '1-4', 'unlimited', 'sedentary', array[]::text[], null, array['no-foot-pedal','no-ladders','no-squatting-kneeling'], 8,
   'Seated work in the shipping office: bill of lading prep, scale ticket reconciliation and bag label printing. No forklift or pallet jack. Walking boot on at all times.',
   '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', demo_seed_40.cb_ts(14, '07:45'))
on conflict (id) do nothing;

insert into public.forge_wc_medical_encounters (
  id, organization_id, case_id, encounter_date, provider_name, provider_specialty, facility, symptoms, exam_findings,
  diagnosis, assessment, treatment, medication, notes, next_appointment_date, created_by, updated_by, created_at
)
select demo_seed_40.cb_id(v.id), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(v.case_n), current_date - v.ago,
       v.provider, v.specialty, v.facility, v.symptoms, v.findings, v.diagnosis, v.assessment, v.treatment, v.medication, v.notes,
       current_date - v.next_ago, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', demo_seed_40.cb_ts(v.ago, '17:30')
from (values
  (601, 301, 78, 'Dr. Alan Whitfield', 'Occupational medicine', 'Delta OccuCare Clinic, DeWitt', 'Bleeding cut to left forearm.',
   '4 cm laceration, clean edges, no tendon involvement.', 'Laceration of left forearm', 'Simple repair.', 'Six sutures; tetanus booster.', null,
   'Keep dry 48 hours.', 68),
  (602, 301, 68, 'Dr. Alan Whitfield', 'Occupational medicine', 'Delta OccuCare Clinic, DeWitt', 'None.', 'Wound healed.', 'Laceration, healed',
   'Resolved.', 'Sutures removed.', null, 'Released from care.', null),
  (603, 302, 58, 'Dr. Priya Raman', 'Emergency medicine', 'Bayou Meto Regional Hospital, Stuttgart', 'Dizziness, nausea, heavy sweating.',
   'Tachycardic, temperature 100.4 F, alert and oriented.', 'Heat exhaustion', 'Volume depleted; no signs of heat stroke.', 'IV fluids (2 L), cooling.',
   null, 'Discharged same evening. Rest 24 hours.', 56),
  (604, 302, 56, 'Dr. Alan Whitfield', 'Occupational medicine', 'Delta OccuCare Clinic, DeWitt', 'None.', 'Normal exam.', 'Heat exhaustion, resolved',
   'Fit for full duty.', 'Return-to-work clearance; acclimatization schedule for the rest of harvest.', null, null, null),
  (605, 303, 52, 'Dr. Alan Whitfield', 'Occupational medicine', 'Delta OccuCare Clinic, DeWitt', 'Low back pain after twisting with a shovel.',
   'Paraspinal tenderness L4-L5, no radicular signs.', 'Lumbar strain', 'Mechanical strain.', 'Restrictions; home exercise program.',
   'Naproxen 500 mg twice daily (prescription)', null, 45),
  (606, 303, 45, 'Jordan Pitts, PT', 'Physical therapy', 'Delta OccuCare Clinic, DeWitt', 'Improving stiffness.', 'Range of motion improving.',
   'Lumbar strain', 'Progressing.', 'Physical therapy twice weekly for 3 weeks.', null, null, 34),
  (607, 303, 34, 'Dr. Alan Whitfield', 'Occupational medicine', 'Delta OccuCare Clinic, DeWitt', 'No pain.', 'Full range of motion.',
   'Lumbar strain, resolved', 'Released.', 'Released to full duty.', null, null, null),
  (608, 304, 33, 'Dr. Laura Benoit', 'Ophthalmology', 'Prairie Eye Center, Stuttgart', 'Gritty feeling and tearing, right eye.',
   'Embedded corneal foreign body, right eye.', 'Corneal foreign body, right eye', 'Removed with a needle under slit lamp.',
   'Foreign body removal.', 'Moxifloxacin eye drops (prescription)', 'Wear safety goggles for dryer cleaning.', 30),
  (609, 304, 30, 'Dr. Laura Benoit', 'Ophthalmology', 'Prairie Eye Center, Stuttgart', 'None.', 'Cornea healed, no infection.',
   'Corneal abrasion, healed', 'Resolved.', 'No further treatment.', null, 'Released from care.', null),
  (610, 305, 24, 'Dr. Thomas Greer', 'Emergency medicine', 'Bayou Meto Regional Hospital, Stuttgart', 'Pain and swelling, top of right foot.',
   'X-ray: non-displaced fractures, 2nd and 3rd metatarsals.', 'Fractures of right 2nd and 3rd metatarsals', 'Non-displaced.',
   'Walking boot, crutches, non-weight-bearing.', 'Hydrocodone-acetaminophen (3 days)', 'Referred to orthopedics.', 20),
  (611, 305, 20, 'Dr. Samuel Okafor', 'Orthopedics', 'Grand River Orthopedics, Pine Bluff', 'Pain improving.', 'Healing as expected.',
   'Fractures of right 2nd and 3rd metatarsals', 'Healing.', 'Boot continues; weight-bearing as tolerated from day 10.', null,
   'Seated transitional duty may start on day 10.', -2),
  (612, 306, 3, 'Dr. Alan Whitfield', 'Occupational medicine', 'Delta OccuCare Clinic, DeWitt', 'Right wrist pain after forcing a slide gate.',
   'Mild tenderness, full grip strength, no swelling.', 'Right wrist strain', 'Minor strain.', 'Ice, wrist support as needed.',
   'Ibuprofen 200 mg as needed (over the counter)', 'Recheck in one week.', -3)
) as v(id, case_n, ago, provider, specialty, facility, symptoms, findings, diagnosis, assessment, treatment, medication, notes, next_ago)
on conflict (id) do nothing;

-- Weekly status notes: one per open case per Thursday since the injury, up to the close date and before
-- this week. Earl Broussard's most recent week is missing on purpose (shows as overdue).
with notes(case_n, k, note) as (
  values
  (301, 1, 'Working full duty. Suture recheck scheduled at the clinic.'),
  (301, 2, 'Sutures out, wound healed. Recommend closing as medical-only.'),
  (302, 1, 'Back at full duty with extra water and shade breaks. ER bill sent to carrier.'),
  (302, 2, 'No symptoms since return. Carrier confirmed ER payment; ready to close.'),
  (303, 1, 'Light duty in the control room. Starting PT next week.'),
  (303, 2, 'PT twice a week; pain improving. Restrictions unchanged.'),
  (303, 3, 'PT going well. Clinic recheck next week for release.'),
  (303, 4, 'Released to full duty; restrictions lifted. Watching for any flare-up.'),
  (303, 5, 'Full duty two weeks with no complaints. Closing after final PT invoice.'),
  (304, 1, 'Full duty. Eye clinic follow-up showed the cornea healed.'),
  (304, 2, 'No issues. Waiting on the eye clinic bill to reach the carrier.'),
  (304, 3, 'Carrier received the bill; payment pending.'),
  (305, 1, 'Off work, non-weight-bearing. Orthopedic visit set for next week.'),
  (305, 2, 'Ortho cleared seated duty from day 10. Started in the shipping office.'),
  (305, 3, 'Seated duty going well; boot still on. Next ortho visit this coming week.')
),
weeks as (
  select c.id as case_id, c.injury_date, coalesce(c.closed_at::date, current_date) as last_day, n as case_n,
         t.week_of, row_number() over (partition by c.id order by t.week_of) as k
  from (values (301), (302), (303), (304), (305)) as cases(n)
  join public.forge_wc_cases c on c.id = demo_seed_40.cb_id(cases.n)
  cross join lateral (
    select (current_date + (4 - extract(dow from current_date))::integer) - 7 * g as week_of
    from generate_series(0, 20) g
  ) t
  where t.week_of >= c.injury_date
    and t.week_of <= coalesce(c.closed_at::date, current_date)
)
insert into public.forge_wc_weekly_updates (id, organization_id, case_id, week_of, notes, created_by, updated_by, created_at)
select demo_seed_40.cb_id(700 + (w.case_n - 300) * 10 + w.k::integer), '20000000-0000-4000-8000-000000000100', w.case_id, w.week_of,
       coalesce(n.note, 'No change this week.'),
       '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
       (w.week_of + time '14:30') at time zone 'America/Chicago'
from weeks w
left join notes n on n.case_n = w.case_n and n.k = w.k
where not (w.case_n = 304 and w.week_of = (current_date + (4 - extract(dow from current_date))::integer)
                                          - case when extract(dow from current_date) >= 4 then 0 else 7 end)
  and (w.week_of + time '14:30') at time zone 'America/Chicago' < now()
on conflict (id) do nothing;

-- Case history, as the app writes it (first load only: activity ids are identities).
insert into public.forge_wc_case_activity (organization_id, case_id, activity_type, message, actor_user_id, created_at)
select h.organization_id, h.case_id, h.activity_type, h.message, h.actor_user_id, h.created_at
from (
select organization_id, id as case_id, 'opened' as activity_type, 'Case opened.' as message, '20000000-0000-4000-8000-000000000001'::uuid as actor_user_id, created_at
from public.forge_wc_cases where id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306)
union all
select organization_id, id, 'updated', 'Stage: ' || case stage when 'closed' then 'Claim administration' when 'claim_admin' then 'Claim administration'
         when 'return_to_work' then 'Return to work' else 'Medical review' end || '.',
       '20000000-0000-4000-8000-000000000001', created_at + interval '50 minutes'
from public.forge_wc_cases where id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306)
union all
select p.organization_id, p.case_id, 'work_status',
       'Work status: ' || case p.work_status when 'full_duty' then 'Full duty' when 'restricted' then 'Restricted / transitional duty' else 'Off work (lost time)' end
         || ' from ' || p.start_date || case when p.end_date is not null and p.end_date < current_date then ' to ' || p.end_date else '' end || '.',
       '20000000-0000-4000-8000-000000000001', p.created_at
from public.forge_wc_work_status_periods p where p.case_id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306)
union all
select r.organization_id, r.case_id, 'restriction', 'Restrictions recorded from ' || r.start_date || '.', '20000000-0000-4000-8000-000000000001', r.created_at
from public.forge_wc_restrictions r where r.case_id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306)
union all
select r.organization_id, r.case_id, 'restriction', 'Restrictions lifted ' || r.end_date || '.', '20000000-0000-4000-8000-000000000001',
       (r.end_date + time '15:00') at time zone 'America/Chicago'
from public.forge_wc_restrictions r where r.case_id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306) and r.status = 'lifted'
union all
select m.organization_id, m.case_id, 'medical', 'Medical visit on ' || m.encounter_date || ' recorded.', '20000000-0000-4000-8000-000000000001', m.created_at
from public.forge_wc_medical_encounters m where m.case_id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306)
union all
select u.organization_id, u.case_id, 'weekly_update', 'Weekly update for the week of ' || u.week_of || ' recorded.', '20000000-0000-4000-8000-000000000001', u.created_at
from public.forge_wc_weekly_updates u where u.case_id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306)
union all
select organization_id, id, 'closed', 'Case closed.', closed_by, closed_at
from public.forge_wc_cases where id between demo_seed_40.cb_id(301) and demo_seed_40.cb_id(306) and status = 'closed'
) h
where not exists (select 1 from public.forge_wc_case_activity a where a.case_id = h.case_id)
order by h.created_at;

-- =============================================================================
-- OSHA recordkeeping: Form 300 log for this year (Main Plant) and last year's certified 300A.
-- =============================================================================

with c(id, person, name, job_title, injury_ago, began, happened, place, descr, recordability, nr_reason, privacy, outcome, case_type,
       wc_case, fixed_away, fixed_restricted, physician, facility, street, city, zip, er, activity, what, injury, object, status, closed_ago) as (
  values
  (101, '3010', 'Hector Ramos', 'Maintenance Technician', 78, '06:00', '09:40', 'Bucket elevator No. 3 boot pit, Milling building',
   'Laceration, left forearm (6 sutures)', 'recordable', null, false, 'other_recordable', 'injury', 301, null, null,
   'Dr. Alan Whitfield', 'Delta OccuCare Clinic', '410 Court Street', 'DeWitt', '72042', false,
   'Replacing the boot inspection door on bucket elevator No. 3 during a scheduled lockout.',
   'While fitting the new sheet-metal door panel, his left forearm slid along the cut edge of the panel. He was wearing gloves but not cut-resistant sleeves.',
   'Laceration about 4 cm long on the left forearm, closed with six sutures.', 'Cut edge of a sheet-metal elevator boot panel', 'closed', 62),
  (102, '3014', 'Shelby Arceneaux', 'Dryer Operator', 58, '06:00', '14:50', 'Receiving pit and dryer No. 2 platform',
   'Heat exhaustion', 'recordable', null, true, 'days_away', 'other_illness', 302, null, null,
   'Dr. Priya Raman', 'Bayou Meto Regional Hospital', '1600 Hospital Drive', 'Stuttgart', '72160', true,
   'Clearing a plugged dryer garner during a 12-hour harvest shift; heat index near 105 F.',
   'She became dizzy and nauseated on the dryer platform. Coworkers moved her to the air-conditioned control room and the shift supervisor drove her to the emergency room.',
   'Heat exhaustion, treated with IV fluids.', 'Hot, humid conditions on the dryer platform', 'closed', 47),
  (103, '3005', 'Luis Hernandez', 'Mill Operator', 52, '06:00', '10:15', 'Drag conveyor DC-4 discharge, Milling building 2nd floor',
   'Low back strain', 'recordable', null, false, 'job_transfer_restriction', 'injury', 303, null, null,
   'Dr. Alan Whitfield', 'Delta OccuCare Clinic', '410 Court Street', 'DeWitt', '72042', false,
   'Shoveling spilled paddy rice away from a plugged drag conveyor discharge.',
   'He felt a sharp pain in his lower back while twisting to throw a shovel load of rice into a tote.',
   'Lumbar strain; physician restricted lifting to 20 lb with no repetitive bending.', 'Shovel and spilled paddy rice', 'closed', 25),
  (104, '3013', 'Earl Broussard', 'Dryer Operator', 33, '05:30', '08:20', 'Dryer No. 1 column screens, Drying & Storage',
   'Foreign body, right eye', 'recordable', null, false, 'other_recordable', 'injury', 304, null, null,
   'Dr. Laura Benoit', 'Prairie Eye Center', '220 S Main Street', 'Stuttgart', '72160', false,
   'Brushing dust and hulls off the dryer No. 1 column screens.',
   'Hull fragments and grain dust blew under his safety glasses into his right eye. Flushing at the eyewash station did not remove the particle.',
   'Embedded corneal foreign body, right eye; removed by an ophthalmologist with a needle; prescription antibiotic drops.',
   'Rice hull fragment and grain dust', 'open', null),
  (105, '3018', 'Rhonda Lejeune', 'Forklift Operator', 24, '06:00', '13:35', 'Rail car loadout dock, Shipping & Receiving',
   'Fractured metatarsals, right foot', 'recordable', null, false, 'days_away', 'injury', 305, null, null,
   'Dr. Thomas Greer', 'Bayou Meto Regional Hospital', '1600 Hospital Drive', 'Stuttgart', '72160', true,
   'Re-stacking a shifted pallet of 50-lb bags of milled rice beside her forklift at the rail car loadout.',
   'The top layer of bags slid off the pallet and two bags struck the top of her right foot behind the safety toe cap.',
   'Non-displaced fractures of the 2nd and 3rd metatarsals, right foot; walking boot.', '50-lb bags of milled rice falling from a pallet', 'open', null),
  (106, '3021', 'Tyrone Jackson', 'Packaging Operator', 15, '06:00', '10:50', 'Bagging line 2 palletizer, Shipping & Receiving',
   'Abrasion, back of right hand', 'not_recordable',
   'First aid only: the abrasion was cleaned and covered with an adhesive bandage at the plant first-aid station (29 CFR 1904.7(b)(5)(ii)).',
   false, null, null, null, 0, 0,
   null, null, null, null, null, false,
   'Clearing a jammed bag at the bagging line 2 palletizer.',
   'He scraped the back of his right hand on a pallet edge while pulling the jammed bag free.',
   'Minor abrasion, back of right hand.', 'Wooden pallet edge', 'closed', 14),
  (107, '3008', 'Jamal Pierce', 'Mill Operator', 4, '18:00', '23:10', 'Whitener No. 2 feed hopper, Milling building',
   'Right wrist strain', 'pending', null, false, null, null, 306, 0, 0,
   'Dr. Alan Whitfield', 'Delta OccuCare Clinic', '410 Court Street', 'DeWitt', '72042', false,
   'Adjusting the feed to whitener No. 2 on the night shift.',
   'He reported right wrist pain after repeatedly forcing a sticking slide gate on the whitener feed hopper.',
   'Right wrist strain; clinic advised ice and over-the-counter ibuprofen. Follow-up visit scheduled.', 'Sticking hopper slide gate', 'open', null)
),
numbered as (
  select c.*, (current_date - injury_ago) as injury_date,
         row_number() over (partition by extract(year from current_date - injury_ago) order by injury_ago desc) as seq
  from c
)
insert into public.forge_osha_cases (
  id, organization_id, case_number, incident_id, personnel_id, location_id, division_id,
  employee_name, job_title, injury_date, event_location, injury_description,
  recordability, not_recordable_reason, is_privacy_case, case_outcome, case_type, days_away, restricted_days,
  employee_street, employee_city, employee_state, employee_zip, employee_date_of_birth, employee_date_hired, employee_sex,
  physician_name, treatment_facility, treatment_street, treatment_city, treatment_state, treatment_zip, treated_in_er, hospitalized_overnight,
  time_began_work, time_of_event, activity_before, what_happened, injury_or_illness, object_or_substance,
  completed_by_name, completed_by_title, completed_by_phone, completed_date,
  status, closed_at, closed_by, created_by, updated_by, created_at
)
select
  demo_seed_40.cb_id(n.id), '20000000-0000-4000-8000-000000000100',
  extract(year from n.injury_date)::text || '-' || lpad(n.seq::text, 3, '0'),
  null, p.id, '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200',
  n.name, n.job_title, n.injury_date, n.place, n.descr,
  n.recordability, n.nr_reason, n.privacy, n.outcome, n.case_type,
  coalesce(n.fixed_away, d.days_away, 0), coalesce(n.fixed_restricted, d.restricted_days, 0),
  s.address_line1, s.city, s.state_region, s.postal_code, s.date_of_birth, p.hire_date, s.sex,
  n.physician, n.facility, n.street, n.city, case when n.facility is not null then 'AR' end, n.zip,
  case when n.facility is not null then n.er end, case when n.facility is not null then false end,
  n.began::time, n.happened::time, n.activity, n.what, n.injury, n.object,
  'Marcus Bell', 'Safety Coordinator', '870-555-0102', current_date - n.injury_ago + 1,
  n.status,
  case when n.closed_ago is not null then demo_seed_40.cb_ts(n.closed_ago, '10:30') end,
  case when n.closed_ago is not null then '20000000-0000-4000-8000-000000000001'::uuid end,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  demo_seed_40.cb_ts(n.injury_ago - 1, '09:15')
from numbered n
join public.forge_personnel p on p.id = ('60000000-0000-4000-8000-00000000' || n.person)::uuid
left join public.forge_personnel_sensitive s on s.personnel_id = p.id
left join lateral demo_seed_40.cb_wc_days(demo_seed_40.cb_id(n.wc_case)) d on true
on conflict (id) do nothing;

-- Last year's log (two closed cases) for the certified 300A.
insert into public.forge_osha_cases (
  id, organization_id, case_number, incident_id, personnel_id, location_id, division_id,
  employee_name, job_title, injury_date, event_location, injury_description,
  recordability, is_privacy_case, case_outcome, case_type, days_away, restricted_days,
  employee_street, employee_city, employee_state, employee_zip, employee_date_of_birth, employee_date_hired, employee_sex,
  physician_name, treatment_facility, treatment_street, treatment_city, treatment_state, treatment_zip, treated_in_er, hospitalized_overnight,
  time_began_work, time_of_event, activity_before, what_happened, injury_or_illness, object_or_substance,
  completed_by_name, completed_by_title, completed_by_phone, completed_date,
  status, closed_at, closed_by, created_by, updated_by, created_at
)
select
  demo_seed_40.cb_id(v.id), '20000000-0000-4000-8000-000000000100', v.number, null, p.id,
  '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200',
  v.name, v.job_title, v.injury_date, v.place, v.descr, 'recordable', false, v.outcome, 'injury', v.away, v.restricted,
  s.address_line1, s.city, s.state_region, s.postal_code, s.date_of_birth, p.hire_date, s.sex,
  v.physician, v.facility, v.street, v.city, 'AR', v.zip, v.er, false,
  v.began::time, v.happened::time, v.activity, v.what, v.injury, v.object,
  'Marcus Bell', 'Safety Coordinator', '870-555-0102', v.injury_date + 1,
  'closed', ((v.injury_date + v.closed_after) + time '10:00') at time zone 'America/Chicago', '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  ((v.injury_date + 1) + time '09:00') at time zone 'America/Chicago'
from (values
  (111, (extract(year from current_date)::integer - 1)::text || '-001', '3011', 'Travis Guidry', 'Maintenance Technician',
   make_date(extract(year from current_date)::integer - 1, 6, 17), 'Screw conveyor SC-2, rough rice cleaning',
   'Fractured left ring finger', 'job_transfer_restriction', 0, 21,
   'Dr. Alan Whitfield', 'Delta OccuCare Clinic', '410 Court Street', 'DeWitt', '72042', false, '06:00', '11:25',
   'Reinstalling the drive guard on screw conveyor SC-2 after replacing a bearing.',
   'The guard slipped while he was aligning the bolt holes and pinched his left ring finger against the conveyor frame.',
   'Non-displaced fracture of the left ring finger; splint and restricted duty.', 'Conveyor drive guard and frame', 45),
  (112, (extract(year from current_date)::integer - 1)::text || '-002', '3015', 'Darnell Hayes', 'Dryer Operator',
   make_date(extract(year from current_date)::integer - 1, 9, 9), 'Dryer No. 2 burner housing, Drying & Storage',
   'Second-degree burn, right forearm', 'days_away', 3, 5,
   'Dr. Priya Raman', 'Bayou Meto Regional Hospital', '1600 Hospital Drive', 'Stuttgart', '72160', true, '18:00', '21:40',
   'Checking the burner flame on dryer No. 2 through the inspection port.',
   'His right forearm touched the hot burner housing while he leaned in to read the flame sensor.',
   'Second-degree burn on the right forearm; prescription burn cream and dressing changes.', 'Hot dryer burner housing', 30)
) as v(id, number, person, name, job_title, injury_date, place, descr, outcome, away, restricted, physician, facility, street, city, zip, er,
       began, happened, activity, what, injury, object, closed_after)
join public.forge_personnel p on p.id = ('60000000-0000-4000-8000-00000000' || v.person)::uuid
left join public.forge_personnel_sensitive s on s.personnel_id = p.id
on conflict (id) do nothing;

insert into public.forge_osha_case_sequences (organization_id, location_id, case_year, next_value)
select '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000300', calendar_year, count(*) + 1
from public.forge_osha_cases
where id in (select demo_seed_40.cb_id(g) from generate_series(101, 112) g)
group by calendar_year
on conflict (organization_id, location_id, case_year) do update
set next_value = greatest(public.forge_osha_case_sequences.next_value, excluded.next_value);

-- Case history.
insert into public.forge_osha_case_activity (organization_id, case_id, activity_type, message, actor_user_id, metadata, created_at)
select c.organization_id, c.id, 'opened', 'Case ' || c.case_number || ' opened.', c.created_by, '{}'::jsonb, c.created_at
from public.forge_osha_cases c
where c.id in (select demo_seed_40.cb_id(g) from generate_series(101, 112) g)
  and not exists (select 1 from public.forge_osha_case_activity a where a.case_id = c.id)
union all
select c.organization_id, c.id, 'updated',
       concat_ws('. ',
         'Recordability: ' || case c.recordability when 'recordable' then 'Recordable' else 'Not recordable' end,
         'Outcome: ' || case c.case_outcome when 'days_away' then 'Days away from work (H)' when 'job_transfer_restriction' then 'Job transfer or restriction (I)'
                                            when 'other_recordable' then 'Other recordable case (J)' end,
         case when c.days_away + c.restricted_days > 0 then 'Days away ' || c.days_away || ', restricted ' || c.restricted_days end,
         case when c.is_privacy_case then 'Marked privacy case' end) || '.',
       c.created_by,
       jsonb_build_object('changed_fields', jsonb_build_array('recordability', 'case_outcome', 'case_type', 'days_away', 'restricted_days', 'what_happened')),
       c.created_at + interval '1 day 2 hours'
from public.forge_osha_cases c
where c.id in (select demo_seed_40.cb_id(g) from generate_series(101, 112) g) and c.recordability <> 'pending'
  and not exists (select 1 from public.forge_osha_case_activity a where a.case_id = c.id)
union all
select c.organization_id, c.id, 'closed', 'Case closed.', c.closed_by, '{}'::jsonb, c.closed_at
from public.forge_osha_cases c
where c.id in (select demo_seed_40.cb_id(g) from generate_series(101, 112) g) and c.status = 'closed'
  and not exists (select 1 from public.forge_osha_case_activity a where a.case_id = c.id);

-- Form 300A: this year in draft with establishment info; last year certified (frozen totals from the log).
insert into public.forge_osha_establishment_years (
  id, organization_id, location_id, year, establishment_name, street, city, state, zip, industry_description, naics_code,
  annual_average_employees, total_hours_worked, status, created_by, updated_by, created_at
)
values (
  demo_seed_40.cb_id(151), '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000300', extract(year from current_date)::integer,
  'Cypress Bend Main Plant', '2200 Levee Road', 'DeWitt', 'AR', '72042', 'Rice milling', '311212',
  68, 118400, 'draft', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '41 days'
)
on conflict (organization_id, location_id, year) do nothing;

insert into public.forge_osha_establishment_years (
  id, organization_id, location_id, year, establishment_name, street, city, state, zip, industry_description, naics_code,
  annual_average_employees, total_hours_worked, status, certifier_name, certifier_title, certifier_phone, certification_date,
  certified_at, certified_by,
  certified_deaths, certified_days_away_cases, certified_transfer_cases, certified_other_cases, certified_days_away, certified_restricted_days,
  certified_injuries, certified_skin_disorders, certified_respiratory_conditions, certified_poisonings, certified_hearing_loss, certified_other_illnesses,
  created_by, updated_by, created_at
)
select
  demo_seed_40.cb_id(152), '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000300', y.yr,
  'Cypress Bend Main Plant', '2200 Levee Road', 'DeWitt', 'AR', '72042', 'Rice milling', '311212',
  64, 133120, 'certified', 'Denise Carter', 'Plant Manager', '870-555-0101', y.cert_date,
  (y.cert_date + time '10:15') at time zone 'America/Chicago', '20000000-0000-4000-8000-000000000001',
  coalesce(t.deaths, 0), coalesce(t.days_away_cases, 0), coalesce(t.transfer_cases, 0), coalesce(t.other_cases, 0),
  coalesce(t.days_away, 0), coalesce(t.restricted_days, 0), coalesce(t.injuries, 0), coalesce(t.skin_disorders, 0),
  coalesce(t.respiratory_conditions, 0), coalesce(t.poisonings, 0), coalesce(t.hearing_loss, 0), coalesce(t.other_illnesses, 0),
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  (y.cert_date - 9 + time '08:00') at time zone 'America/Chicago'
from (select extract(year from current_date)::integer - 1 as yr,
             least(make_date(extract(year from current_date)::integer, 1, 28), current_date) as cert_date) y
left join lateral public.forge_osha_300a_totals('20000000-0000-4000-8000-000000000100', y.yr, array['20000000-0000-4000-8000-000000000300'::uuid]) t on true
on conflict (organization_id, location_id, year) do nothing;

-- =============================================================================
-- Link to injury incidents when the incidents file seeded a matching one
-- (same employee as an injured/involved person, same local date). Mirrors what the app does
-- when a case is opened from an incident: flags on the incident plus incident activity.
-- Workers' comp cases on a linked recordable OSHA case are marked recordable and linked, so the
-- nightly OSHA refresh keeps their day counts current.
-- =============================================================================

do $$
declare
  r record;
  v_incident record;
begin
  for r in
    select o.id as osha_id, o.case_number, o.personnel_id, o.injury_date, o.recordability, o.is_privacy_case, o.case_type,
           w.id as wc_id, w.case_number as wc_number
    from public.forge_osha_cases o
    left join public.forge_wc_cases w on w.personnel_id = o.personnel_id and w.injury_date = o.injury_date
      and w.id in (select demo_seed_40.cb_id(g) from generate_series(301, 306) g)
    where o.id in (select demo_seed_40.cb_id(g) from generate_series(101, 107) g)
      and o.incident_id is null
  loop
    select i.id, i.incident_number, i.organization_id into v_incident
    from public.forge_incidents i
    join public.forge_incident_people ip on ip.incident_id = i.id and ip.personnel_id = r.personnel_id and ip.role in ('injured', 'involved')
    where i.organization_id = '20000000-0000-4000-8000-000000000100'
      and i.involves_injury
      and (i.occurred_at at time zone 'America/Chicago')::date = r.injury_date
      and not exists (
        select 1 from public.forge_osha_cases x
        where x.incident_id = i.id and x.personnel_id = r.personnel_id and x.status <> 'voided'
      )
    order by i.occurred_at
    limit 1;

    continue when not found;

    update public.forge_osha_cases set incident_id = v_incident.id where id = r.osha_id;

    update public.forge_incidents
    set osha_review_flag = true, workers_comp_review_flag = (r.wc_id is not null) or workers_comp_review_flag
    where id = v_incident.id;

    insert into public.forge_incident_activity (organization_id, incident_id, activity_type, message, actor_user_id, created_at)
    values (v_incident.organization_id, v_incident.id, 'osha_case_opened', 'OSHA case ' || r.case_number || ' opened.',
            '20000000-0000-4000-8000-000000000001', (select created_at from public.forge_osha_cases where id = r.osha_id));

    if r.wc_id is not null then
      update public.forge_wc_cases
      set incident_id = v_incident.id,
          osha_recordable = (r.recordability = 'recordable'),
          osha_privacy_case = (r.recordability = 'recordable' and r.is_privacy_case),
          osha_case_type = case when r.recordability = 'recordable' then r.case_type end,
          osha_case_id = case when r.recordability = 'recordable' then r.osha_id end,
          osha_synced_at = case when r.recordability = 'recordable' then created_at + interval '1 day 2 hours' end
      where id = r.wc_id;

      insert into public.forge_incident_activity (organization_id, incident_id, activity_type, message, actor_user_id, created_at)
      values (v_incident.organization_id, v_incident.id, 'workers_comp_case_opened', 'Workers'' comp case ' || r.wc_number || ' opened.',
              '20000000-0000-4000-8000-000000000001', (select created_at from public.forge_wc_cases where id = r.wc_id));

      if r.recordability = 'recordable' then
        insert into public.forge_wc_case_activity (organization_id, case_id, activity_type, message, actor_user_id, created_at)
        select organization_id, id, 'osha_synced', 'OSHA case ' || r.case_number || ' updated.', '20000000-0000-4000-8000-000000000001',
               created_at + interval '1 day 2 hours'
        from public.forge_wc_cases where id = r.wc_id;

        insert into public.forge_osha_case_activity (organization_id, case_id, activity_type, message, actor_user_id, metadata, created_at)
        select o.organization_id, o.id, 'synced_from_workers_comp', 'Updated from workers'' comp case ' || r.wc_number || '.',
               '20000000-0000-4000-8000-000000000001',
               jsonb_build_object('wc_case_id', r.wc_id, 'recordable', true, 'days_away', o.days_away, 'restricted_days', o.restricted_days),
               o.created_at + interval '1 day 2 hours'
        from public.forge_osha_cases o where o.id = r.osha_id;
      end if;
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- Training LMS (20261023140000): course content, quizzes, groups, kiosk and paper results.
-- Three plant courses of our own; base courses and assignments elsewhere are not touched.
-- =============================================================================

insert into public.forge_training_settings (organization_id, certificate_title, signer_name, signer_title, footer_text, updated_by, updated_at)
values ('20000000-0000-4000-8000-000000000100', 'Certificate of Completion', 'Marcus Bell', 'Safety Coordinator',
        'Cypress Bend Rice Mill · DeWitt, Arkansas', '20000000-0000-4000-8000-000000000001', now() - interval '84 days')
on conflict (organization_id) do nothing;

insert into public.forge_training_courses (id, organization_id, course_code, title, description, category_key, delivery_method, duration_minutes, validity_months, is_active, created_by, updated_by, created_at, updated_at)
values
  (demo_seed_40.cb_id(1001), '20000000-0000-4000-8000-000000000100', 'GBE-110', 'Grain Bin Entry & Engulfment Prevention',
   'Permit-required bin entry at Cypress Bend: engulfment hazards, lockout of unloading equipment, atmospheric testing, lifelines and rescue. Required before entering any bin or tank.',
   'safety', 'online', 30, 12, true, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '88 days', now() - interval '80 days'),
  (demo_seed_40.cb_id(1002), '20000000-0000-4000-8000-000000000100', 'DUST-120', 'Combustible Grain Dust & Housekeeping',
   'How grain dust explosions happen, the 1/8-inch housekeeping rule in priority areas, bucket elevator hazard monitoring and hot work controls.',
   'compliance', 'online', 25, 12, true, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '89 days', now() - interval '40 days'),
  (demo_seed_40.cb_id(1003), '20000000-0000-4000-8000-000000000100', 'FLT-130', 'Forklift & Pedestrian Safety Refresher',
   'Classroom refresher for powered industrial truck operators: pre-use inspection, pedestrian right-of-way, load handling for bagged rice and rail car dock plates. Paper quiz.',
   'equipment', 'classroom', 45, 36, true, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '60 days', now() - interval '36 days')
on conflict (id) do nothing;

-- Versions are created as drafts, filled, then published (and retired) exactly as the app does.
insert into public.forge_training_course_versions (id, organization_id, course_id, version_number, label, status, passing_percent, quiz_question_count, max_attempts, requires_acknowledgement, acknowledgement_text, effective_date, created_by, updated_by, created_at)
values
  (demo_seed_40.cb_id(1101), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(1001), 1, '2026 program', 'draft', 80, null, 3, true,
   'I will not enter a bin without a signed entry permit, a locked-out unloading auger, a tested atmosphere and an attendant outside.',
   current_date - 80, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '86 days'),
  (demo_seed_40.cb_id(1102), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(1002), 1, null, 'draft', 70, null, null, false, null,
   current_date - 86, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '88 days'),
  (demo_seed_40.cb_id(1103), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(1002), 2, 'Adds hot work controls', 'draft', 70, null, null, false, null,
   current_date - 40, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '42 days'),
  (demo_seed_40.cb_id(1104), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(1003), 1, null, 'draft', 70, null, null, false, null,
   current_date - 36, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '38 days')
on conflict (id) do nothing;

insert into public.forge_training_sections (id, organization_id, version_id, title, body, sort_order, is_required, estimated_minutes, created_at)
select demo_seed_40.cb_id(v.id), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(v.version_n), v.title, v.body, v.sort_order, true, v.minutes,
       now() - (v.days_ago || ' days')::interval
from (values
  (1201, 1101, 10, 'Why bins kill: engulfment and bridged grain',
   'Flowing rice can pull a worker under in seconds, and a buried worker cannot be pulled out by hand. Crusted or bridged grain looks solid but can collapse into the void below it. Vertical walls of grain can avalanche. Never walk on crusted grain and never enter while grain is being moved.', 8, 86),
  (1202, 1101, 20, 'Before entry: permit, lockout and atmosphere',
   'Every entry needs a signed bin entry permit. Lock out and tag the unloading auger, sweep auger and any fill conveyor with your own lock. Test oxygen, flammable gas (LEL), carbon monoxide and phosphine from outside the bin before entry and keep monitoring while inside. Run the aeration fan to ventilate.', 10, 86),
  (1203, 1101, 30, 'Inside the bin: lifeline, attendant and rescue',
   'Wear a full-body harness tied to a lifeline that keeps you above the grain surface. A trained attendant stays at the hatch the whole time with a radio and never enters to attempt rescue. If someone is engulfed, call 911 and the DeWitt Fire Department, keep everything locked out and use rescue tubes only under the incident commander.', 10, 86),
  (1204, 1102, 10, 'How grain dust explodes',
   'A dust explosion needs fuel (fine grain dust), oxygen, an ignition source, dispersion and confinement. A small primary explosion inside a bucket elevator or dust collector shakes settled dust loose and the secondary explosion is usually the one that destroys the building.', 8, 88),
  (1205, 1102, 20, 'Housekeeping and the 1/8-inch rule',
   'Priority housekeeping areas at Cypress Bend are the bucket elevator floors, the hulling and whitening floors and the tunnel galleries. Dust over 1/8 inch in these areas must be cleaned immediately. Use vacuums and brooms; compressed air only with machinery shut down and ignition sources controlled.', 8, 88),
  (1206, 1102, 30, 'Bucket elevators and hazard monitoring',
   'Legs have belt alignment and bearing temperature sensors and speed switches. A belt slip or bearing alarm means stop the leg and call maintenance. Never bypass a sensor to keep running.', 6, 88),
  (1207, 1103, 10, 'How grain dust explodes',
   'A dust explosion needs fuel (fine grain dust), oxygen, an ignition source, dispersion and confinement. A small primary explosion inside a bucket elevator or dust collector shakes settled dust loose and the secondary explosion is usually the one that destroys the building.', 8, 42),
  (1208, 1103, 20, 'Housekeeping and the 1/8-inch rule',
   'Priority housekeeping areas at Cypress Bend are the bucket elevator floors, the hulling and whitening floors and the tunnel galleries. Dust over 1/8 inch in these areas must be cleaned immediately. Use vacuums and brooms; compressed air only with machinery shut down and ignition sources controlled.', 8, 42),
  (1209, 1103, 30, 'Bucket elevators and hazard monitoring',
   'Legs have belt alignment and bearing temperature sensors and speed switches. A belt slip or bearing alarm means stop the leg and call maintenance. Never bypass a sensor to keep running.', 6, 42),
  (1210, 1103, 40, 'Hot work in grain handling areas',
   'Welding, cutting and grinding in the mill or elevator need a hot work permit from the shift supervisor. Clean dust within 35 feet, cover openings, wet down where practical, and post a fire watch during the work and for 60 minutes after.', 6, 42),
  (1211, 1104, 10, 'Classroom outline',
   'Pre-use inspection walk-through on a warehouse forklift, pedestrian right-of-way and blind corners in the bagging warehouse, travelling with 2,000-lb pallets of bagged rice, dock plates and wheel chocks at the rail car loadout. Paper quiz at the end of the session.', 45, 38)
) as v(id, version_n, sort_order, title, body, minutes, days_ago)
on conflict (id) do nothing;

insert into public.forge_training_questions (id, organization_id, version_id, stem, choices, correct_index, explanation, sort_order, created_at)
select demo_seed_40.cb_id(v.id), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(v.version_n), v.stem, v.choices, v.correct, v.explanation, v.sort_order,
       now() - (v.days_ago || ' days')::interval
from (values
  (1301, 1101, 10, 'Rice in a bin has crusted over and bridged. What is the danger?',
   array['It is safe to walk on once it has crusted', 'The crust can collapse into the void below and bury you', 'Crusted rice only affects moisture readings'], 1,
   'Bridged grain hides an empty space underneath. Never walk on it; break it up from outside the bin.', 86),
  (1302, 1101, 20, 'Before anyone enters a bin, the unloading auger must be:',
   array['Locked out and tagged with each entrant''s own lock', 'Running slowly to keep grain moving', 'Switched off at the control room screen'], 0,
   'Each entrant applies a personal lock to the auger and every other conveyor feeding or emptying the bin.', 86),
  (1303, 1101, 30, 'Which atmospheric readings are required before entry?',
   array['Oxygen only', 'None if the hatch is open', 'Oxygen, LEL, carbon monoxide and phosphine'], 2,
   'Fumigants and spoiling grain can produce toxic gases even with the hatch open.', 86),
  (1304, 1101, 40, 'Who must stay outside the bin during an entry?',
   array['Nobody, if the entrant wears a harness', 'A trained attendant with a radio who never enters to attempt rescue', 'The shift supervisor, at the start of the entry only'], 1,
   'The attendant watches the entrant the whole time and calls for rescue instead of entering.', 86),
  (1305, 1101, 50, 'If someone is engulfed, the attendant should first:',
   array['Start the auger to lower the grain', 'Climb in and dig them out', 'Call 911, keep equipment locked out and start the rescue plan'], 2,
   'Running the auger or entering makes it worse. Call for trained rescue.', 86),
  (1306, 1102, 10, 'What makes grain dust explosive?',
   array['Fine dust suspended in air near an ignition source in an enclosed space', 'Dust that has settled on the floor', 'Wet rice in a storage bin'], 0, null, 88),
  (1307, 1102, 20, 'In priority housekeeping areas, dust must be cleaned up when it exceeds:',
   array['1 inch', '1/8 inch', 'Only when visible from the control room'], 1, '29 CFR 1910.272 sets the 1/8-inch action level for priority areas.', 88),
  (1308, 1102, 30, 'A bucket elevator shows a belt slip alarm. What do you do?',
   array['Silence the alarm and keep running', 'Increase the feed rate to clear it', 'Stop the leg and report it to maintenance'], 2, null, 88),
  (1309, 1102, 40, 'Compressed air may be used to blow down dust:',
   array['Any time during production', 'Only with machinery shut down and ignition sources controlled', 'Never, only sweeping is allowed'], 1, null, 88),
  (1310, 1103, 10, 'What makes grain dust explosive?',
   array['Fine dust suspended in air near an ignition source in an enclosed space', 'Dust that has settled on the floor', 'Wet rice in a storage bin'], 0, null, 42),
  (1311, 1103, 20, 'In priority housekeeping areas, dust must be cleaned up when it exceeds:',
   array['1 inch', '1/8 inch', 'Only when visible from the control room'], 1, '29 CFR 1910.272 sets the 1/8-inch action level for priority areas.', 42),
  (1312, 1103, 30, 'A bucket elevator shows a belt slip alarm. What do you do?',
   array['Silence the alarm and keep running', 'Increase the feed rate to clear it', 'Stop the leg and report it to maintenance'], 2, null, 42),
  (1313, 1103, 40, 'Compressed air may be used to blow down dust:',
   array['Any time during production', 'Only with machinery shut down and ignition sources controlled', 'Never, only sweeping is allowed'], 1, null, 42),
  (1314, 1103, 50, 'Grinding on a conveyor in the milling building requires:',
   array['A hot work permit, dust cleanup within 35 feet and a fire watch', 'Only a face shield', 'A verbal OK from the next shift'], 0, null, 42),
  (1315, 1104, 10, 'Before each shift on a forklift you must:',
   array['Top off the hydraulic fluid', 'Complete the pre-use inspection checklist', 'Drive one lap of the warehouse'], 1, null, 38),
  (1316, 1104, 20, 'A pedestrian is in the aisle you are turning into. You:',
   array['Stop, make eye contact and let them clear', 'Sound the horn and keep going', 'Raise the forks so they can see you'], 0, null, 38),
  (1317, 1104, 30, 'A pallet of bagged rice should travel:',
   array['Raised high for visibility', 'Tilted forward to unload faster', 'Low and tilted back, 4 to 6 inches off the floor'], 2, null, 38),
  (1318, 1104, 40, 'Before driving onto a rail car from the loadout dock you confirm:',
   array['The car is chocked and the dock plate is secured', 'The horn works', 'Nothing; the dock plate is permanent'], 0, null, 38)
) as v(id, version_n, sort_order, stem, choices, correct, explanation, days_ago)
on conflict (id) do nothing;

-- Publish: DUST-120 v1, then GBE-110 v1, then DUST-120 v2 retiring v1, then FLT-130 v1.
update public.forge_training_course_versions
set status = 'published', published_at = now() - interval '86 days', published_by = '20000000-0000-4000-8000-000000000001'
where id = demo_seed_40.cb_id(1102) and status = 'draft';
update public.forge_training_course_versions
set status = 'published', published_at = now() - interval '80 days', published_by = '20000000-0000-4000-8000-000000000001'
where id = demo_seed_40.cb_id(1101) and status = 'draft';
update public.forge_training_course_versions
set status = 'retired'
where id = demo_seed_40.cb_id(1102) and status = 'published' and exists (select 1 from public.forge_training_course_versions where id = demo_seed_40.cb_id(1103) and status = 'draft');
update public.forge_training_course_versions
set status = 'published', published_at = now() - interval '40 days', published_by = '20000000-0000-4000-8000-000000000001'
where id = demo_seed_40.cb_id(1103) and status = 'draft';
update public.forge_training_course_versions
set status = 'published', published_at = now() - interval '36 days', published_by = '20000000-0000-4000-8000-000000000001'
where id = demo_seed_40.cb_id(1104) and status = 'draft';

-- Groups and required training.
insert into public.forge_training_groups (id, organization_id, name, description, is_active, created_by, updated_by, created_at)
values
  (demo_seed_40.cb_id(1401), '20000000-0000-4000-8000-000000000100', 'Bin Entry Crew', 'Dryer operators, maintenance techs and supervisors authorized to enter bins and tanks.', true,
   '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '79 days'),
  (demo_seed_40.cb_id(1402), '20000000-0000-4000-8000-000000000100', 'Mill Floor Operators', 'Hulling, whitening and grading line operators on both shifts.', true,
   '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '41 days'),
  (demo_seed_40.cb_id(1403), '20000000-0000-4000-8000-000000000100', 'Shipping & Loadout', 'Forklift, packaging and truck/rail loadout crew.', true,
   '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() - interval '37 days')
on conflict (id) do nothing;

insert into public.forge_training_group_requirements (group_id, course_id, organization_id, added_by, added_at)
values
  (demo_seed_40.cb_id(1401), demo_seed_40.cb_id(1001), '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000001', now() - interval '79 days'),
  (demo_seed_40.cb_id(1402), demo_seed_40.cb_id(1002), '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000001', now() - interval '41 days'),
  (demo_seed_40.cb_id(1403), demo_seed_40.cb_id(1003), '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000001', now() - interval '37 days')
on conflict do nothing;

insert into public.forge_training_group_members (group_id, personnel_id, organization_id, added_by, added_at)
select demo_seed_40.cb_id(v.g), ('60000000-0000-4000-8000-00000000' || v.person)::uuid, '20000000-0000-4000-8000-000000000100',
       '20000000-0000-4000-8000-000000000001', now() - (v.days_ago || ' days')::interval
from (values
  (1401,'3003',79),(1401,'3010',79),(1401,'3011',79),(1401,'3013',79),(1401,'3015',79),(1401,'3014',66),
  (1402,'3004',41),(1402,'3005',41),(1402,'3006',41),(1402,'3007',41),(1402,'3008',41),
  (1403,'3018',37),(1403,'3019',37),(1403,'3020',37),(1403,'3021',37),(1403,'3022',37),(1403,'3023',37)
) as v(g, person, days_ago)
on conflict do nothing;

-- Assignments from the group requirements (final status set by the results below).
insert into public.forge_training_assignments (id, organization_id, course_id, personnel_id, status, assigned_at, due_date, assigned_by, notes, created_at, updated_at)
select demo_seed_40.cb_id(v.id), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(v.course_n), ('60000000-0000-4000-8000-00000000' || v.person)::uuid,
       'assigned', demo_seed_40.cb_ts(v.assigned_ago, '09:05'), current_date + v.due_in, '20000000-0000-4000-8000-000000000001',
       'Assigned from training group requirements.', demo_seed_40.cb_ts(v.assigned_ago, '09:05'), demo_seed_40.cb_ts(v.assigned_ago, '09:05')
from (values
  (1501,1001,'3013',78,-48),(1502,1001,'3015',78,-48),(1503,1001,'3010',78,-48),(1504,1001,'3011',78,-48),(1505,1001,'3003',78,-48),(1506,1001,'3014',66,-36),
  (1511,1002,'3005',39,-9),(1512,1002,'3006',39,-9),(1513,1002,'3007',39,-9),(1514,1002,'3008',39,-9),(1515,1002,'3004',39,-9),
  (1521,1003,'3018',35,10),(1522,1003,'3019',35,10),(1523,1003,'3020',35,10),(1524,1003,'3021',35,10),(1525,1003,'3022',35,10),(1526,1003,'3023',35,10)
) as v(id, course_n, person, assigned_ago, due_in)
on conflict (id) do nothing;

-- Kiosk link in the break room (only the token hash is stored, as the app does).
insert into public.forge_training_portal_links (id, organization_id, title, token_hash, location_id, is_active, last_used_at, created_by, created_at, updated_at)
values (demo_seed_40.cb_id(1901), '20000000-0000-4000-8000-000000000100', 'Break room kiosk', encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'),
        '20000000-0000-4000-8000-000000000300', true, demo_seed_40.cb_ts(18, '15:20'), '20000000-0000-4000-8000-000000000001',
        now() - interval '82 days', now() - interval '82 days')
on conflict (id) do nothing;

-- A kiosk quiz attempt as forge_start/submit_training_attempt record it (actor null on the kiosk),
-- with section progress, and on a pass the completion with certificate number and expiry.
create or replace function demo_seed_40.cb_kiosk_attempt(
  p_attempt integer, p_completion integer, p_assignment integer, p_version integer, p_attempt_number integer,
  p_wrong integer, p_days_ago integer, p_time text
) returns void language plpgsql as $$
declare
  v_assignment public.forge_training_assignments;
  v_version public.forge_training_course_versions;
  v_course public.forge_training_courses;
  v_questions uuid[];
  v_answers smallint[];
  v_correct integer := 0;
  v_total integer;
  v_percent integer;
  v_started timestamptz := demo_seed_40.cb_ts(p_days_ago, p_time);
  v_submitted timestamptz := demo_seed_40.cb_ts(p_days_ago, p_time) + interval '11 minutes';
  v_completion uuid;
  q record;
  i integer := 0;
begin
  if exists (select 1 from public.forge_training_attempts where id = demo_seed_40.cb_id(p_attempt)) then return; end if;

  select * into v_assignment from public.forge_training_assignments where id = demo_seed_40.cb_id(p_assignment);
  select * into v_version from public.forge_training_course_versions where id = demo_seed_40.cb_id(p_version);
  select * into v_course from public.forge_training_courses where id = v_assignment.course_id;

  v_questions := '{}';
  v_answers := '{}';
  for q in
    select id, correct_index, cardinality(choices) as n from public.forge_training_questions
    where version_id = v_version.id and is_active order by md5(id::text || p_attempt::text)
  loop
    i := i + 1;
    v_questions := v_questions || q.id;
    if i <= p_wrong then
      v_answers := v_answers || ((q.correct_index + 1) % q.n)::smallint;
    else
      v_answers := v_answers || q.correct_index::smallint;
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_total := cardinality(v_questions);
  v_percent := round(v_correct * 100.0 / v_total);

  insert into public.forge_training_progress (assignment_id, organization_id, version_id, sections_completed, content_completed_at, first_opened_at, last_accessed_at)
  select v_assignment.id, v_assignment.organization_id, v_version.id, array_agg(s.id order by s.sort_order),
         v_started - interval '2 minutes', v_started - interval '28 minutes', v_submitted
  from public.forge_training_sections s where s.version_id = v_version.id
  on conflict (assignment_id) do update set last_accessed_at = excluded.last_accessed_at;

  insert into public.forge_training_attempts (
    id, organization_id, assignment_id, course_id, version_id, personnel_id, attempt_number, channel, status,
    question_ids, answers, score_correct, score_total, score_percent, passing_percent, passed,
    acknowledged_at, acknowledgement_text, started_at, submitted_at, started_by
  )
  values (
    demo_seed_40.cb_id(p_attempt), v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_version.id, v_assignment.personnel_id,
    p_attempt_number, 'kiosk', 'submitted', v_questions, v_answers, v_correct, v_total, v_percent, v_version.passing_percent,
    v_percent >= v_version.passing_percent,
    case when v_version.requires_acknowledgement then v_submitted end,
    case when v_version.requires_acknowledgement then v_version.acknowledgement_text end,
    v_started, v_submitted, null
  );

  if v_percent >= v_version.passing_percent then
    v_completion := demo_seed_40.cb_id(p_completion);
    insert into public.forge_training_completions (
      id, organization_id, assignment_id, course_id, personnel_id, completed_at, score, result,
      approval_status, approved_by, approved_at, certificate_number, expires_at, version_id, attempt_id, source,
      created_by, updated_by, created_at, updated_at
    )
    values (
      v_completion, v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_assignment.personnel_id, v_submitted, v_percent, 'passed',
      'approved', null, v_submitted, public.next_forge_training_certificate_number(v_assignment.organization_id),
      case when v_course.validity_months is not null then (v_submitted::date + make_interval(months => v_course.validity_months))::date end,
      v_version.id, demo_seed_40.cb_id(p_attempt), 'kiosk', null, null, v_submitted, v_submitted
    );
    update public.forge_training_attempts set completion_id = v_completion where id = demo_seed_40.cb_id(p_attempt);
    update public.forge_training_assignments set status = 'completed', updated_at = v_submitted where id = v_assignment.id;
  else
    update public.forge_training_assignments set status = 'in_progress', updated_at = v_submitted where id = v_assignment.id and status in ('assigned', 'overdue');
  end if;
end;
$$;

-- A paper result as forge_record_paper_training_result records it (entered by the trainer).
create or replace function demo_seed_40.cb_paper_result(
  p_attempt integer, p_completion integer, p_assignment integer, p_version integer, p_percent integer, p_days_ago integer
) returns void language plpgsql as $$
declare
  v_assignment public.forge_training_assignments;
  v_version public.forge_training_course_versions;
  v_course public.forge_training_courses;
  v_on timestamptz := (current_date - p_days_ago)::timestamptz;
  v_admin uuid := '20000000-0000-4000-8000-000000000001';
begin
  if exists (select 1 from public.forge_training_attempts where id = demo_seed_40.cb_id(p_attempt)) then return; end if;

  select * into v_assignment from public.forge_training_assignments where id = demo_seed_40.cb_id(p_assignment);
  select * into v_version from public.forge_training_course_versions where id = demo_seed_40.cb_id(p_version);
  select * into v_course from public.forge_training_courses where id = v_assignment.course_id;

  insert into public.forge_training_attempts (
    id, organization_id, assignment_id, course_id, version_id, personnel_id, attempt_number, channel, status,
    score_percent, passing_percent, passed, started_at, submitted_at, entered_by
  )
  values (
    demo_seed_40.cb_id(p_attempt), v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_version.id, v_assignment.personnel_id,
    (select coalesce(max(attempt_number), 0) + 1 from public.forge_training_attempts where assignment_id = v_assignment.id),
    'paper', 'submitted', p_percent, v_version.passing_percent, p_percent >= v_version.passing_percent, v_on, v_on, v_admin
  );

  if p_percent >= v_version.passing_percent then
    insert into public.forge_training_completions (
      id, organization_id, assignment_id, course_id, personnel_id, completed_at, score, result,
      approval_status, approved_by, approved_at, certificate_number, expires_at, version_id, attempt_id, source,
      created_by, updated_by, created_at, updated_at
    )
    values (
      demo_seed_40.cb_id(p_completion), v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_assignment.personnel_id, v_on, p_percent, 'passed',
      'approved', v_admin, demo_seed_40.cb_ts(p_days_ago, '16:40'), public.next_forge_training_certificate_number(v_assignment.organization_id),
      case when v_course.validity_months is not null then (v_on::date + make_interval(months => v_course.validity_months))::date end,
      v_version.id, demo_seed_40.cb_id(p_attempt), 'paper', v_admin, v_admin, demo_seed_40.cb_ts(p_days_ago, '16:40'), demo_seed_40.cb_ts(p_days_ago, '16:40')
    );
    update public.forge_training_attempts set completion_id = demo_seed_40.cb_id(p_completion) where id = demo_seed_40.cb_id(p_attempt);
    update public.forge_training_assignments set status = 'completed', updated_at = demo_seed_40.cb_ts(p_days_ago, '16:40') where id = v_assignment.id;
  end if;
end;
$$;

-- Results in date order (certificate numbers follow completion order).
--                          attempt completion assignment version try wrong days_ago time
select demo_seed_40.cb_kiosk_attempt(1601, 1701, 1501, 1101, 1, 0, 71, '13:10');  -- Earl Broussard 100%
select demo_seed_40.cb_kiosk_attempt(1602, null, 1502, 1101, 1, 2, 69, '19:40');  -- Darnell Hayes 60%, not passed
select demo_seed_40.cb_kiosk_attempt(1603, 1703, 1502, 1101, 2, 1, 68, '19:15');  -- Darnell Hayes 80%
select demo_seed_40.cb_kiosk_attempt(1604, 1704, 1503, 1101, 1, 0, 62, '12:35');  -- Hector Ramos 100%
select demo_seed_40.cb_kiosk_attempt(1605, 1705, 1504, 1101, 1, 1, 61, '12:50');  -- Travis Guidry 80%
select demo_seed_40.cb_paper_result(1606, 1706, 1505, 1101, 92, 58);              -- Ray Thibodeaux, paper 92%
select demo_seed_40.cb_kiosk_attempt(1611, 1711, 1511, 1103, 1, 0, 33, '13:20');  -- Luis Hernandez 100%
select demo_seed_40.cb_kiosk_attempt(1612, 1712, 1512, 1103, 1, 1, 30, '14:05');  -- Kevin Doucet 80%
select demo_seed_40.cb_kiosk_attempt(1615, 1715, 1515, 1103, 1, 0, 27, '21:30');  -- Tamika Wright 100%
select demo_seed_40.cb_paper_result(1622, 1722, 1522, 1104, 88, 21);              -- Curtis Landry 88%
select demo_seed_40.cb_paper_result(1623, 1723, 1523, 1104, 96, 21);              -- Maria Gonzalez 96%
select demo_seed_40.cb_paper_result(1624, 1724, 1524, 1104, 76, 21);              -- Tyrone Jackson 76%
select demo_seed_40.cb_paper_result(1625, 1725, 1525, 1104, 100, 21);             -- Billy Hebert 100%
select demo_seed_40.cb_paper_result(1626, null, 1526, 1104, 64, 21);              -- Gary Simoneaux 64%, retake needed
select demo_seed_40.cb_kiosk_attempt(1613, null, 1513, 1103, 1, 2, 18, '20:45');  -- Brianna Sims 60%, not passed

-- Shelby Arceneaux started the bin entry course on the kiosk but has not finished the sections (overdue).
insert into public.forge_training_progress (assignment_id, organization_id, version_id, sections_completed, content_completed_at, first_opened_at, last_accessed_at)
values (demo_seed_40.cb_id(1506), '20000000-0000-4000-8000-000000000100', demo_seed_40.cb_id(1101),
        array[demo_seed_40.cb_id(1201), demo_seed_40.cb_id(1202)], null, demo_seed_40.cb_ts(41, '12:20'), demo_seed_40.cb_ts(40, '12:45'))
on conflict (assignment_id) do nothing;
update public.forge_training_assignments set status = 'in_progress', updated_at = demo_seed_40.cb_ts(41, '12:20')
where id = demo_seed_40.cb_id(1506) and status = 'assigned';

drop function if exists demo_seed_40.cb_kiosk_attempt(integer, integer, integer, integer, integer, integer, integer, text);
drop function if exists demo_seed_40.cb_paper_result(integer, integer, integer, integer, integer, integer);
drop function if exists demo_seed_40.cb_wc_days(uuid);
drop function if exists demo_seed_40.cb_id(integer);
drop function if exists demo_seed_40.cb_ts(integer, text);

drop schema if exists demo_seed_40 cascade;
